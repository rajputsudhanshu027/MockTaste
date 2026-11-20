import http from 'node:http';
import fs from 'node:fs';
import { friendPaper, publicReport, submitFriendPaper } from './lib/friends.mjs';

const css = fs.readFileSync(new URL('./public/exam.css', import.meta.url), 'utf8');
const designTokens = fs.readFileSync(new URL('./public/design-system/tokens.css', import.meta.url), 'utf8');
const logo = fs.readFileSync(new URL('./public/logo.svg', import.meta.url), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f5f5"><title>${esc(title)} · MockTaste</title><style>${designTokens}\n${css}</style></head><body><header class="exam-brand"><span class="brand-symbol" aria-hidden="true">${logo}</span><div class="brand">MockTaste</div><span class="brand-caption">Exam workspace</span></header><main>${body}</main><footer class="page-footer">RRB NTPC Undergraduate practice</footer></body></html>`;
const headers = {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function send(res, status, body) {
  res.writeHead(status, { ...headers, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
function fail(res, status, message) {
  return send(res, status, page('Exam unavailable', `<section class="card"><p class="eyebrow">${status}</p><h1>${esc(message)}</h1><p>Ask the exam creator for a new link if needed.</p></section>`));
}
function examHtml(paper) {
  const questions = paper.questions.map((q, index) => `<fieldset class="card"><legend class="question"><span class="question-index">Question ${index + 1} of ${paper.questions.length}</span>${esc(q.stem)}</legend><div class="options">${q.options.map((option, optionIndex) => `<label class="option"><input type="radio" name="q-${q.id}" value="${optionIndex}"><span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span></label>`).join('')}</div></fieldset>`).join('');
  return page(paper.title, `<section><h1>${esc(paper.title)}</h1><p class="lead">Read each question and choose one answer.</p><div class="exam-details"><span>${paper.questions.length} questions</span><span>${paper.durationMinutes} minutes suggested</span><span>Four choices per question</span></div><div class="notice"><strong>Your report stays private</strong>Your score and report go to the exam creator. You will see a submission confirmation; the creator will share your feedback separately.</div></section><form method="post" action="/exam/${paper.token}/submit"><div class="card"><h2>Before you begin</h2><label for="student-name">Your name</label><input id="student-name" name="studentName" type="text" maxlength="100" autocomplete="name" placeholder="Enter your full name" required></div>${questions}<div class="submit"><p>Check your answers before submitting. You can leave a question unanswered.</p><button type="submit">Submit paper</button></div></form>`);
}
function reportHtml(report) {
  const weak = Object.entries(report.result.byTopic || {}).filter(([, score]) => score.correct < score.possible).sort((a, b) => a[1].correct / a[1].possible - b[1].correct / b[1].possible).slice(0, 3).map(([topic]) => topic);
  const rows = Object.entries(report.result.byTopic || {}).map(([topic, score]) => `<div class="row"><span>${esc(topic)}</span><strong>${score.correct}/${score.possible}</strong></div>`).join('');
  return page('Your feedback', `<section><h1>${esc(report.studentName)}'s report</h1><p class="lead">Your results and feedback from the exam creator.</p></section><div class="card"><span class="score-label">Your score</span><div class="score">${esc(report.result.score)} / ${esc(report.result.possible)}</div><p>${report.result.correct} correct · ${report.result.wrong} incorrect · ${report.result.unanswered} unanswered</p></div><div class="card"><h2>Topics to focus on</h2><p>${weak.length ? esc(weak.join(', ')) : 'You answered every topic correctly.'}</p>${rows}</div><div class="card"><h2>Feedback from the creator</h2><p class="guidance">${esc(report.guidance)}</p></div>`);
}
async function readForm(req) {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw Object.assign(new Error('Form submission required'), { status: 415 });
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32 * 1024) throw Object.assign(new Error('Submission is too large'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
export async function handleFriendRequest(req, res, store) {
  try {
    const pathname = new URL(req.url, 'http://friend.local').pathname;
    if (req.method === 'GET' && pathname === '/fonts/public-sans.ttf') {
      const font = fs.readFileSync(new URL('./public/fonts/public-sans.ttf', import.meta.url));
      res.writeHead(200, { 'content-type': 'font/ttf', 'content-length': font.length, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
      return res.end(font);
    }
    const exam = pathname.match(/^\/exam\/([a-f0-9-]{36})$/i);
    const submit = pathname.match(/^\/exam\/([a-f0-9-]{36})\/submit$/i);
    const report = pathname.match(/^\/report\/([a-f0-9-]{36})$/i);
    if (req.method === 'GET' && exam) return send(res, 200, examHtml(friendPaper(store.state, exam[1])));
    if (req.method === 'POST' && submit) {
      const origin = req.headers.origin;
      const allowedOrigins = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`, store.state.settings.friendBaseUrl]);
      if (origin && !allowedOrigins.has(origin)) throw Object.assign(new Error('Submit the paper from its exam page'), { status: 403 });
      const paper = friendPaper(store.state, submit[1]);
      const form = await readForm(req);
      const answers = Object.fromEntries(paper.questions.map(q => [q.id, form.get(`q-${q.id}`)]));
      submitFriendPaper(store, submit[1], { studentName: form.get('studentName'), answers });
      return send(res, 200, page('Paper submitted', '<section class="card"><p class="eyebrow">Submitted</p><h1>Your paper is with the creator.</h1><p>They will review your report and send feedback when it is ready.</p></section>'));
    }
    if (req.method === 'GET' && report) return send(res, 200, reportHtml(publicReport(store.state, report[1])));
    return fail(res, 404, 'Link not found');
  } catch (error) {
    return fail(res, error.status || 400, error.message || 'Request failed');
  }
}
export function createFriendServer(store) {
  return http.createServer((req, res) => handleFriendRequest(req, res, store));
}
