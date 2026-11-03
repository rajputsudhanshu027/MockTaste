import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Accounts } from '../lib/accounts.mjs';
import { StudentWorkspaces } from '../lib/student-workspace.mjs';
import { createMobileHandler } from '../lib/mobile-api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);

test('installed Android APK supports camera, sharing, notes, tests, themes, persistence and offline sign-out', {
  skip: process.env.MOCKTASTE_ANDROID_SMOKE !== '1', timeout: 600000,
}, async t => {
  const sdk = process.env.ANDROID_HOME || path.join(root, '.android-tools/sdk');
  const serial = process.env.MOCKTASTE_ANDROID_SERIAL || 'emulator-5556';
  assert.match(serial, /^emulator-\d+$/, 'Run the destructive app-data reset only on a dedicated emulator');
  const output = path.join(root, 'artifacts/android-checks');
  fs.mkdirSync(output, { recursive: true });
  const adbPath = path.join(sdk, 'platform-tools/adb');
  const adb = async (...args) => (await execute('rtk', ['proxy', adbPath, '-s', serial, ...args], { timeout: 120000, maxBuffer: 12 * 1024 * 1024 })).stdout;
  const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let latest = '';
  let driver; const pending = []; let driverLog = '';
  function startDriver() {
    if (driver) return;
    driver = spawn('rtk', ['proxy', path.join(root, '.android-tools/ui-venv/bin/python'), path.join(root, 'scripts/android-hierarchy.py'), serial, '--stream'], { stdio: ['pipe', 'pipe', 'pipe'] });
    driver.stderr.on('data', data => { driverLog += data; });
    createInterface({ input: driver.stdout }).on('line', line => {
      const current = pending.shift(); if (!current) return;
      try { const result = JSON.parse(line); if (result.error) current.reject(new Error(result.error)); else current.resolve(result.xml); }
      catch (error) { current.reject(error); }
    });
    driver.on('exit', code => { for (const item of pending.splice(0)) item.reject(new Error(`Android UI driver exited: ${code}. ${driverLog}`)); });
    driver.on('error', error => { for (const item of pending.splice(0)) item.reject(error); });
  }
  async function nodes() {
    startDriver();
    latest = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Android UI driver timed out')), 45000);
      pending.push({ resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      driver.stdin.write('dump\n');
    });
    assert.match(latest, /<hierarchy[\s>]/, 'The UI driver returned a fresh native hierarchy');
    return [...latest.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], decode(attr[2])])));
  }
  async function waitFor(predicate, description, timeout = 30000) {
    const end = Date.now() + timeout;
    do {
      const result = await predicate();
      if (result) return result;
      await pause(350);
    } while (Date.now() < end);
    fs.writeFileSync(path.join(output, 'last-window.xml'), latest);
    throw new Error(`Android screen did not show ${description}. See artifacts/android-checks/last-window.xml`);
  }
  const findLabel = (list, label) => list.filter(node => node['content-desc'] === label).at(-1) || list.filter(node => node.text === label).at(-1)
    || list.find(node => node['content-desc']?.includes(label) || node.text?.includes(label));
  const rectangle = node => node?.bounds?.match(/\d+/g)?.map(Number);
  async function locate(label, actionable = false) {
    let misses = 0;
    return waitFor(async () => {
      const list = await nodes(); const found = findLabel(list, label);
      const scroll = list.find(item => item.scrollable === 'true' && item.class === 'android.widget.ScrollView');
      const bounds = rectangle(found); const viewport = rectangle(scroll);
      const chrome = ['Camera', 'Snaps', 'Mates', 'Study', 'Profile', 'Back', 'Refresh workspace'].includes(label);
      const y = bounds && bounds[3] > bounds[1] ? (bounds[1] + bounds[3]) / 2 : null;
      if (found && bounds[3] > bounds[1] && (!viewport || chrome || (y > viewport[1] + 8 && y < viewport[3] - 8)) && (!actionable || found.enabled !== 'false')) return found;
      if (++misses % 2 === 0 && viewport) {
        const [left, top, right, bottom] = viewport; const x = String(Math.round((left + right) / 2));
        const up = y !== null && y < top;
        await adb('shell', 'input', 'swipe', x, String(up ? top + 80 : bottom - 80), x, String(up ? bottom - 80 : top + 80), '350');
      }
      return null;
    }, JSON.stringify(label));
  }
  const visible = label => locate(label);
  async function tapNode(node) {
    const bounds = node.bounds?.match(/\d+/g)?.map(Number);
    assert.equal(bounds?.length, 4, 'Interactive node has usable bounds');
    await adb('shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2)));
  }
  async function tap(label) {
    await tapNode(await locate(label, true));
  }
  async function field(index, value) {
    const inputs = (await nodes()).filter(node => node.class === 'android.widget.EditText');
    assert.ok(inputs[index], `Input ${index} is visible`);
    await tapNode(inputs[index]);
    await adb('shell', 'input', 'text', value.replace(/ /g, '%s'));
    await adb('shell', 'input', 'keyevent', '4');
  }
  async function screenshot(name) {
    await pause(400);
    const { stdout } = await execute('rtk', ['proxy', adbPath, '-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 12 * 1024 * 1024 });
    fs.writeFileSync(path.join(output, `${name}.png`), stdout);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocktaste-android-device-'));
  const accounts = new Accounts(dir);
  const spaces = new StudentWorkspaces(dir, 'http://127.0.0.1', accounts);
  const password = randomBytes(16).toString('hex');
  const user = await accounts.create({ name: 'Android Student', email: 'android-smoke@example.test', password, role: 'student', timeZone: 'UTC' });
  const mate = await accounts.create({ name: 'Android Study Mate', email: 'android-mate@example.test', password, role: 'student', timeZone: 'UTC' });
  spaces.snaps.request(user, spaces.snaps.profile(mate).code);
  spaces.snaps.accept(mate, spaces.snaps.state.connections.at(-1).id);
  const sourceText = 'Mitochondria produce ATP through cellular respiration. Cells use ATP to power their activities.';
  const workspace = spaces.forUser(user);
  // This fixture isolates the device workflow from external AI and billing.
  // Live ChatGPT authorization and answer quality are not established by this test.
  workspace.auth.status = () => ({ connected: true });
  workspace.ai = {
    imageToText: async () => sourceText,
    request: async ({ instructions, text }) => {
      const packet = JSON.parse(text);
      if (instructions.startsWith('Independently')) return JSON.stringify({ checks: packet.questions.map(question => ({ id: question.id, valid: true })) });
      return JSON.stringify({ questions: Array.from({ length: 3 }, (_, index) => ({ stem: `Cell biology question ${index + 1}?`, options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Membrane'], answerIndex: 0, explanation: sourceText, topic: 'Cell biology', sourceId: packet.sources[0].id, sourceQuote: 'Mitochondria produce ATP through cellular respiration.' })) });
    },
  };
  workspace.store.update(state => state.tests.push({
    id: randomUUID(), title: 'Android practice', durationMinutes: 5, difficulty: 'easy', penalty: 0, createdAt: new Date().toISOString(),
    questions: [{ id: randomUUID(), stem: 'Which organelle produces ATP?', options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Membrane'], answerIndex: 0, explanation: sourceText, topic: 'Cell biology', sourceQuote: 'Mitochondria produce ATP', sourceName: 'Sample biology notes', sourceLocation: 'Paragraph 1' }],
  }));
  const server = http.createServer();
  const requests = [];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://10.0.2.2:${server.address().port}`;
  const handler = createMobileHandler({ origin, accounts, students: spaces,
    json: (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); },
    readBody: async (req, limit = 40 * 1024 * 1024) => {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request is too large'); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString() || '{}');
    },
  });
  server.on('request', (req, res) => {
    const record = { method: req.method, path: req.url }; requests.push(record);
    res.once('finish', () => { record.status = res.statusCode; });
    handler(req, res);
  });
  t.after(async () => {
    if (driver) { driver.stdin.end(); driver.kill('SIGTERM'); }
    await adb('shell', 'wm', 'size', 'reset').catch(() => {});
    await adb('shell', 'wm', 'density', 'reset').catch(() => {});
    await adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0').catch(() => {});
    await adb('shell', 'cmd', 'uimode', 'night', 'no').catch(() => {});
    await adb('shell', 'am', 'force-stop', 'com.mocktaste.student').catch(() => {});
    if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    clearInterval(spaces.timer); fs.rmSync(dir, { recursive: true, force: true });
  });
  try {
    await adb('wait-for-device');
    await waitFor(async () => (await adb('shell', 'getprop', 'sys.boot_completed')).trim() === '1', 'Android boot', 120000);
    await adb('install', '-r', path.join(root, 'artifacts/MockTaste-android-preview.apk'));
    await adb('shell', 'pm', 'clear', 'com.mocktaste.student');
    await adb('shell', 'input', 'keyevent', '82');
    await adb('shell', 'am', 'start', '-n', 'com.mocktaste.student/.MainActivity');
    await visible('Workspace address'); await screenshot('01-sign-in-light');
    await field(0, origin); await field(1, user.email); await field(2, password); await tap('Sign in');
    await tap('Enable camera');
    await tapNode(await waitFor(async () => (await nodes()).find(node => node['resource-id']?.endsWith('/permission_allow_foreground_only_button')), 'camera permission'));
    await visible('Take study photo'); await screenshot('02-camera-light');
    await tap('Take study photo'); await visible('Make my mini quiz'); await screenshot('03-photo-preview');
    await tap('Make my mini quiz');
    for (let index = 1; index <= 3; index++) {
      await visible(`Cell biology question ${index}?`); await tap('Mitochondria');
      await tap(index < 3 ? 'Next question' : 'Finish mini quiz');
    }
    await visible('Mini quiz complete'); await tap('Android Study Mate'); await tap('Send study snap');
    await visible('Sent to your study mates'); await screenshot('04-snap-sent');
    const snap = spaces.snaps.state.snaps[0];
    assert.equal(snap.deliveries.length, 1, 'Native send reaches the real backend');
    spaces.snaps.open(mate, snap.id);
    await tap('Mates'); await visible('1 day streak');
    await tap('Study'); await tap('Write a note');
    await field(0, 'Android note'); await field(1, 'Biology'); await field(2, 'Cells use ATP for energy.');
    await tap('Save note'); await visible('Android note');
    assert.equal(workspace.store.state.materials[0].extractedText, 'Cells use ATP for energy.');
    await tap('My tests'); await tap('Start'); await visible('Which organelle produces ATP?'); await tap('Mitochondria'); await tap('Submit test');
    await visible('1/1'); await screenshot('05-test-result');
    assert.equal(workspace.store.state.attempts[0].result.correct, 1);
    await adb('shell', 'input', 'keyevent', '4');
    await visible('My tests');
    await tap('Profile'); await visible('2 completed tests and mini quizzes');
    await adb('shell', 'cmd', 'uimode', 'night', 'yes');
    await adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
    await tap('Profile');
    await visible('Your practice, day by day');
    await screenshot('06-profile-dark-large-type');
    await adb('shell', 'wm', 'size', '1800x2560');
    await adb('shell', 'wm', 'density', '320');
    await tap('Profile'); await visible('Your practice, day by day');
    await screenshot('07-expanded-width-dark-large-type');
    await adb('shell', 'wm', 'size', 'reset');
    await adb('shell', 'wm', 'density', 'reset');
    await adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    await adb('shell', 'am', 'force-stop', 'com.mocktaste.student');
    await adb('shell', 'am', 'start', '-n', 'com.mocktaste.student/.MainActivity');
    await visible('Take study photo');
    await tap('Profile');
    await visible('Your AI connection');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await adb('shell', 'am', 'force-stop', 'com.mocktaste.student');
    await adb('shell', 'am', 'start', '-n', 'com.mocktaste.student/.MainActivity');
    await visible('Retry connection');
    await tap('Sign out'); await visible('Workspace address'); await screenshot('08-offline-sign-out-dark');
    const errors = await adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E');
    assert.doesNotMatch(errors, /FATAL EXCEPTION|TypeError:|ReferenceError:|Invariant Violation/);
    for (const name of ['failure.png', 'last-window.xml', 'errors.log', 'requests.json', 'practice-response.json', 'practice-window.xml']) fs.rmSync(path.join(output, name), { force: true });
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, serial, capturedAt: new Date().toISOString(), ai: 'deterministic fixture, no live AI request', checks: ['native launch', 'login', 'camera permission', 'capture and preview', 'mini quiz', 'mate selection and sending', 'shared streak', 'private notes', 'test submission and answer review', 'activity', 'dark theme and 1.3 font scale capture', 'expanded-width layout capture', 'secure session restore', 'offline sign-out', 'no fatal JS/native errors'] }, null, 2));
  } catch (error) {
    await screenshot('failure').catch(() => {});
    fs.writeFileSync(path.join(output, 'last-window.xml'), latest);
    fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
    fs.writeFileSync(path.join(output, 'driver.log'), driverLog);
    await adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E').then(log => fs.writeFileSync(path.join(output, 'errors.log'), log)).catch(() => {});
    throw error;
  }
});
