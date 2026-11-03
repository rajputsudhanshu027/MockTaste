import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudySnaps, snapPhoto } from '../lib/study-snaps.mjs';
import { StudentWorkspaces } from '../lib/student-workspace.mjs';

const studyText = 'Mitochondria produce ATP through cellular respiration. Cells use ATP to power their activities. The nucleus contains genetic material.';
function jpeg() {
  const metadata = Buffer.from('Exif\0\0private GPS location');
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0); segment.writeUInt16BE(metadata.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment, metadata, Buffer.from([0xff, 0xda, 0, 2, 10, 20, 30, 40, 0xff, 0xd9])]).toString('base64');
}
const ai = {
  async imageToText(bytes) { assert.equal(bytes.includes(Buffer.from('GPS')), false); return studyText; },
  async request({ instructions, text }) {
    const packet = JSON.parse(text);
    if (instructions.startsWith('Independently')) return JSON.stringify({ checks: packet.questions.map(question => ({ id: question.id, valid: true })) });
    return JSON.stringify({ questions: Array.from({ length: 3 }, (_, index) => ({ stem: `Cell biology question ${index + 1}?`, options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Membrane'], answerIndex: 0, explanation: 'Mitochondria produce ATP through cellular respiration.', topic: 'Cell biology', sourceId: packet.sources[0].id, sourceQuote: 'Mitochondria produce ATP through cellular respiration.' })) });
  },
};
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-snaps-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const users = ['Alice', 'Bob', 'Charlie'].map(name => ({ id: randomUUID(), name, email: `${name}@example.com`, role: 'student', timeZone: 'UTC' }));
  const accounts = { state: { users } };
  const snaps = new StudySnaps(dir, accounts);
  users.forEach(user => snaps.profile(user));
  const [alice, bob, charlie] = users;
  const connect = (from = alice, to = bob) => {
    snaps.request(from, snaps.profile(to).code);
    const connection = snaps.state.connections.at(-1);
    snaps.accept(to, connection.id);
    return connection;
  };
  const create = async (owner = alice, complete = false) => {
    const { snapId } = await snaps.create(owner, { title: 'Cell biology', photo: jpeg() }, ai);
    const snap = snaps.state.snaps.find(item => item.id === snapId);
    if (complete) snaps.submit(owner, snapId, Object.fromEntries(snap.questions.map(question => [question.id, 0])));
    return snap;
  };
  return { dir, snaps, accounts, alice, bob, charlie, connect, create };
}

test('study photos remove identifying metadata and reject non-image input', () => {
  const cleaned = snapPhoto(jpeg());
  assert.equal(cleaned.includes(Buffer.from('GPS')), false);
  assert.equal(cleaned.readUInt16BE(0), 0xffd8);
  assert.equal(cleaned.readUInt16BE(cleaned.length - 2), 0xffd9);
  for (const value of ['', 'not base64', Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'), Buffer.from('not a photograph').toString('base64')]) assert.throws(() => snapPhoto(value));
});

test('JPEG metadata between progressive image scans is removed while image scan bytes survive', () => {
  const metadata = Buffer.from('Exif\0\0private GPS between scans');
  const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1, 0); marker.writeUInt16BE(metadata.length + 2, 2);
  const photo = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0, 3, 0xff, 0xd0, 4]),
    marker, metadata,
    Buffer.from([0xff, 0xda, 0, 2, 5, 6, 7, 0xff, 0xd9]),
  ]);
  const cleaned = snapPhoto(photo.toString('base64'));
  assert.equal(cleaned.includes(metadata), false);
  assert.equal(cleaned.includes(Buffer.from([1, 2, 0xff, 0, 3, 0xff, 0xd0, 4])), true);
  assert.equal(cleaned.includes(Buffer.from([5, 6, 7])), true);
  assert.equal([...cleaned].filter((value, index) => value === 0xff && cleaned[index + 1] === 0xda).length, 2);
});

test('mate connections require a valid code and the recipient’s acceptance without exposing email', t => {
  const { snaps, alice, bob, charlie } = fixture(t);
  assert.throws(() => snaps.request(alice, snaps.profile(alice).code), /rather than your own/);
  assert.throws(() => snaps.request(alice, 'UNKNOWN000'), /No student found/);
  snaps.request(alice, snaps.profile(bob).code);
  const connection = snaps.state.connections[0];
  assert.equal(connection.status, 'pending');
  assert.throws(() => snaps.accept(alice, connection.id), error => error.status === 403);
  assert.throws(() => snaps.accept(charlie, connection.id), error => error.status === 404);
  assert.throws(() => snaps.request(bob, snaps.profile(alice).code), error => error.status === 409);
  snaps.accept(bob, connection.id);
  const view = snaps.list(alice);
  assert.equal(view.connections[0].name, 'Bob');
  assert.equal(JSON.stringify(view).includes('@example.com'), false);
  assert.throws(() => snaps.profile({ ...alice, role: 'teacher' }), error => error.status === 403);
});

test('a quiz-completed snap can be sent only to accepted mates; quiz scores and answers stay private', async t => {
  const { snaps, alice, bob, charlie, connect, create } = fixture(t);
  const connection = connect();
  const snap = await create();
  const before = snaps.detail(alice, snap.id);
  assert.equal(before.questions[0].answerIndex, undefined);
  assert.equal(before.questions[0].explanation, undefined);
  assert.throws(() => snaps.detail(bob, snap.id), error => error.status === 404);
  assert.throws(() => snaps.send(alice, snap.id, [connection.id]), /Complete your three-question/);
  assert.throws(() => snaps.submit(alice, snap.id, { [snap.questions[0].id]: 0 }), /Answer all three/);
  snaps.submit(alice, snap.id, Object.fromEntries(snap.questions.map(question => [question.id, 1])));
  assert.equal(snaps.detail(alice, snap.id).attempt.result.correct, 0);
  snaps.request(alice, snaps.profile(charlie).code);
  const pending = snaps.state.connections.at(-1);
  assert.throws(() => snaps.send(alice, snap.id, [pending.id]), error => error.status === 404);
  snaps.send(alice, snap.id, [connection.id]);
  assert.equal(snaps.streak(connection).current, 0);
  assert.throws(() => snaps.photo(bob, snap.id), /Open this study snap first/);
  assert.throws(() => snaps.photo(charlie, snap.id), error => error.status === 404);
  const opened = snaps.open(bob, snap.id);
  assert.equal(opened.questions, undefined);
  assert.equal(opened.attempt, undefined);
  assert.equal(opened.sourceText, undefined);
  assert.equal(opened.ownerId, undefined);
  assert.equal(opened.count, 3);
  assert.ok(snaps.photo(bob, snap.id).length);
  assert.equal(snaps.streak(connection).current, 1);
  assert.equal(snaps.streak(connection).todayComplete, true);
  const openedAt = opened.openedAt;
  assert.equal(snaps.open(bob, snap.id).openedAt, openedAt);
  assert.equal(snaps.streak(connection).totalDays, 1);
  const sentAt = snap.deliveries[0].sentAt;
  snaps.send(alice, snap.id, [connection.id]);
  assert.equal(snap.deliveries[0].sentAt, sentAt);
  assert.throws(() => snaps.submit(charlie, snap.id, {}), error => error.status === 404);
});

test('shared streaks count one day for either direction, handle time zones and gaps, and ignore stale openings', async t => {
  const { snaps, alice, bob, connect, create } = fixture(t);
  alice.timeZone = 'Asia/Kolkata';
  const connection = connect();
  const first = await create(alice, true);
  const second = await create(bob, true);
  snaps.send(alice, first.id, [connection.id]);
  snaps.send(bob, second.id, [connection.id]);
  first.deliveries[0].sentAt = '2026-12-31T20:00:00Z'; first.deliveries[0].openedAt = '2026-12-31T21:00:00Z';
  second.deliveries[0].sentAt = '2027-01-02T08:00:00Z'; second.deliveries[0].openedAt = '2027-01-02T09:00:00Z';
  const current = snaps.streak(connection, new Date('2027-01-02T10:00:00Z'));
  assert.equal(current.current, 2);
  assert.equal(current.longest, 2);
  assert.equal(current.timeZone, 'Asia/Kolkata');
  assert.equal(snaps.streak(connection, new Date('2027-01-04T10:00:00Z')).current, 0);
  second.deliveries[0].openedAt = '2027-01-03T09:00:00Z';
  assert.equal(snaps.streak(connection, new Date('2027-01-03T10:00:00Z')).totalDays, 1);
  assert.equal(snaps.streak(connection, new Date('2027-01-03T10:00:00Z')).current, 0);
});

test('deleting a snap removes content and access while preserving earned activity and streak history', async t => {
  const { dir, snaps, accounts, alice, bob, connect, create } = fixture(t);
  const connection = connect();
  const snap = await create(alice, true);
  snaps.send(alice, snap.id, [connection.id]); snaps.open(bob, snap.id);
  assert.equal(snaps.completedFor(alice).length, 1);
  snaps.remove(alice, snap.id);
  assert.equal(fs.existsSync(path.join(snaps.dir, `${snap.id}.jpg`)), false);
  assert.equal(snap.sourceText, '');
  assert.equal(snap.questions.length, 0);
  assert.throws(() => snaps.detail(bob, snap.id), error => error.status === 404);
  assert.equal(snaps.list(bob).received.length, 0);
  assert.equal(snaps.completedFor(alice).length, 1);
  assert.equal(snaps.streak(connection).totalDays, 1);
  const reloaded = new StudySnaps(dir, accounts);
  assert.equal(reloaded.streak(connection).totalDays, 1);
  assert.equal(reloaded.completedFor(alice).length, 1);
});

test('removing a mate revokes photo access and resending a used snap cannot renew a streak', async t => {
  const { snaps, alice, bob, charlie, connect, create } = fixture(t);
  const first = connect(); const second = connect(alice, charlie);
  const snap = await create(alice, true);
  snaps.send(alice, snap.id, [first.id]); snaps.open(bob, snap.id);
  assert.throws(() => snaps.send(alice, snap.id, [second.id]), /already been sent/);
  snaps.removeConnection(bob, first.id);
  assert.throws(() => snaps.photo(bob, snap.id), error => error.status === 404);
  assert.equal(snaps.list(bob).received.length, 0);
  assert.equal(snaps.list(alice).connections.some(item => item.id === first.id), false);
});

test('generation fails closed when a photo cannot support a complete mini quiz', async t => {
  const { snaps, alice } = fixture(t);
  await assert.rejects(snaps.create(alice, { photo: jpeg() }, { imageToText: async () => 'too little' }), /enough study text/);
  await assert.rejects(snaps.create(alice, { photo: jpeg() }, { imageToText: async () => studyText, request: async () => '{"questions":[]}' }), /No supported questions/);
  assert.equal(snaps.state.snaps.length, 0);
});

test('student API routes generate private mini quizzes as owned jobs and add one personal practice activity', async t => {
  const { dir, accounts, alice, bob } = fixture(t);
  const spaces = new StudentWorkspaces(dir, 'http://127.0.0.1:4173', accounts);
  t.after(() => clearInterval(spaces.timer));
  const own = spaces.forUser(alice);
  own.ai = ai; own.auth.status = () => ({ connected: true });
  const request = async (user, method, route, body) => {
    let response;
    await spaces.handle({ method }, {}, new URL(`/api/student${route}`, 'http://127.0.0.1:4173'), user, {
      json: (res, status, value) => { response = { status, value }; }, readBody: async () => body,
    });
    return response;
  };
  const job = await request(alice, 'POST', '/snaps', { title: 'Biology study moment', photo: jpeg() });
  assert.equal(job.status, 202);
  await new Promise(resolve => setImmediate(resolve));
  const task = (await request(alice, 'GET', `/jobs/${job.value.jobId}`)).value;
  assert.equal(task.status, 'done', task.error);
  await assert.rejects(request(bob, 'GET', `/jobs/${job.value.jobId}`), error => error.status === 404);
  const snap = (await request(alice, 'GET', `/snaps/${task.result.snapId}`)).value;
  assert.equal(snap.questions.length, 3);
  assert.equal(snap.questions[0].answerIndex, undefined);
  await assert.rejects(request(bob, 'GET', `/snaps/${snap.id}`), error => error.status === 404);
  assert.equal((await request(alice, 'GET', '/state')).value.activity.total, 0);
  await request(alice, 'POST', `/snaps/${snap.id}/submit`, { answers: Object.fromEntries(snap.questions.map(question => [question.id, 0])) });
  await request(alice, 'POST', `/snaps/${snap.id}/submit`, { answers: {} });
  const state = (await request(alice, 'GET', '/state')).value;
  assert.equal(state.activity.total, 1);
  assert.equal(state.tests.length, 0);
  assert.equal(state.social.own[0].completed, true);
  assert.equal(state.social.own[0].questions, undefined);
  assert.equal((await request(bob, 'GET', '/state')).value.social.own.length, 0);
  await assert.rejects(request(bob, 'POST', '/snaps', { photo: jpeg() }), /Connect your own/);
});
