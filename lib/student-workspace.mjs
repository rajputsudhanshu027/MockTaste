import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { ChatGPTAuth } from './auth.mjs';
import { StudentAI } from './student-ai.mjs';
import { readWholeMaterial } from './extract.mjs';
import { accountError } from './accounts.mjs';
import { activityFor, generatePractice, practiceOptions } from './student-practice.mjs';
import { StudySnaps } from './study-snaps.mjs';
import { MockTestLifecycle } from './mock-test-lifecycle.mjs';

const materialView = material => ({ ...material, files: material.files.map(({ name, size }) => ({ name, size })) });

export class StudentWorkspaces {
  constructor(dataDir, baseUrl, accounts) {
    this.dataDir = dataDir;
    this.baseUrl = baseUrl;
    this.workspaces = new Map();
    this.jobs = new Map();
    this.snaps = new StudySnaps(dataDir, accounts);
    this.timer = setInterval(() => {
      for (const { testLifecycle } of this.workspaces.values()) testLifecycle.finishExpired();
    }, 15000);
    this.timer.unref();
  }

  forUser(user) {
    if (user.role !== 'student' || !/^[a-f\d-]{36}$/.test(user.id)) throw accountError('Student account required', 403);
    if (!this.workspaces.has(user.id)) {
      const dir = path.join(this.dataDir, 'accounts', 'workspaces', user.id);
      const store = new Store(dir);
      const auth = new ChatGPTAuth(dir, this.baseUrl);
      this.workspaces.set(user.id, { store, auth, ai: new StudentAI(auth), testLifecycle: new MockTestLifecycle(store) });
    }
    return this.workspaces.get(user.id);
  }

  startJob(user, task) {
    for (const [id, job] of this.jobs) if (job.status !== 'running' && Date.now() - job.createdAt > 3600000) this.jobs.delete(id);
    if ([...this.jobs.values()].some(job => job.userId === user.id && job.status === 'running')) throw accountError('Wait for your current task to finish', 409);
    const job = { id: randomUUID(), userId: user.id, status: 'running', progress: 'Starting', createdAt: Date.now() };
    this.jobs.set(job.id, job);
    Promise.resolve().then(() => task(message => { job.progress = message; })).then(result => {
      job.status = 'done'; job.result = result;
    }).catch(error => { job.status = 'error'; job.error = error.message; });
    return { jobId: job.id };
  }

