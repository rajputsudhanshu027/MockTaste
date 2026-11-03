import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Store } from './lib/store.mjs';
import { ChatGPTAuth } from './lib/auth.mjs';
import { ChatGPTAI } from './lib/ai.mjs';
import { extractMaterial, readWholeMaterial } from './lib/extract.mjs';
import { analyzeMaterials } from './lib/material-topics.mjs';
import { fetchApproved, paperLinksFromHtml, parseColorPaperQuestions } from './lib/sources.mjs';
import { APPROVED_HOSTS, allowedSource, isSundayEvening, scoreQuestions, validateQuestion } from './lib/core.mjs';
import { generateTest } from './lib/generate.mjs';
import { createFriendLink, revokeFriendLink, friendReportDetail, saveGuidance, revokeFriendReport } from './lib/friends.mjs';
import { createReportPdf, reportFilename } from './lib/report-pdf.mjs';
import { createFriendServer } from './friend-server.mjs';
import { FriendTunnel } from './lib/tunnel.mjs';
import { Accounts, sessionCookie } from './lib/accounts.mjs';
import { StudentWorkspaces } from './lib/student-workspace.mjs';
import { createMobileHandler, mobileOrigin } from './lib/mobile-api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const options = parseArgs({ options: { port: { type: 'string' }, 'friend-port': { type: 'string' }, 'mobile-port': { type: 'string' }, 'mobile-origin': { type: 'string' }, 'mobile-bind': { type: 'string' } } }).values;
const port = Number(options.port || process.env.PORT || 4173);
const friendPort = Number(options['friend-port'] || process.env.FRIEND_PORT || port + 1);
const friendBind = process.env.FRIEND_BIND || '0.0.0.0';
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = process.env.RRB_DATA_DIR || path.join(root, 'data');
const store = new Store(dataDir);
const auth = new ChatGPTAuth(dataDir, baseUrl);
const ai = new ChatGPTAI(auth);
const jobs = new Map();
const friendTunnel = new FriendTunnel(friendPort);
const accounts = new Accounts(dataDir);
const students = new StudentWorkspaces(dataDir, baseUrl, accounts);
const mobilePort = Number(options['mobile-port'] || process.env.MOBILE_PORT || 0);
if (!Number.isInteger(mobilePort) || mobilePort < 0 || mobilePort > 65535 || (mobilePort && (mobilePort === port || mobilePort === friendPort))) throw new Error('Choose a separate mobile port between 1 and 65535');
const mobileBase = mobilePort ? mobileOrigin(options['mobile-origin'] || process.env.MOBILE_ORIGIN || `http://127.0.0.1:${mobilePort}`) : null;

function friendAddresses() {
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal).map((item) => `http://${item.address}:${friendPort}`);
  return [...new Set(addresses)];
}

function friendBaseUrl() {
  const saved = store.state.settings.friendBaseUrl || process.env.FRIEND_BASE_URL || '';
  const configured = saved && !new URL(saved).hostname.endsWith('.trycloudflare.com') ? saved : '';
  return checkedFriendBase(friendTunnel.url || configured || friendAddresses()[0] || `http://127.0.0.1:${friendPort}`);
}

function checkedFriendBase(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('Enter a full http:// or https:// address'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a server address without a path, query, or password');
  return url.origin;
}

function friendUrl(kind, token) { return `${friendBaseUrl()}/${kind}/${token}`; }

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function fail(res, error) {
  const status = error.status || (error.message?.includes('not found') ? 404 : 400);
  json(res, status, { error: error.message || 'Request failed' });
}

async function readBody(req, max = 45 * 1024 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON request required');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON'); }
}

