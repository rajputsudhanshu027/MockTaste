import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Accounts, sessionCookie } from '../lib/accounts.mjs';

const input = (email = 'student@example.com', role = 'student') => ({ name: 'Sam', email, role, password: 'a long private password', timeZone: 'Asia/Kolkata' });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-accounts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, accounts: new Accounts(dir) };
}

test('public registration accepts student and teacher, never admin, and stores only password hashes', async t => {
  const { accounts, dir } = fixture(t);
  const student = await accounts.create(input());
  const teacher = await accounts.create(input('teacher@example.com', 'teacher'));
  assert.equal(student.role, 'student');
  assert.equal(teacher.role, 'teacher');
  assert.equal(student.passwordHash, undefined);
  assert.equal(fs.readFileSync(path.join(dir, 'accounts/accounts.json'), 'utf8').includes(input().password), false);
  await assert.rejects(accounts.create(input('intruder@example.com', 'admin')), /Choose Student or Teacher/);
  await assert.rejects(accounts.create({ ...input('bad@example.com'), password: 'short' }), /10 and 128/);
  await assert.rejects(accounts.create({ ...input('zone@example.com'), timeZone: '../../escape' }), /valid time zone/);
  assert.equal((await accounts.create(input('owner@example.com'), { admin: true })).role, 'admin');
});

test('duplicate concurrent signups cannot create two accounts', async t => {
  const { accounts } = fixture(t);
  const results = await Promise.allSettled([accounts.create(input()), accounts.create(input('STUDENT@example.com'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(accounts.state.users.length, 1);
});

test('login sessions persist, authorize roles, expire, and are revoked on logout', async t => {
  const { accounts, dir } = fixture(t);
  await accounts.create(input());
  await assert.rejects(accounts.login(input().email, 'incorrect'), error => error.status === 401);
  const { user, token } = await accounts.login(' STUDENT@example.com ', input().password);
  const req = { headers: { cookie: sessionCookie(token).split(';')[0] } };
  const reloaded = new Accounts(dir);
  assert.equal(reloaded.require(req, ['student']).id, user.id);
  assert.throws(() => reloaded.require(req, ['admin']), error => error.status === 403);
  assert.throws(() => reloaded.require({ headers: {} }, ['student']), error => error.status === 401);
  assert.equal(fs.readFileSync(reloaded.file, 'utf8').includes(token), false);
  reloaded.logout(req);
  assert.equal(new Accounts(dir).current(req), null);
  assert.match(sessionCookie(token), /HttpOnly; SameSite=Lax/);
  assert.match(sessionCookie('', true), /Max-Age=0/);
  const next = await reloaded.login(input().email, input().password);
  reloaded.state.sessions.forEach(session => { session.expiresAt = Date.now() - 1; });
  assert.equal(reloaded.current({ headers: { cookie: `mocktaste_session=${next.token}` } }), null);
});

test('repeated failed logins are throttled', async t => {
  const { accounts } = fixture(t);
  for (let index = 0; index < 8; index++) await assert.rejects(accounts.login('nobody@example.com', 'incorrect', '127.0.0.1'), error => error.status === 401);
  await assert.rejects(accounts.login('nobody@example.com', 'incorrect', '127.0.0.1'), error => error.status === 429);
});