  async handle(req, res, url, user, { json, readBody }) {
    const route = url.pathname.slice('/api/student'.length);
    const { store, auth, ai, testLifecycle } = this.forUser(user);
    testLifecycle.finishExpired();
    const state = store.state;
    const method = req.method;
    if (route === '/state' && method === 'GET') {
      return json(res, 200, {
        materials: state.materials.map(materialView), tests: state.tests.map(test => testLifecycle.testView(test)),
        activity: activityFor([...state.attempts, ...this.snaps.completedFor(user)], user.timeZone), auth: auth.status(), social: this.snaps.list(user),
      });
    }
    if (/^\/(social|mates|snaps)(?:\/|$)/.test(route)) return this.snaps.handle(req, res, route, user, { json, readBody, auth, ai, startJob: task => this.startJob(user, task) });
    if (route === '/auth/start' && method === 'POST') return json(res, 200, { url: auth.start() });
    if (route === '/auth/logout' && method === 'POST') { await auth.signOut(); return json(res, 200, auth.status()); }
    if (route === '/materials' && method === 'POST') {
      const body = await readBody(req);
      const material = store.addMaterial(body);
      store.update(() => { material.subject = String(body.subject || 'General').trim().slice(0, 80) || 'General'; });
      return json(res, 201, materialView(material));
    }
    if (route === '/notes' && method === 'POST') {
      const body = await readBody(req, 450000);
      const text = String(body.text || '').trim();
      const name = String(body.name || '').trim().slice(0, 160);
      if (!name || !text || text.length > 100000) throw accountError('Add a title and notes of up to 100,000 characters');
      const material = { id: randomUUID(), name, subject: String(body.subject || 'General').trim().slice(0, 80) || 'General', kind: 'note', files: [], extractedText: text, pageCount: null, skippedPages: [], createdAt: new Date().toISOString() };
      store.update(value => value.materials.unshift(material));
      return json(res, 201, materialView(material));
    }
    const materialMatch = route.match(/^\/materials\/([a-f\d-]+)(?:\/(read))?$/);
    if (materialMatch) {
      const material = state.materials.find(item => item.id === materialMatch[1]);
      if (!material) throw accountError('Material not found', 404);
      if (method === 'POST' && materialMatch[2] === 'read') {
        if (material.kind === 'note') return json(res, 200, materialView(material));
        return json(res, 202, this.startJob(user, async progress => {
          const result = await readWholeMaterial(material, store, { vision: auth.status().connected ? (bytes, mime) => ai.imageToText(bytes, mime) : null, progress });
          if (!state.materials.includes(material)) throw accountError('The document was deleted while it was being read');
          if (!result.text.trim()) throw accountError('No readable text found. Connect your AI account for scans, or paste the text as a note.');
          store.update(() => {
            material.extractedText = result.text;
            material.pageCount = result.pageCount;
            material.skippedPages = result.skippedPages;
          });
          return { materialId: material.id };
        }));
      }
      if (method === 'PATCH' && !materialMatch[2]) {
        const body = await readBody(req, 450000);
        if (body.text !== undefined && (!String(body.text).trim() || String(body.text).length > 100000)) throw accountError('Add text of up to 100,000 characters');
        store.update(() => {
          if (body.text !== undefined) material.extractedText = String(body.text).trim();
          if (body.name !== undefined) material.name = String(body.name).trim().slice(0, 160) || material.name;
          if (body.subject !== undefined) material.subject = String(body.subject).trim().slice(0, 80) || 'General';
        });
        return json(res, 200, materialView(material));
      }
      if (method === 'DELETE' && !materialMatch[2]) {
        if ([...this.jobs.values()].some(job => job.userId === user.id && job.status === 'running')) throw accountError('Wait for your current task before deleting material', 409);
        return json(res, 200, { deleted: store.deleteMaterial(material.id) });
      }
    }
    if (route === '/tests' && method === 'POST') {
      const body = await readBody(req, 16384);
      const options = practiceOptions(body);
      if (!Array.isArray(body.materialIds) || !body.materialIds.length) throw accountError('Choose study material for this test');
      const ids = [...new Set(body.materialIds)];
      const materials = ids.map(id => state.materials.find(item => item.id === id));
      if (materials.some(item => !item)) throw accountError('Material not found', 404);
      if (materials.some(item => !item.extractedText?.trim())) throw accountError('Read or add text for every selected document first');
      if (!auth.status().connected) throw accountError('Connect your own ChatGPT account in Settings to generate tests');
      return json(res, 202, this.startJob(user, async progress => {
        const test = await generatePractice({ ai, materials, options, progress });
        store.update(value => value.tests.unshift(test));
        return { testId: test.id };
      }));
    }
    const jobMatch = route.match(/^\/jobs\/([a-f\d-]+)$/);
    if (jobMatch && method === 'GET') {
      const job = this.jobs.get(jobMatch[1]);
      if (!job || job.userId !== user.id) throw accountError('Task not found', 404);
      const { userId, ...view } = job;
      return json(res, 200, view);
    }
    const testMatch = route.match(/^\/tests\/([a-f\d-]+)(?:\/(start|answers|submit))?$/);
    if (testMatch) {
      const test = state.tests.find(item => item.id === testMatch[1]);
      if (!test) throw accountError('Test not found', 404);
      if (method === 'GET' && !testMatch[2]) return json(res, 200, testLifecycle.detail(test));
      if (method === 'POST' && testMatch[2] === 'start') {
        return json(res, 200, testLifecycle.start(test));
      }
      if (method === 'POST' && ['answers', 'submit'].includes(testMatch[2])) {
        if (testMatch[2] === 'answers') {
          testLifecycle.assertCanSaveAnswers(test);
          const body = await readBody(req, 16384);
          return json(res, 200, testLifecycle.saveAnswers(test, body.answers));
        }
        const created = testLifecycle.submit(test);
        return json(res, created ? 201 : 200, testLifecycle.detail(test));
      }
    }
    throw accountError('Endpoint not found', 404);
  }
}
