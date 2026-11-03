import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Accounts } from '../lib/accounts.mjs';

function provision(dir, confirmation) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/create-admin.mjs', 'owner@example.com', 'Owner'], {
      cwd: path.resolve(new URL('..', import.meta.url).pathname), env: { ...process.env, RRB_DATA_DIR: dir }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let sentPassword = false;
    let sentConfirmation = false;
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Admin provisioning did not finish')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (!sentPassword && output.includes('New password')) { sentPassword = true; child.stdin.write('private admin password\n'); }
      if (!sentConfirmation && output.includes('Confirm password')) { sentConfirmation = true; child.stdin.write(`${confirmation}\n`); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); resolve({ code, output }); });
  });
}

test('private admin command confirms the password, keeps it out of output, and preserves other accounts', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-admin-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const existing = new Accounts(dir);
  await existing.create({ name: 'Student', email: 'student@example.com', password: 'private student password', role: 'student' });
  const mismatch = await provision(dir, 'different password');
  assert.equal(mismatch.code, 1);
  assert.match(mismatch.output, /Passwords do not match/);
  assert.equal(new Accounts(dir).state.users.length, 1);
  const result = await provision(dir, 'private admin password');
  assert.equal(result.code, 0);
  assert.match(result.output, /Admin created/);
  assert.equal(result.output.includes('private admin password'), false);
  const saved = new Accounts(dir);
  assert.equal(saved.state.users.length, 2);
  const login = await saved.login('owner@example.com', 'private admin password');
  assert.equal(login.user.role, 'admin');
});
