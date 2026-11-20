import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Accounts } from '../lib/accounts.mjs';
import { Store } from '../lib/store.mjs';

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('HTTP routes protect the original admin panel and isolate public account workspaces', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-http-'));
  const accounts = new Accounts(dir);
  const password = 'a private test password';
  await accounts.create({ name: 'Owner', email: 'owner@example.com', password }, { admin: true });
  const legacy = new Store(dir);
  legacy.update(state => state.materials.push({ id: 'legacy-note', name: 'Existing admin notes', files: [] }));
  const port = await freePort();
  const friendPort = await freePort();
  const mobilePort = await freePort();
  const mobileBase = `http://127.0.0.1:${mobilePort}`;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--friend-port', String(friendPort), '--mobile-port', String(mobilePort), '--mobile-origin', mobileBase], {
    cwd: path.resolve(new URL('..', import.meta.url).pathname),
    env: { ...process.env, RRB_DATA_DIR: dir, FRIEND_BIND: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('MockTaste is ready')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  const request = (route, { cookie, body, method = body ? 'POST' : 'GET', origin = base } = {}) => fetch(`${base}${route}`, {
    method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), origin }, body: body ? JSON.stringify(body) : undefined,
  });
  const signup = async (email, role = 'student') => {
    const response = await request('/api/account/signup', { body: { name: 'Learner', email, password, role, timeZone: 'Asia/Kolkata' } });
    assert.equal(response.status, 201);
    return response.headers.get('set-cookie').split(';')[0];
  };
  assert.equal((await request('/')).status, 200);
  for (const route of ['/design-system', '/design-system/']) {
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /MockTaste UI/);
  }
  for (const file of ['tokens.css', 'components.css', 'patterns.css']) {
    const response = await request(`/design-system/${file}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/css/);
  }
  assert.equal((await request('/design-system/private.json')).status, 404);
  assert.equal((await request('/design-system/..%2f..%2fserver.mjs')).status, 404);
  assert.equal((await request('/admin')).status, 302);
  for (const route of ['/api/status', '/api/materials', '/api/export', '/api/student/state']) assert.equal((await request(route)).status, 401);
  const alice = await signup('alice@example.com');
  const bob = await signup('bob@example.com');
  const nativeLogin = await fetch(`${mobileBase}/api/mobile/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@example.com', password }) });
  assert.equal(nativeLogin.status, 200);
  const nativeSession = await nativeLogin.json();
  const nativeHeaders = { authorization: `Bearer ${nativeSession.token}` };
  assert.equal((await fetch(`${mobileBase}/api/student/state`, { headers: nativeHeaders })).status, 200);
  assert.equal((await fetch(`${mobileBase}/admin`, { headers: nativeHeaders })).status, 404);
  assert.equal((await fetch(`${mobileBase}/api/export`, { headers: nativeHeaders })).status, 404);
  assert.equal((await fetch(`${mobileBase}/api/student/state`, { headers: { cookie: alice } })).status, 401);
  const teacher = await signup('teacher@example.com', 'teacher');
  const bobSocial = await (await request('/api/student/social', { cookie: bob })).json();
  assert.match(bobSocial.code, /^[A-F0-9]{10}$/);
  assert.equal((await request('/api/student/mates/request', { cookie: alice, body: { code: bobSocial.code } })).status, 201);
  const pending = (await (await request('/api/student/social', { cookie: bob })).json()).connections[0];
  assert.equal(pending.incoming, true);
  assert.equal((await request(`/api/student/mates/${pending.id}/accept`, { cookie: alice, body: {} })).status, 403);
  assert.equal((await request(`/api/student/mates/${pending.id}/accept`, { cookie: bob, body: {} })).status, 200);
  const aliceSocial = await (await request('/api/student/social', { cookie: alice })).json();
  assert.equal(aliceSocial.connections[0].status, 'accepted');
  assert.equal(aliceSocial.connections[0].streak.current, 0);
  assert.equal(JSON.stringify(aliceSocial).includes('@example.com'), false);
  assert.equal((await request('/api/student/social', { cookie: teacher })).status, 403);
  assert.equal((await request('/api/student/snaps', { cookie: alice, body: { photo: 'invalid' } })).status, 400);
  assert.equal((await request('/api/student/snaps/00000000-0000-0000-0000-000000000000/open', { cookie: bob, body: {} })).status, 404);
  const noteResponse = await request('/api/student/notes', { cookie: alice, body: { name: 'Private chemistry', text: 'Water contains hydrogen and oxygen.', subject: 'Chemistry' } });
  assert.equal(noteResponse.status, 201);
  const note = await noteResponse.json();
  assert.equal((await (await request('/api/student/state', { cookie: bob })).json()).materials.length, 0);
  assert.equal((await request(`/api/student/materials/${note.id}`, { cookie: bob, method: 'DELETE' })).status, 404);
  for (const cookie of [alice, bob, teacher]) {
    assert.equal((await request('/api/export', { cookie })).status, 403);
    assert.equal((await request('/api/friends', { cookie })).status, 403);
    assert.equal((await request('/admin', { cookie })).status, 302);
  }
  assert.equal((await request('/api/student/state', { cookie: teacher })).status, 403);
  assert.equal((await request('/api/tests/example/friend-link', { cookie: alice, body: {} })).status, 403);
  assert.equal((await request('/api/account/signup', { body: { name: 'Intruder', email: 'intruder@example.com', password, role: 'admin' } })).status, 400);
  assert.equal((await request('/api/account/signup', { origin: 'https://other.example', body: { name: 'Cross site', email: 'cross@example.com', password, role: 'student' } })).status, 400);
  const login = await request('/api/account/login', { body: { email: 'owner@example.com', password } });
  const owner = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/admin', { cookie: owner })).status, 200);
  const oldMaterials = await (await request('/api/materials', { cookie: owner })).json();
  assert.equal(oldMaterials[0].name, 'Existing admin notes');
  assert.equal(oldMaterials.some(item => item.name === 'Private chemistry'), false);
  await request('/api/account/logout', { cookie: alice, method: 'POST' });
  assert.equal((await request('/api/student/state', { cookie: alice })).status, 401);
});