function ensureOrigin(req) {
  const origin = req.headers.origin;
  if (origin && origin !== baseUrl) throw new Error('Request origin is not allowed');
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}`) throw new Error('Use the local app address');
}

function jobStart(task) {
  const job = { id: randomUUID(), status: 'running', progress: 'Starting', createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  const update = (message) => { job.progress = message; };
  Promise.resolve().then(() => task(update)).then((result) => {
    job.status = 'done'; job.result = result;
  }).catch((error) => {
    job.status = 'error'; job.error = error.message || String(error);
  });
  return job;
}

function materialView(material) {
  return { ...material, files: material.files.map(({ name, size }) => ({ name, size })) };
}

function testSummary(test) {
  return {
    id: test.id, kind: test.kind, title: test.title || null, createdAt: test.createdAt, status: test.status,
    count: test.questions.length, retryCount: test.retryQuestions.length,
    durationMinutes: test.durationMinutes, pastPaperCount: test.pastPaperCount,
    requestedCount: test.requestedCount, topics: test.topics, notice: test.notice || null,
    attemptId: store.state.attempts.find((attempt) => attempt.testId === test.id)?.id || null,
  };
}

function questionForRunner(question) {
  const { id, stem, options, topic, section, provenance } = question;
  return { id, stem, options, topic, section, provenance };
}

function findTest(id) {
  const test = store.state.tests.find((item) => item.id === id);
  if (!test) throw new Error('Test not found');
  return test;
}

function findAttempt(id) {
  const attempt = store.state.attempts.find((item) => item.id === id);
  if (!attempt) throw new Error('Attempt not found');
  return attempt;
}

function resultFor(test, attempt) {
  return { test: testSummary(test), questions: test.questions, retryQuestions: test.retryQuestions, attempt };
}

function allHosts() { return [...APPROVED_HOSTS, ...(store.state.settings.approvedHosts || [])]; }

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;
  if (method !== 'GET') ensureOrigin(req);

  if (pathname === '/api/status' && method === 'GET') {
    return json(res, 200, {
      auth: auth.status(), reminder: isSundayEvening(),
      materials: store.state.materials.length, pastQuestions: store.state.pastQuestions.length,
      tests: store.state.tests.length, attempts: store.state.attempts.length,
      week: store.state.weeks[0] || null,
      approvedHosts: allHosts(),
    });
  }
  if (pathname === '/api/auth/start' && method === 'POST') return json(res, 200, { url: auth.start() });
  if (pathname === '/api/auth/status' && method === 'GET') return json(res, 200, auth.status());
  if (pathname === '/api/auth/logout' && method === 'POST') { await auth.signOut(); return json(res, 200, auth.status()); }
  if (pathname === '/api/models' && method === 'GET') return json(res, 200, { models: await auth.modelList(), selected: auth.credentials?.model });
  if (pathname === '/api/models' && method === 'POST') {
    const body = await readBody(req);
    const models = await auth.modelList();
    if (!models.some((model) => model.slug === body.model)) throw new Error('Choose an available model');
    auth.setModel(body.model);
    return json(res, 200, auth.status());
  }

  if (pathname === '/api/friends' && method === 'GET') {
    return json(res, 200, {
      baseUrl: friendBaseUrl(), addresses: friendAddresses(), port: friendPort, sharingReady: Boolean(friendTunnel.url), connection: friendTunnel.status,
      links: store.state.friendLinks.filter((link) => !link.revokedAt).map((link) => {
        const test = store.state.tests.find((item) => item.id === link.testId);
        return { ...link, title: test?.title || (test?.kind === 'full' ? 'Full CBT-1 mock' : test?.kind === 'weekly' ? 'Weekly test' : test?.kind === 'topic' ? 'Topic test' : 'Practice test'), count: test?.questions.length || 0, url: friendUrl('exam', link.token), reportCount: store.state.friendReports.filter((report) => report.linkToken === link.token).length };
      }),
      reports: store.state.friendReports.map((report) => ({
        id: report.id, testId: report.testId, studentName: report.studentName,
        submittedAt: report.submittedAt, result: report.result,
        guidance: report.guidance, shared: Boolean(report.reportToken),
      })),
    });
  }
  if (pathname === '/api/friends/address' && method === 'POST') {
    const { baseUrl } = await readBody(req, 4096);
    const saved = String(baseUrl || '').trim() ? checkedFriendBase(baseUrl) : '';
    store.update((state) => { state.settings.friendBaseUrl = saved; });
    return json(res, 200, { baseUrl: friendBaseUrl() });
  }
  const friendLinkMatch = pathname.match(/^\/api\/friend-links\/([a-f\d-]+)$/);
  if (friendLinkMatch && method === 'DELETE') {
    revokeFriendLink(store, friendLinkMatch[1]);
    return json(res, 200, { revoked: true });
  }
  const friendReportMatch = pathname.match(/^\/api\/friend-reports\/([a-f\d-]+)(?:\/(guidance|share|pdf))?$/);
  if (friendReportMatch) {
    const id = friendReportMatch[1];
    if (method === 'GET' && !friendReportMatch[2]) {
      const report = friendReportDetail(store.state, id);
      return json(res, 200, { ...report, pdfUrl: `/api/friend-reports/${id}/pdf` });
    }
    if (method === 'GET' && friendReportMatch[2] === 'pdf') {
      const report = friendReportDetail(store.state, id);
      const test = findTest(report.testId);
      const pdf = await createReportPdf(report, { title: test.title || 'Mock test' });
      res.writeHead(200, {
        'content-type': 'application/pdf', 'content-length': pdf.length,
        'content-disposition': `attachment; filename="${reportFilename(report.studentName)}"`,
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
      });
      return res.end(pdf);
    }
    if (method === 'POST' && friendReportMatch[2] === 'guidance') {
      const { guidance } = await readBody(req, 8192);
      return json(res, 200, saveGuidance(store, id, guidance));
    }
    if (method === 'POST' && friendReportMatch[2] === 'share') {
      return json(res, 410, { error: 'Report links have been replaced by PDF downloads. Download the report from its review page.' });
    }
    if (method === 'DELETE' && friendReportMatch[2] === 'share') {
      revokeFriendReport(store, id);
      return json(res, 200, { revoked: true });
    }
  }

  if (pathname === '/api/materials' && method === 'GET') return json(res, 200, store.state.materials.map(materialView));
  if (pathname === '/api/materials' && method === 'POST') {
    const material = store.addMaterial(await readBody(req));
    return json(res, 201, materialView(material));
  }
  const materialMatch = pathname.match(/^\/api\/materials\/([a-f\d-]+)(?:\/(extract|prepare|analyze))?$/);
  if (materialMatch) {
    const material = store.state.materials.find((item) => item.id === materialMatch[1]);
    if (!material) throw new Error('Material not found');
    if (['prepare', 'analyze'].includes(materialMatch[2]) && method === 'POST') {
      if (!auth.status().connected) throw new Error('Connect ChatGPT in Settings to identify document topics');
      const job = jobStart(async progress => {
        if (materialMatch[2] === 'prepare') {
          const result = await readWholeMaterial(material, store, { vision: (bytes, mime) => ai.imageToText(bytes, mime), progress });
          if (!result.text.trim()) throw new Error('No readable study text found. Upload clearer pages or correct the extracted text in Study library.');
          store.update(() => {
            material.extractedText = result.text;
            material.pageCount = result.pageCount;
            material.skippedPages = result.skippedPages;
            material.selectedRange = { from: 1, to: result.pageCount };
            delete material.detectedTopics;
            delete material.analysisHash;
          });
        }
        await analyzeMaterials({ store, ai, materialIds: [material.id], progress });
        return { materialId: material.id };
      });
      return json(res, 202, { jobId: job.id });
    }
    if (materialMatch[2] === 'extract' && method === 'POST') {
      const body = await readBody(req);
      const result = await extractMaterial(material, store, {
        from: body.from, to: body.to,
        vision: auth.status().connected ? (bytes, mime) => ai.imageToText(bytes, mime) : null,
      });
      store.update(() => {
        if (result.text) material.extractedText = result.text;
        delete material.detectedTopics;
        delete material.analysisHash;
        material.pageCount = result.pageCount;
        material.skippedPages = result.skippedPages;
        material.selectedRange = { from: Number(body.from) || 1, to: Number(body.to) || result.pageCount };
      });
      return json(res, 200, materialView(material));
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      if (body.extractedText !== undefined && String(body.extractedText).length > 100000) throw new Error('Extracted text is too long');
      store.update(() => {
        if (body.extractedText !== undefined) {
          material.extractedText = String(body.extractedText);
          delete material.detectedTopics;
          delete material.analysisHash;
        }
        if (body.name !== undefined) material.name = String(body.name).slice(0, 160);
      });
      return json(res, 200, materialView(material));
    }
    if (method === 'DELETE') return json(res, 200, { deleted: store.deleteMaterial(material.id) });
  }

  if (pathname === '/api/weeks' && method === 'GET') return json(res, 200, store.state.weeks);
  if (pathname === '/api/weeks' && method === 'POST') {
    const body = await readBody(req);
    const topics = (body.topics || []).map((item) => ({ name: String(item.name || '').trim().slice(0, 100), section: item.section }))
      .filter((item) => item.name && ['awareness', 'math', 'reasoning'].includes(item.section));
    if (!topics.length) throw new Error('Add at least one studied topic');
    const now = new Date();
    const week = { id: randomUUID(), savedAt: now.toISOString(), topics, materialIds: (body.materialIds || []).filter((id) => store.state.materials.some((item) => item.id === id)) };
    store.update((state) => state.weeks.unshift(week));
    return json(res, 201, week);
  }

  if (pathname === '/api/hosts' && method === 'POST') {
    const body = await readBody(req);
    const host = String(body.host || '').toLowerCase().trim().replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || net.isIP(host) || host.includes('..')) throw new Error('Enter a public website domain');
    store.update((state) => {
      if (!state.settings.approvedHosts.includes(host) && !APPROVED_HOSTS.includes(host)) state.settings.approvedHosts.push(host);
    });
    return json(res, 200, { approvedHosts: allHosts() });
  }
  if (pathname === '/api/sources' && method === 'GET') {
    return json(res, 200, store.state.sourcePages.map(({ text, ...item }) => ({ ...item, preview: text.slice(0, 400), length: text.length })));
  }
  if (pathname === '/api/sources' && method === 'POST') {
    const body = await readBody(req);
    if (!allowedSource(body.url, allHosts())) throw new Error('Approve the source website first');
    const fetched = await fetchApproved(body.url, allHosts());
    if (fetched.text.length < 100) throw new Error('No readable source text found');
    const page = { id: randomUUID(), label: String(body.label || new URL(fetched.url).hostname).slice(0, 150), url: fetched.url, topic: String(body.topic || '').slice(0, 100), date: fetched.date, text: fetched.text.slice(0, 30000), addedAt: new Date().toISOString() };
    store.update((state) => state.sourcePages.unshift(page));
    return json(res, 201, { ...page, text: undefined });
  }
  if (pathname === '/api/sources/discover' && method === 'POST') {
    const body = await readBody(req);
    const urls = await ai.discoverUrls({ topic: String(body.topic || '').slice(0, 100), section: body.section || 'awareness', hosts: allHosts() });
    return json(res, 200, { urls });
  }
  const sourceMatch = pathname.match(/^\/api\/sources\/([a-f\d-]+)$/);
  if (sourceMatch && method === 'DELETE') {
    store.update((state) => { state.sourcePages = state.sourcePages.filter((item) => item.id !== sourceMatch[1]); });
    return json(res, 200, { deleted: true });
  }

  if (pathname === '/api/pyq/find' && method === 'GET') {
    const pages = [
      'https://prepp.in/rrb-ntpc-exam/practice_papers',
      'https://www.adda247.com/jobs/rrb-ntpc-previous-year-question-paper/',
    ];
    const links = [];
    const errors = [];
    for (const page of pages) {
      try {
        const fetched = await fetchApproved(page, allHosts());
        links.push(...paperLinksFromHtml(fetched.html || '', fetched.url, allHosts()));
      } catch (error) { errors.push(`${new URL(page).hostname}: ${error.message}`); }
    }
    return json(res, 200, { papers: [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 80), errors });
  }
  if (pathname === '/api/pyq/import' && method === 'POST') {
    if (!auth.status().connected) throw new Error('Connect your ChatGPT Plus account first');
    const body = await readBody(req);
    if (!allowedSource(body.url, allHosts())) throw new Error('Approve the paper website first');
    const job = jobStart(async (progress) => {
      progress('Downloading past paper');
      const fetched = await fetchApproved(body.url, allHosts(), 20 * 1024 * 1024);
      const paperText = fetched.answerKeyText || fetched.text;
      if (paperText.length < 300) throw new Error('Paper has no readable text');
      const provenance = ['Third-party claimed paper', 'Memory-based reconstruction'].includes(body.provenance)
        ? body.provenance : 'Third-party claimed paper';
      const label = body.label || new URL(fetched.url).hostname;
      if (fetched.answerKeyText) {
        const existing = new Set(store.state.pastQuestions.map((item) => item.stem.toLowerCase()));
        const candidates = parseColorPaperQuestions(fetched.answerKeyText).filter((item) => !existing.has(item.stem.toLowerCase()));
        if (!candidates.length) throw new Error('No new complete Mathematics or Reasoning questions with a readable answer key were found');
        let imported = 0;
        for (let offset = 0; offset < candidates.length; offset += 5) {
          progress(`Solving paper questions · ${offset}/${candidates.length}`);
          const solved = await ai.enrichColorPaperQuestions({ candidates: candidates.slice(offset, offset + 5), url: fetched.url, label, provenance });
          progress(`Checking paper answers · ${offset}/${candidates.length}`);
          const checked = await ai.auditQuestions(solved);
          store.update((state) => {
            const saved = new Set(state.pastQuestions.map((item) => item.stem.toLowerCase()));
            for (const item of checked) if (!saved.has(item.stem.toLowerCase())) {
              state.pastQuestions.push(item);
              imported++;
            }
          });
        }
        return { imported, skipped: candidates.length - imported };
      }
      const extracted = [];
      for (let offset = 0; offset < Math.min(paperText.length, 70000); offset += 14000) {
        progress(`Reading paper · ${Math.round(offset / Math.min(paperText.length, 70000) * 100)}%`);
        const chunk = paperText.slice(offset, offset + 14000);
        const parsed = await ai.parsePastPaper({ text: chunk, url: fetched.url, label, provenance });
        extracted.push(...parsed);
      }
      const unique = [...new Map(extracted.map((item) => [item.stem.toLowerCase(), item])).values()];
      const checked = [];
      for (let offset = 0; offset < unique.length; offset += 8) {
        progress(`Checking imported answers · ${offset}/${unique.length}`);
        checked.push(...await ai.auditQuestions(unique.slice(offset, offset + 8)));
      }
      store.update((state) => {
        const existing = new Set(state.pastQuestions.map((item) => item.stem.toLowerCase()));
        for (const item of checked) if (!existing.has(item.stem.toLowerCase())) state.pastQuestions.push(item);
      });
      return { imported: checked.length, skipped: extracted.length - checked.length };
    });
    return json(res, 202, { jobId: job.id });
  }
  if (pathname === '/api/pyq' && method === 'GET') return json(res, 200, { count: store.state.pastQuestions.length, questions: store.state.pastQuestions.map(({ id, stem, topic, section, provenance }) => ({ id, stem, topic, section, provenance })) });

  if (pathname === '/api/tests/generate' && method === 'POST') {
    if (!auth.status().connected) throw new Error('Connect your ChatGPT Plus account first');
    const body = await readBody(req);
    const job = jobStart(async (progress) => {
      const test = await generateTest({ store, ai, request: body, progress });
      return { testId: test.id, summary: testSummary(test) };
    });
    return json(res, 202, { jobId: job.id });
  }
  if (pathname === '/api/drafts' && method === 'GET') {
    return json(res, 200, store.state.drafts.map(({ id, request, kind, questions, target, createdAt }) => ({ id, request, kind, count: questions.length, target, createdAt })));
  }
  const jobMatch = pathname.match(/^\/api\/jobs\/([a-f\d-]+)$/);
  if (jobMatch && method === 'GET') {
    const job = jobs.get(jobMatch[1]);
    if (!job) throw new Error('Job not found');
    return json(res, 200, job);
  }
  if (pathname === '/api/tests' && method === 'GET') return json(res, 200, store.state.tests.map(testSummary));
  const testMatch = pathname.match(/^\/api\/tests\/([a-f\d-]+)(?:\/(submit|retry|friend-link))?$/);
  if (testMatch) {
    const test = findTest(testMatch[1]);
    const attempt = store.state.attempts.find((item) => item.testId === test.id);
    if (method === 'GET' && !testMatch[2]) {
      return json(res, 200, attempt ? resultFor(test, attempt) : {
        test: testSummary(test), questions: test.questions.map(questionForRunner), retryCount: test.retryQuestions.length,
      });
    }
    if (method === 'POST' && testMatch[2] === 'friend-link') {
      const link = createFriendLink(store, test.id);
      const publicAddress = await friendTunnel.ensure(`/exam/${link.token}`);
      store.update((state) => { state.settings.friendBaseUrl = publicAddress; });
      return json(res, 200, { ...link, url: friendUrl('exam', link.token) });
    }
    if (method === 'DELETE' && !testMatch[2]) {
      if (store.state.friendReports.some((report) => report.testId === test.id)) throw new Error('Keep this test while friend reports exist');
      store.update((state) => {
        state.tests = state.tests.filter((item) => item.id !== test.id);
        state.attempts = state.attempts.filter((item) => item.testId !== test.id);
        state.friendLinks = state.friendLinks.filter((item) => item.testId !== test.id);
      });
      return json(res, 200, { deleted: true });
    }
    if (method === 'POST' && testMatch[2] === 'submit') {
      if (attempt) throw new Error('This test was already submitted');
      const body = await readBody(req);
      const answers = Object.fromEntries(Object.entries(body.answers || {}).filter(([id, value]) => test.questions.some((question) => question.id === id) && (value === '' || [0, 1, 2, 3].includes(Number(value)))));
      const result = scoreQuestions(test.questions, answers);
      const saved = { id: randomUUID(), testId: test.id, answers, result, flaggedIds: [], submittedAt: new Date().toISOString(), elapsedSeconds: Math.max(0, Number(body.elapsedSeconds) || 0), retryAnswers: null, retryResult: null };
      store.update((state) => state.attempts.unshift(saved));
      return json(res, 201, resultFor(test, saved));
    }
    if (method === 'POST' && testMatch[2] === 'retry') {
      if (!attempt) throw new Error('Submit the main test first');
      const body = await readBody(req);
      const retryAnswers = body.answers || {};
      const retryResult = {
        correct: test.retryQuestions.filter((question) => Number(retryAnswers[question.id]) === question.answerIndex).length,
        possible: test.retryQuestions.length,
      };
      store.update(() => { attempt.retryAnswers = retryAnswers; attempt.retryResult = retryResult; });
      return json(res, 200, resultFor(test, attempt));
    }
  }
  const flagMatch = pathname.match(/^\/api\/attempts\/([a-f\d-]+)\/flag$/);
  if (flagMatch && method === 'POST') {
    const attempt = findAttempt(flagMatch[1]);
    const test = findTest(attempt.testId);
    const body = await readBody(req);
    if (!test.questions.some((question) => question.id === body.questionId)) throw new Error('Question not found');
    store.update(() => {
      const flagged = new Set(attempt.flaggedIds);
      if (flagged.has(body.questionId)) flagged.delete(body.questionId); else flagged.add(body.questionId);
      attempt.flaggedIds = [...flagged];
      attempt.result = scoreQuestions(test.questions, attempt.answers, attempt.flaggedIds);
    });
    return json(res, 200, resultFor(test, attempt));
  }
  if (pathname === '/api/progress' && method === 'GET') {
    const attempts = store.state.attempts.map((attempt) => {
      const test = store.state.tests.find((item) => item.id === attempt.testId);
      return test ? { id: attempt.id, testId: test.id, kind: test.kind, submittedAt: attempt.submittedAt, result: attempt.result, count: test.questions.length } : null;
    }).filter(Boolean);
    return json(res, 200, attempts);
  }
  if (pathname === '/api/export' && method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="mocktaste-export.json"', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ...store.state, materials: store.state.materials.map(materialView) }, null, 2));
  }
  throw new Error('Endpoint not found');
}

function serveStatic(res, pathname) {
  const files = { '/': 'workspace.html', '/admin': 'index.html', '/workspace.js': 'workspace.js', '/workspace.css': 'workspace.css', '/app.js': 'app.js', '/styles.css': 'styles.css', '/logo.svg': 'logo.svg', '/favicon.svg': 'favicon.svg', '/fonts/public-sans.ttf': 'fonts/public-sans.ttf' };
  const name = files[pathname];
  if (!name) return json(res, 404, { error: 'Not found' });
  const file = path.join(publicDir, name);
  if (!fs.existsSync(file)) return json(res, 404, { error: 'Not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
  res.writeHead(200, {
    'content-type': types[path.extname(file)],
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'",
    'cache-control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, baseUrl);
    ensureOrigin(req);
    if (url.pathname === '/api/account' && req.method === 'GET') return json(res, 200, { user: accounts.current(req) });
    if (url.pathname === '/api/account/signup' && req.method === 'POST') {
      accounts.limit(`signup:${req.socket.remoteAddress}`, 10, 3600000);
      const user = await accounts.create(await readBody(req, 8192));
      res.setHeader('set-cookie', sessionCookie(accounts.startSession(user.id)));
      return json(res, 201, { user });
    }
    if (url.pathname === '/api/account/login' && req.method === 'POST') {
      const body = await readBody(req, 8192);
      const { user, token } = await accounts.login(body.email, body.password, req.socket.remoteAddress);
      res.setHeader('set-cookie', sessionCookie(token));
      return json(res, 200, { user });
    }
    if (url.pathname === '/api/account/logout' && req.method === 'POST') {
      accounts.logout(req);
      res.setHeader('set-cookie', sessionCookie('', true));
      return json(res, 200, { signedOut: true });
    }
    if (url.pathname === '/auth/callback') {
      const user = accounts.require(req, ['student', 'admin']);
      const destination = user.role === 'admin' ? '/admin' : '/';
      const accountAuth = user.role === 'admin' ? auth : students.forUser(user).auth;
      try {
        await accountAuth.complete(url.searchParams);
        res.writeHead(302, { location: `${destination}?connected=1`, 'cache-control': 'no-store' });
      } catch (error) {
        res.writeHead(302, { location: `${destination}?auth_error=${encodeURIComponent(error.message)}`, 'cache-control': 'no-store' });
      }
      return res.end();
    }
    if (url.pathname.startsWith('/api/student/')) {
      const user = accounts.require(req, ['student']);
      return await students.handle(req, res, url, user, { json, readBody });
    }
    if (url.pathname.startsWith('/api/')) {
      accounts.require(req, ['admin']);
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (url.pathname === '/admin') {
      const user = accounts.current(req);
      if (!user || user.role !== 'admin') { res.writeHead(302, { location: '/', 'cache-control': 'no-store' }); return res.end(); }
    }
    return serveStatic(res, url.pathname);
  } catch (error) { return fail(res, error); }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`MockTaste is ready at ${baseUrl}\n`);
});

if (mobileBase) {
  http.createServer(createMobileHandler({ origin: mobileBase, accounts, students, json, readBody }))
    .listen(mobilePort, options['mobile-bind'] || process.env.MOBILE_BIND || '127.0.0.1', () => {
      process.stdout.write(`Student mobile API is ready at ${mobileBase}\n`);
    });
}

function stopFriendTunnel() {
  friendTunnel.stop();
  process.exit(0);
}
process.once('SIGINT', stopFriendTunnel);
process.once('SIGTERM', stopFriendTunnel);

createFriendServer(store).listen(friendPort, friendBind, () => {
  process.stdout.write(`Friend exams are served from this PC on port ${friendPort}\n`);
});
