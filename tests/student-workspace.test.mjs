import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MockTestLifecycle } from '../lib/mock-test-lifecycle.mjs';
import { StudentWorkspaces } from '../lib/student-workspace.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-students-'));
  const spaces = new StudentWorkspaces(dir, 'http://127.0.0.1:4173');
  t.after(() => { clearInterval(spaces.timer); fs.rmSync(dir, { recursive: true, force: true }); });
  const alice = { id: randomUUID(), role: 'student', timeZone: 'UTC' };
  const bob = { id: randomUUID(), role: 'student', timeZone: 'UTC' };
  const request = async (user, method, route, body) => {
    let response;
    await spaces.handle({ method }, {}, new URL(`/api/student${route}`, 'http://127.0.0.1:4173'), user, {
      json: (res, status, value) => { response = { status, value }; }, readBody: async () => body,
    });
    return response;
  };
  return { spaces, dir, alice, bob, request };
}
function paper() {
  return { id: randomUUID(), title: 'Biology', durationMinutes: 5, penalty: 0, createdAt: new Date().toISOString(), questions: [{ id: randomUUID(), stem: 'Which produces ATP?', options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Lysosome'], answerIndex: 0, explanation: 'Mitochondria produce ATP.', topic: 'Biology', sourceQuote: 'Mitochondria produce ATP.' }] };
}

test('Mock Test lifecycle owns start, answer, submission, and answer visibility rules', async t => {
  const { spaces, alice } = fixture(t);
  const { store } = spaces.forUser(alice);
  const lifecycle = new MockTestLifecycle(store);
  const testPaper = paper();
  store.update(state => state.tests.push(testPaper));

  assert.equal(lifecycle.detail(testPaper, 1000).questions[0].answerIndex, undefined);
  assert.equal(lifecycle.start(testPaper, 1000).deadline, 301000);
  assert.deepEqual(lifecycle.saveAnswers(testPaper, { [testPaper.questions[0].id]: 0 }, 2000), { saved: true });
  assert.equal(lifecycle.submit(testPaper, 3000), true);
  assert.equal(lifecycle.submit(testPaper, 4000), false);

  const submitted = lifecycle.detail(testPaper, 5000);
  assert.equal(submitted.questions[0].answerIndex, 0);
  assert.equal(submitted.test.attempt.result.correct, 1);
  assert.throws(() => lifecycle.saveAnswers(testPaper, {}, 5000), /already submitted/);
});

test('Mock Test lifecycle finishes expired attempts at the original deadline once', async t => {
  const { spaces, alice } = fixture(t);
  const { store } = spaces.forUser(alice);
  const lifecycle = new MockTestLifecycle(store);
  const testPaper = paper();
  testPaper.startedAt = new Date(1000).toISOString();
  testPaper.savedAnswers = { [testPaper.questions[0].id]: 0 };
  store.update(state => state.tests.push(testPaper));

  lifecycle.finishExpired(300000);
  lifecycle.finishExpired(400000);

  assert.equal(store.state.attempts.length, 1);
  assert.equal(store.state.attempts[0].submittedAt, new Date(301000).toISOString());
  assert.equal(store.state.attempts[0].result.correct, 1);
});

test('student libraries, AI credentials, tests, jobs and activity stay separated across accounts', async t => {
  const { spaces, alice, bob, request, dir } = fixture(t);
  const note = await request(alice, 'POST', '/notes', { name: 'Biology notes', subject: 'Biology', text: 'Mitochondria produce ATP.' });
  const upload = await request(alice, 'POST', '/materials', { name: 'Pages', files: [{ name: 'page.png', base64: Buffer.from('private image').toString('base64') }] });
  const aliceSpace = spaces.forUser(alice);
  const bobSpace = spaces.forUser(bob);
  const testPaper = paper();
  aliceSpace.store.update(state => state.tests.push(testPaper));
  assert.notEqual(aliceSpace.auth.file, bobSpace.auth.file);
  assert.ok(aliceSpace.store.dir.startsWith(path.join(dir, 'accounts/workspaces', alice.id)));
  const bobState = (await request(bob, 'GET', '/state')).value;
  assert.equal(bobState.materials.length, 0);
  assert.equal(bobState.tests.length, 0);
  assert.equal(bobState.activity.total, 0);
  assert.equal(upload.value.files[0].storedName, undefined);
  await assert.rejects(request(bob, 'PATCH', `/materials/${note.value.id}`, { text: 'Overwrite' }), error => error.status === 404);
  await assert.rejects(request(bob, 'DELETE', `/materials/${upload.value.id}`), error => error.status === 404);
  await assert.rejects(request(bob, 'GET', `/tests/${testPaper.id}`), error => error.status === 404);
  const { jobId } = spaces.startJob(alice, async () => ({ done: true }));
  await assert.rejects(request(bob, 'GET', `/jobs/${jobId}`), error => error.status === 404);
  for (const route of ['/friends', `/tests/${testPaper.id}/friend-link`, '/sources', '/export']) await assert.rejects(request(alice, 'POST', route, {}), error => error.status === 404);
  assert.throws(() => spaces.forUser({ ...alice, role: 'teacher' }), error => error.status === 403);
});

test('test keys are withheld until submission, answer saves persist, and submission counts once', async t => {
  const { spaces, alice, request, dir } = fixture(t);
  const testPaper = paper();
  spaces.forUser(alice).store.update(state => state.tests.push(testPaper));
  await assert.rejects(request(alice, 'POST', `/tests/${testPaper.id}/submit`), /Start the test/);
  const start = (await request(alice, 'POST', `/tests/${testPaper.id}/start`)).value;
  assert.equal(start.questions[0].answerIndex, undefined);
  assert.equal(start.questions[0].explanation, undefined);
  assert.equal(start.questions[0].sourceQuote, undefined);
  assert.equal((await request(alice, 'POST', `/tests/${testPaper.id}/start`)).value.deadline, start.deadline);
  await assert.rejects(request(alice, 'POST', `/tests/${testPaper.id}/answers`, { answers: { [testPaper.questions[0].id]: '' } }), /Invalid answer/);
  await request(alice, 'POST', `/tests/${testPaper.id}/answers`, { answers: { [testPaper.questions[0].id]: 0 } });
  const restart = new StudentWorkspaces(dir, 'http://127.0.0.1:4173');
  t.after(() => clearInterval(restart.timer));
  assert.equal(restart.forUser(alice).store.state.tests[0].savedAnswers[testPaper.questions[0].id], 0);
  const result = (await request(alice, 'POST', `/tests/${testPaper.id}/submit`)).value;
  assert.equal(result.questions[0].answerIndex, 0);
  assert.equal(result.test.attempt.result.correct, 1);
  await request(alice, 'POST', `/tests/${testPaper.id}/submit`);
  assert.equal((await request(alice, 'GET', '/state')).value.activity.total, 1);
  await assert.rejects(request(alice, 'POST', `/tests/${testPaper.id}/answers`, { answers: {} }), /already submitted/);
});

test('expired tests finish from saved answers at their original deadline after reopening', async t => {
  const { spaces, alice, request } = fixture(t);
  const testPaper = paper();
  testPaper.startedAt = '2026-01-01T10:00:00Z';
  testPaper.savedAnswers = { [testPaper.questions[0].id]: 0 };
  spaces.forUser(alice).store.update(state => state.tests.push(testPaper));
  const detail = (await request(alice, 'POST', `/tests/${testPaper.id}/start`)).value;
  assert.equal(detail.test.attempt.submittedAt, '2026-01-01T10:05:00.000Z');
  assert.equal(detail.test.attempt.result.correct, 1);
  assert.equal((await request(alice, 'GET', '/state')).value.activity.total, 1);
});

test('material uploads and note edits do not add streak activity; generation requires own AI', async t => {
  const { alice, request } = fixture(t);
  const note = await request(alice, 'POST', '/notes', { name: 'Notes', text: 'A valid study passage.' });
  await request(alice, 'PATCH', `/materials/${note.value.id}`, { text: 'Updated private notes.', subject: 'Chemistry' });
  assert.equal((await request(alice, 'GET', '/state')).value.activity.total, 0);
  await assert.rejects(request(alice, 'POST', '/tests', { count: 5, minutes: 10, difficulty: 'easy', materialIds: [note.value.id] }), /Connect your own/);
});

test('a request that finishes reading its body after the deadline cannot change saved answers', async t => {
  const { spaces, alice, request } = fixture(t);
  const testPaper = paper();
  testPaper.startedAt = new Date().toISOString();
  testPaper.savedAnswers = {};
  spaces.forUser(alice).store.update(state => state.tests.push(testPaper));
  await assert.rejects(spaces.handle({ method: 'POST' }, {}, new URL(`http://127.0.0.1:4173/api/student/tests/${testPaper.id}/answers`), alice, {
    json() {},
    readBody: async () => {
      testPaper.startedAt = new Date(Date.now() - 10 * 60000).toISOString();
      return { answers: { [testPaper.questions[0].id]: 0 } };
    },
  }), /Time ended/);
  const result = (await request(alice, 'GET', `/tests/${testPaper.id}`)).value;
  assert.equal(result.test.attempt.result.correct, 0);
  assert.equal(result.test.attempt.result.unanswered, 1);
});
