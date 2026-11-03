import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Accounts } from '../lib/accounts.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const accounts = new Accounts(process.env.RRB_DATA_DIR || path.join(root, 'data'));
const email = process.argv[2];
const name = process.argv[3] || 'Administrator';
if (!email) {
  console.error('Usage: node scripts/create-admin.mjs email@example.com "Your name"');
  process.exitCode = 1;
} else {
  let hidden = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  try {
    process.stdout.write('New password (10–128 characters): ');
    hidden = true;
    const password = await prompt.question('');
    process.stdout.write('\nConfirm password: ');
    const confirmation = await prompt.question('');
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('Passwords do not match');
    await accounts.create({ email, name, password, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, { admin: true });
    console.log('Admin created. Restart the app, then sign in with this email and password.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { hidden = false; prompt.close(); }
}
