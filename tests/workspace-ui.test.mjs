import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { activityFor } from '../lib/student-practice.mjs';

function render(view, user = null, extra = {}) {
  const root = { innerHTML: '' };
  const context = vm.createContext({
    document: { querySelector: selector => selector === '#workspace' ? root : {}, addEventListener() {} },
    window: { location: { hash: '', search: '', replace() {} } }, URLSearchParams,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: () => new Promise(() => {}),
    initialData: { user, view, data: { materials: [], tests: [], auth: { connected: false }, activity: activityFor([], 'UTC', new Date('2026-11-02T12:00:00Z')) }, ...extra },
  });
  vm.runInContext(fs.readFileSync(new URL('../public/workspace.js', import.meta.url), 'utf8'), context);
  vm.runInContext('Object.assign(state, initialData); render();', context);
  return root.innerHTML;
}
const student = { id: 'student', name: '<Sam>', email: 'sam@example.com', role: 'student', timeZone: 'UTC' };

test('signup offers only student and teacher accounts with a clear teacher status', () => {
  const html = render('home', null, { authMode: 'signup' });
  assert.match(html, /value="student"/);
  assert.match(html, /value="teacher"/);
  assert.doesNotMatch(html, /value="admin"/);
  assert.match(html, /classroom features are coming later/);
  assert.match(html, /autocomplete="new-password"/);
});

test('student screens support arbitrary subjects with no sharing controls or RRB restrictions', () => {
  for (const view of ['home', 'library', 'create', 'tests', 'settings', 'upload', 'note', 'snaps', 'mates', 'capture']) {
    const html = render(view, student);
    assert.match(html, /<h1 class="page-heading">/);
    assert.doesNotMatch(html, /Create friend link|Sharing &amp; reports|RRB|CBT|General Awareness/);
    assert.doesNotMatch(html, /<Sam>/);
    assert.match(html, /aria-label="Main navigation"/);
  }
  const home = render('home', student);
  assert.match(home, /Your workspace, &lt;Sam&gt;/);
  assert.match(home, /activity-grid/);
  assert.match(home, /View activity by date/);
  assert.equal((home.match(/<span aria-hidden="true" class="activity-day level-/g) || []).length, 371);
  assert.match(render('create', student), /Generate personal test<\/button>/);
});

test('study snap capture and mini quiz communicate the sharing gate and keep recipient views private', () => {
  const capture = render('capture', student);
  assert.match(capture, /capture="environment"/);
  assert.match(capture, /Three|three/);
  assert.match(capture, /Your answers and score stay private/);
  const questions = Array.from({ length: 3 }, (_, index) => ({ id: `q${index}`, stem: `Question ${index + 1}`, options: ['A', 'B', 'C', 'D'] }));
  const quiz = render('snap', student, { snap: { id: 'snap', title: 'Biology', own: true, count: 3, photoUrl: '/photo', sourceText: 'Study notes', questions } });
  assert.match(quiz, /Question 1 of 3/);
  assert.match(quiz, /Next question/);
  assert.doesNotMatch(quiz, /Send study snap/);
  const received = render('snap', student, { snap: { id: 'snap', title: 'Biology', own: false, from: '<Mate>', photoUrl: '/photo', count: 3 } });
  assert.match(received, /&lt;Mate&gt; shared a study moment/);
  assert.doesNotMatch(received, /Correct answer|snap-quiz-form|Send study snap/);
  assert.match(render('mates', student), /Either person can send/);
});

test('teacher accounts receive an honest placeholder without student or admin navigation', () => {
  const html = render('home', { ...student, role: 'teacher' });
  assert.match(html, /Your teacher account is ready/);
  assert.match(html, /after the teacher workflow is defined/);
  assert.doesNotMatch(html, /Create a test|Sharing|Admin panel/);
});

test('returning to capture during photo decoding enables the current page when the photo becomes ready', async () => {
  const listeners = {};
  const oldButton = { disabled: false };
  let nodes = { '#workspace': { innerHTML: '' }, '#toast': { textContent: '' }, '#make-snap': oldButton, '#photo-status': { textContent: '' }, '#snap-preview': { hidden: true } };
  let resolvePhoto;
  const pendingPhoto = new Promise(resolve => { resolvePhoto = resolve; });
  const context = vm.createContext({
    document: { querySelector: selector => nodes[selector] || null, addEventListener: (type, handler) => { listeners[type] = handler; } },
    window: { location: { hash: '', search: '' } }, URLSearchParams,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: () => new Promise(() => {}), pendingPhoto,
  });
  vm.runInContext(fs.readFileSync(new URL('../public/workspace.js', import.meta.url), 'utf8'), context);
  vm.runInContext('state.user = { id: "student", role: "student" }; state.data = { auth: { connected: true } }; preparePhoto = () => pendingPhoto;', context);
  listeners.change({ target: { id: 'snap-photo', files: [{}] } });
  assert.equal(oldButton.disabled, true);
  const currentButton = { disabled: true };
  const currentPreview = { hidden: true };
  nodes = { ...nodes, '#make-snap': currentButton, '#snap-preview': currentPreview, '#photo-status': { textContent: '' } };
  resolvePhoto('prepared-jpeg');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(currentButton.disabled, false);
  assert.equal(currentPreview.hidden, false);
  assert.equal(currentPreview.src, 'data:image/jpeg;base64,prepared-jpeg');
  assert.match(nodes['#photo-status'].textContent, /Photo ready/);
});
