import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Store } from '../lib/store.mjs';
import { createFriendLink, friendPaper, friendReportDetail, publicReport, releaseFriendReport, revokeFriendLink, revokeFriendReport, saveGuidance } from '../lib/friends.mjs';
import { handleFriendRequest } from '../friend-server.mjs';

const question = {
  id: 'eeeb4ee9-b5c2-45a1-9cd1-40ac017a0e29',
  stem: 'What is 2 + 2?', options: ['3', '4', '5', '6'], answerIndex: 1,
  topic: 'Arithmetic', section: 'math', explanation: 'Add the two numbers.',
};
const testId = 'eaa923b5-1200-4bee-9845-567bf395fd5c';

async function withStore(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-friends-'));
  try {
    const store = new Store(dir);
    store.update(state => state.tests.push({ id: testId, kind: 'practice', durationMinutes: 10, questions: [question] }));
    return await run(store, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function request(store, method, url, body = '', origin = 'http://192.168.1.10:4174') {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { method, url, headers: {
    host: '192.168.1.10:4174',
    ...(method === 'POST' ? { origin, 'content-type': 'application/x-www-form-urlencoded' } : {}),
  } });
  const response = { status: null, headers: null, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(bodyText) { this.body = String(bodyText || ''); },
  };
  await handleFriendRequest(req, response, store);
  return response;
}

test('friend link serves questions, saves private report, and releases only after advice', async () => {
  await withStore(async (store, dir) => {
    const link = createFriendLink(store, testId);
    assert.equal(new Store(dir).state.friendLinks[0].token, link.token);
    assert.equal(createFriendLink(store, testId).token, link.token);

    const paper = friendPaper(store.state, link.token);
    assert.equal(paper.questions[0].stem, question.stem);
    assert.equal(paper.questions[0].answerIndex, undefined);
    const page = await request(store, 'GET', '/exam/' + link.token);
    assert.equal(page.status, 200);
    assert.match(page.body, /<div class="brand">MockTaste<\/div>/);
    assert.match(page.headers['content-security-policy'], /font-src 'self'/);
    const font = await request(store, 'GET', '/fonts/public-sans.ttf');
    assert.equal(font.status, 200);
    assert.equal(font.headers['content-type'], 'font/ttf');
    assert.match(page.body, /What is 2 \+ 2/);
    assert.doesNotMatch(page.body, /answerIndex|Add the two numbers/);
    assert.equal((await request(store, 'GET', '/api/friends')).status, 404);

    const form = new URLSearchParams({ studentName: 'Sam', ['q-' + question.id]: '0' }).toString();
    assert.equal((await request(store, 'POST', '/exam/' + link.token + '/submit', form, 'http://attacker.example')).status, 403);
    const submitted = await request(store, 'POST', '/exam/' + link.token + '/submit', form);
    assert.equal(submitted.status, 200);
    assert.match(submitted.body, /Your paper is with the creator/);
    assert.doesNotMatch(submitted.body, /0 \/ 1|Add the two numbers/);
    store.update(state => { state.settings.friendBaseUrl = 'https://example.trycloudflare.com'; });
    assert.equal((await request(store, 'POST', '/exam/' + link.token + '/submit', form, 'https://example.trycloudflare.com')).status, 200);

    const report = store.state.friendReports[0];
    assert.equal(report.result.wrong, 1);
    assert.equal(new Store(dir).state.friendReports[0].studentName, 'Sam');
    assert.equal(friendReportDetail(store.state, report.id).review[0].correct, '4');
    assert.throws(() => releaseFriendReport(store, report.id), /Write guidance/);
    saveGuidance(store, report.id, 'Revise addition.');
    const released = releaseFriendReport(store, report.id);
    const releasedToken = released.reportToken;
    assert.equal(publicReport(store.state, releasedToken).guidance, 'Revise addition.');
    const shared = await request(store, 'GET', '/report/' + releasedToken);
    assert.equal(shared.status, 200);
    assert.match(shared.body, /Revise addition/);
    revokeFriendReport(store, report.id);
    assert.equal((await request(store, 'GET', '/report/' + releasedToken)).status, 404);
    revokeFriendLink(store, link.token);
    assert.equal((await request(store, 'GET', '/exam/' + link.token)).status, 404);
  });
});
