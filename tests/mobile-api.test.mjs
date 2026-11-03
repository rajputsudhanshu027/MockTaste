import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Accounts, sessionCookie } from '../lib/accounts.mjs';
import { StudentWorkspaces } from '../lib/student-workspace.mjs';
import { createMobileHandler, mobileOrigin } from '../lib/mobile-api.mjs';
import { MobileApi, mobileSession, signOutMobile, validateApiUrl } from '../mobile/src/api.mjs';
import { submitPractice } from '../mobile/src/practice.mjs';

test('mobile client requires HTTPS except explicit private-network development addresses', () => {
  assert.equal(validateApiUrl('https://study.example/'), 'https://study.example');
  assert.equal(validateApiUrl('http://10.0.2.2:4175', true), 'http://10.0.2.2:4175');
  assert.equal(validateApiUrl('http://192.168.1.4:4175', true), 'http://192.168.1.4:4175');
  for (const address of ['http://study.example', 'https://user:password@study.example', 'https://study.example/other', 'https://study.example?token=secret', 'file:///tmp/test', 'javascript:alert(1)']) assert.throws(() => validateApiUrl(address, true));
  assert.throws(() => validateApiUrl('http://192.168.1.4:4175'));
  assert.throws(() => mobileOrigin('https://study.example/admin'));
});

test('mobile API client sends bearer tokens only to permitted API paths and recognizes expired sessions', async () => {
  let expired = 0; const calls = [];
  const client = new MobileApi('https://study.example', 'private-session', () => expired++, async (url, options) => { calls.push({ url, options }); return { ok: false, status: 401, json: async () => ({ error: 'Session expired' }) }; });
  await assert.rejects(client.student('/state'), /Session expired/);
  assert.equal(calls[0].options.headers.authorization, 'Bearer private-session');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(expired, 1);
  await assert.rejects(client.request('/api/mobile/login', { publicRequest: true, method: 'POST', body: { email: 'student@example.com' } }));
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert.equal(expired, 1);
  await assert.rejects(client.request('https://other.example/api/student/state'));
  assert.throws(() => client.image('https://other.example/private-photo'));
  const photo = client.image('/api/student/snaps/1234-abcd/photo');
  assert.equal(photo.headers.authorization, 'Bearer private-session');
});

test('mobile session payloads cannot restore admin accounts or malformed tokens', () => {
  const valid = { token: 'a'.repeat(64), user: { id: 'student', name: 'Student', email: 'student@example.com', role: 'student' } };
  assert.equal(mobileSession('https://study.example', valid).base, 'https://study.example');
  assert.throws(() => mobileSession('https://study.example', { ...valid, token: 'invalid' }));
  assert.throws(() => mobileSession('https://study.example', { ...valid, user: { ...valid.user, role: 'admin' } }));
  assert.throws(() => mobileSession('https://study.example', {}));
});

test('offline sign-out clears local credentials before attempting remote revocation', async () => {
  const actions = [];
  const result = await signOutMobile({ request: async () => { actions.push('remote'); throw new Error('Offline'); } }, async () => actions.push('local'));
  assert.deepEqual(actions, ['local', 'remote']);
  assert.equal(result.revoked, false);
  const expired = await signOutMobile({ request: async () => { throw Object.assign(new Error('Expired'), { status: 401 }); } }, async () => {});
  assert.equal(expired.revoked, true);
});

test('switching test screens while saves finish cannot change the answers submitted for the original paper', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const answers = { a: 0 };
  const api = { student: async (route, options) => { calls.push({ route, options }); return { submitted: true }; } };
  const result = submitPractice(api, { test: { id: 'paper-a' }, deadline: 10000, clockOffset: 0 }, answers, pending, () => 5000);
  delete answers.a; answers.b = 3;
  release(); await result;
  assert.equal(calls[0].route, '/tests/paper-a/answers');
  assert.deepEqual(calls[0].options.body.answers, { a: 0 });
  assert.equal(calls[1].route, '/tests/paper-a/submit');
});

test('mobile listener isolates admin routes, ignores browser cookies, and shares private student data safely', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-mobile-'));
  const accounts = new Accounts(dir); const students = new StudentWorkspaces(dir, 'http://127.0.0.1:4173', accounts);
  t.after(() => { clearInterval(students.timer); fs.rmSync(dir, { recursive: true, force: true }); });
  const password = 'a secure mobile password';
  const owner = await accounts.create({ name: 'Owner', email: 'owner@example.com', password }, { admin: true });
  const origin = 'http://192.168.1.4:4175';
  let body;
  const handler = createMobileHandler({ origin, accounts, students, readBody: async () => body, json: (res, status, value) => { res.status = status; res.value = value; } });
  const request = async (route, options = {}) => {
    body = options.body;
    const response = {};
    await handler({ url: route, method: options.method || (body ? 'POST' : 'GET'), socket: { remoteAddress: '192.168.1.8' }, headers: { host: new URL(origin).host, ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...options.headers } }, response);
    return response;
  };
  const signup = await request('/api/mobile/signup', { body: { name: 'Student', email: 'student@example.com', password, role: 'student', timeZone: 'Asia/Kolkata' } });
  assert.equal(signup.status, 201); assert.match(signup.value.token, /^[a-f0-9]{64}$/);
  const token = signup.value.token;
  assert.equal((await request('/api/mobile/session', { token })).value.user.id, signup.value.user.id);
  assert.equal((await request('/api/student/state', { headers: { cookie: sessionCookie(token) } })).status, 401);
  assert.equal((await request('/api/mobile/login', { body: { email: owner.email, password } })).status, 403);
  const adminToken = accounts.startSession(owner.id);
  assert.equal((await request('/api/student/state', { token: adminToken })).status, 403);
  for (const route of ['/admin', '/api/export', '/api/friends', '/api/student/auth/start']) assert.equal((await request(route, { token })).status, 404);
  assert.equal((await request('/api/student/state', { token, headers: { origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await request('/api/student/state', { token, headers: { host: 'untrusted.example' } })).status, 403);
  const note = await request('/api/student/notes', { token, body: { name: 'Mobile notes', subject: 'Biology', text: 'Mitochondria produce ATP.' } });
  assert.equal(note.status, 201);
  const webUser = accounts.current({ headers: { cookie: `mocktaste_session=${token}` } });
  assert.equal(students.forUser(webUser).store.state.materials[0].name, 'Mobile notes');
  const other = await request('/api/mobile/signup', { body: { name: 'Other', email: 'other@example.com', password, role: 'student' } });
  assert.equal((await request('/api/student/state', { token: other.value.token })).value.materials.length, 0);
  assert.equal((await request(`/api/student/materials/${note.value.id}`, { token: other.value.token, method: 'DELETE' })).status, 404);
  await request('/api/mobile/logout', { token, method: 'POST' });
  assert.equal((await request('/api/mobile/session', { token })).status, 401);
});
