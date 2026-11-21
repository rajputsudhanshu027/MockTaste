const root = document.querySelector('#workspace');
const notification = document.querySelector('#toast');
const state = { user: null, authMode: 'login', view: 'home', data: null, material: null, test: null, job: null, filter: '', error: '', busy: false, submitting: false, snap: null, snapPhoto: null, snapAnswers: {}, miniIndex: 0, jobOrigin: 'library', photoBusy: false, photoRevision: 0 };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = value => new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', ...(value.length === 10 ? { timeZone: 'UTC' } : {}) });
const button = (label, action, id = '', primary = false) => `<button type="button" class="btn ${primary ? 'primary' : 'small'}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${esc(label)}</button>`;
const brand = '<a class="brand" href="/"><img class="brand-mark" src="/logo.svg" width="44" height="44" alt=""><span><strong>MockTaste</strong><small>Your study workspace</small></span></a>';
let jobTimer;
let answerQueue = Promise.resolve();

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: options.body ? { 'content-type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      clearWorkspace(); state.error = 'Your session ended. Sign in again.'; render();
    }
    throw Object.assign(new Error(data.error || 'The request could not be completed. Try again.'), { status: response.status });
  }
  return data;
}
const studentApi = (path, options) => api(`/api/student${path}`, options);
function toast(message) {
  notification.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { notification.textContent = ''; }, 6500);
}
async function perform(task) {
  if (state.busy) return;
  state.busy = true;
  const buttons = [...document.querySelectorAll('button[type="submit"]')].map(item => ({ item, disabled: item.disabled }));
  buttons.forEach(({ item }) => { item.disabled = true; });
  try { await task(); }
  catch (error) {
    state.error = error.message;
    const errorBox = document.querySelector('#form-error');
    if (errorBox) errorBox.textContent = error.message;
    if (!errorBox || state.user) toast(error.message);
  } finally {
    state.busy = false;
    buttons.forEach(({ item, disabled }) => { item.disabled = disabled; });
  }
}
async function refresh() {
  state.data = await studentApi('/state');
}
function clearWorkspace() {
  clearTimeout(jobTimer);
  state.photoRevision++;
  Object.assign(state, { user: null, data: null, material: null, test: null, job: null, snap: null, snapPhoto: null, snapAnswers: {}, miniIndex: 0, filter: '', view: 'home' });
}
function navigate(view) {
  state.view = view; state.error = '';
  window.location.hash = view === 'snap' && state.snap ? `snap/${state.snap.id}` : view;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('#main-content')?.focus({ preventScroll: true });
}

async function refreshSocialView(view) {
  if (state.busy) return;
  const previous = state.data;
  const main = document.querySelector('#main-content');
  try {
    const updated = await studentApi('/state');
    if (state.data !== previous || state.view !== view || !main.isConnected || state.busy) return;
    if (document.activeElement !== main || JSON.stringify(updated.social) === JSON.stringify(previous.social)) return;
    if (main.querySelector('#mate-form input')?.value) return;
    state.data = updated;
    render();
    document.querySelector('#main-content')?.focus({ preventScroll: true });
  } catch (error) {
    if (main.isConnected) toast(error.message);
  }
}

function authPage() {
  const signup = state.authMode === 'signup';
  const prefix = signup ? 'signup' : 'account';
  const passwordField = (id, name, label, autocomplete, hint = '') => `
    <div class="ds-field">
      <label class="ds-label" for="${id}">${label}</label>
      <div class="ds-password">
        <input class="ds-input" id="${id}" name="${name}" type="password" autocomplete="${autocomplete}"
          ${signup ? 'minlength="10"' : ''} ${hint ? `aria-describedby="${id}-hint"` : ''} maxlength="128" required>
        <button class="ds-icon-button" type="button" data-action="toggle-password" data-id="${id}"
          aria-label="Show ${label.toLowerCase()}" aria-pressed="false" aria-controls="${id}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="ds-eye-slash" d="m4 4 16 16"/></svg>
        </button>
      </div>
      ${hint ? `<span class="ds-field-note" id="${id}-hint">${hint}</span>` : ''}
    </div>`;
  root.innerHTML = `<div class="ds-page ds-page--entry" data-ds-theme="day"><main class="ds-entry ds-entry--split" id="main-content" tabindex="-1">
    <header class="ds-entry-header"><a class="ds-brand" href="/"><img src="/logo.svg" width="36" height="36" alt=""><span>MockTaste</span></a></header>
    <div class="ds-panel ds-entry-frame">
      <aside class="ds-entry-story" aria-label="About your study workspace">
        <div><p class="ds-entry-story-title">From notes to test day.</p><p class="ds-copy">Turn the material you already study into practice for your next exam.</p></div>
        <ul class="ds-entry-steps"><li>Save your study material</li><li>Make a practice test</li><li>Review your answers</li></ul>
      </aside>
      <section class="ds-entry-content" aria-labelledby="${prefix}-heading">
      <div class="ds-entry-modes" role="group" aria-label="Account options">
        <button type="button" data-action="login-mode" aria-pressed="${!signup}">Sign in</button>
        <button type="button" data-action="signup-mode" aria-pressed="${signup}">Create account</button>
      </div>
      <header class="ds-form-heading"><h1 class="ds-heading" id="${prefix}-heading">${signup ? 'Create your account' : 'Welcome back'}</h1><p class="ds-copy">${signup ? 'Set up your own study workspace.' : 'Sign in to pick up your practice.'}</p></header>
      <form id="${signup ? 'signup-form' : 'account-form'}" class="ds-form">
        ${signup ? '<div class="ds-field"><label class="ds-label" for="signup-name">Your name</label><input class="ds-input" id="signup-name" name="name" placeholder="Your name" autocomplete="name" maxlength="80" required></div>' : ''}
        <div class="ds-field"><label class="ds-label" for="${prefix}-email">Email address</label><input class="ds-input" id="${prefix}-email" name="email" type="email" placeholder="you@example.com" autocomplete="${signup ? 'email' : 'username'}" maxlength="254" required></div>
        ${signup ? `<div class="ds-form-pair">
          ${passwordField('signup-password', 'password', 'Password', 'new-password', 'At least 10 characters')}
          ${passwordField('signup-confirm', 'confirmPassword', 'Confirm password', 'new-password')}
        </div>
        <div class="ds-field ds-role"><label class="ds-label" for="signup-role">Account type</label><select class="ds-input" id="signup-role" name="role" aria-describedby="teacher-status"><option value="student">Student</option><option value="teacher">Teacher</option></select><span class="ds-field-note ds-role-note" id="teacher-status">Classroom features are coming later.</span></div>` : passwordField('account-password', 'password', 'Password', 'current-password')}
        <p id="form-error" class="ds-alert" role="alert">${esc(state.error)}</p>
        <button class="ds-button ds-button--block" type="submit"><span class="ds-entry-progress" hidden aria-hidden="true"></span><span>${signup ? 'Create account' : 'Sign in'}</span></button>
      </form>
      <p class="ds-note">Your student notes, tests, and results are private.</p>
      </section>
    </div>
  </main></div>`;
}

function shell(content) {
  const sections = [['home', 'Overview'], ['snaps', 'Study snaps'], ['mates', 'Study mates'], ['library', 'My notes'], ['create', 'Create a test'], ['tests', 'My tests'], ['settings', 'Settings']];
  const active = ['material', 'upload', 'note'].includes(state.view) ? 'library' : ['test', 'results'].includes(state.view) ? 'tests' : ['capture', 'snap'].includes(state.view) ? 'snaps' : state.view;
  root.innerHTML = `<div class="shell student-shell"><aside class="sidebar" aria-label="Workspace"><div>${brand}</div><nav class="nav" aria-label="Main navigation">${state.user.role === 'student' ? sections.map(([view, label]) => `<button type="button" data-action="nav" data-id="${view}" ${active === view ? 'aria-current="page"' : ''}>${label}</button>`).join('') : ''}</nav><div class="sidebar-footer"><strong>${esc(state.user.name)}</strong><p>${state.user.role === 'student' ? 'Private student account' : 'Teacher account'}</p><button type="button" class="btn small signout" data-action="logout">Sign out</button></div></aside><div class="main"><header class="topbar"><div class="breadcrumb"><strong>${state.user.role === 'teacher' ? 'Teacher workspace' : sections.find(([key]) => key === active)?.[1] || 'Your workspace'}</strong></div><div class="topbar-actions">${state.user.role === 'student' ? `<span class="status-pill ${state.data?.auth?.connected ? 'online' : ''}">${state.data?.auth?.connected ? 'AI connected' : 'AI not connected'}</span>` : ''}<button type="button" class="account-button" data-action="logout">Sign out</button></div></header><main class="content" id="main-content" tabindex="-1">${content}</main></div></div>`;
}
const heading = (title, description, action = '') => `<div class="student-heading student-intro"><div><h1 class="page-heading">${esc(title)}</h1><p class="page-subtitle">${esc(description)}</p></div>${action}</div>`;
const empty = (title, description, action = '') => `<div class="workspace-empty"><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;

function activityCalendar(activity) {
  const first = new Date(`${activity.days[0].date}T12:00:00Z`).getUTCDay();
  const weeks = Math.ceil((first + activity.days.length) / 7);
  const months = [];
  let lastMonth = '';
  for (let week = 0; week < weeks; week++) {
    const day = activity.days[Math.max(0, week * 7 - first)];
    if (!day) continue;
    const month = day.date.slice(0, 7);
    if (month !== lastMonth) months.push(`<span style="grid-column:${week + 1}">${new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })}</span>`);
    lastMonth = month;
  }
  const cells = activity.days.map(day => `<span aria-hidden="true" class="activity-day level-${Math.min(4, day.count)}" title="${esc(dateText(day.date))}: ${day.count} completed test${day.count === 1 ? '' : 's'}"></span>`).join('');
  const active = activity.days.filter(day => day.count).reverse();
  return `<section class="card activity-card" aria-labelledby="activity-heading"><div class="split"><h2 id="activity-heading">Your practice, day by day</h2><p>${activity.current} day current streak · ${activity.longest} day best</p></div><div class="calendar-scroll" role="region" aria-label="Practice activity calendar. Scroll horizontally to see the full year." tabindex="0"><div class="calendar-body"><div class="calendar-months" style="--weeks:${weeks}" aria-hidden="true">${months.join('')}</div><div class="calendar-grid"><div class="calendar-weekdays" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div class="activity-grid" role="img" aria-label="Completed tests over the last 53 weeks. ${active.length} active days. A dated list follows.">${'<span class="activity-day blank"></span>'.repeat(first)}${cells}</div></div></div></div><div class="activity-legend"><span>Completed tests · ${esc(activity.timeZone)}</span><span>Less</span>${[0, 1, 2, 3, 4].map(level => `<i class="activity-day level-${level}" aria-hidden="true"></i>`).join('')}<span>More</span></div><details><summary>View activity by date</summary>${active.length ? `<ul class="activity-dates">${active.map(day => `<li>${dateText(day.date)}: ${day.count} completed test${day.count === 1 ? '' : 's'}</li>`).join('')}</ul>` : '<p>No completed tests yet. Your first submission starts your streak.</p>'}</details></section>`;
}
function testRows(tests) {
  return `<div class="workspace-list">${tests.map(test => `<article class="list-row"><div><h3>${esc(test.title)}</h3><p>${test.count} questions · ${test.durationMinutes} min · ${dateText(test.createdAt)}</p>${test.notice ? `<p>${esc(test.notice)}</p>` : ''}</div><div class="actions">${test.attempt ? `<span class="tag neutral">${test.attempt.result.score}/${test.attempt.result.possible}</span>` : ''}${button(test.attempt ? 'Review results' : test.startedAt ? 'Continue test' : 'Start test', 'open-test', test.id)}</div></article>`).join('')}</div>`;
}
function home() {
  const { materials, tests, activity } = state.data;
  const unopened = state.data.social?.received.filter(snap => !snap.openedAt).length || 0;
  shell(`${heading(`Your workspace, ${state.user.name.split(' ')[0]}`, 'Bring your material. Build your practice. Keep coming back.', button('Create a test', 'nav', 'create', true))}<section class="snap-invitation"><div><h2>Studying something? Snap it.</h2><p>One photo. Three quick questions. A study moment to send your mates.${unopened ? ` You have ${unopened} unopened study snap${unopened === 1 ? '' : 's'}.` : ''}</p></div><div class="actions">${button('Take a study snap', 'nav', 'capture', true)}${button('Open study snaps', 'nav', 'snaps')}</div></section><div class="study-summary" aria-label="Study summary"><p><strong>${materials.length}</strong>saved materials</p><p><strong>${tests.length}</strong>personal tests</p><p><strong>${activity.total}</strong>completed tests & mini quizzes</p></div>${activityCalendar(activity)}<section class="section"><div class="split"><h2 class="section-heading">Pick up your practice</h2>${button('All tests', 'nav', 'tests')}</div>${tests.length ? testRows(tests.slice(0, 4)) : empty('Your first test starts with your notes', 'Upload a PDF, DOCX, or images, or write a note. Any subject belongs here.', button('Add study material', 'nav', 'library', true))}</section>`);
}
function library() {
  const materials = state.data.materials;
  const subjects = [...new Set(materials.map(item => item.subject || 'General'))].sort();
  const filtered = state.filter ? materials.filter(item => (item.subject || 'General') === state.filter) : materials;
  shell(`${heading('Your study library', 'Keep notes and documents together, across every subject.', `<div class="actions">${button('Write a note', 'nav', 'note')}${button('Upload material', 'nav', 'upload', true)}</div>`)}${materials.length ? `<div class="subject-filter"><label for="subject-filter">Subject</label><select id="subject-filter"><option value="">All subjects</option>${subjects.map(subject => `<option ${state.filter === subject ? 'selected' : ''}>${esc(subject)}</option>`).join('')}</select><span class="muted small-text">${filtered.length} item${filtered.length === 1 ? '' : 's'}</span></div><div class="workspace-list">${filtered.map(item => `<article class="list-row"><div><h3>${esc(item.name)}</h3><p>${esc(item.subject || 'General')} · ${item.kind === 'note' ? 'Written note' : esc(item.kind.toUpperCase())} · ${dateText(item.createdAt)}</p><p>${item.extractedText ? 'Text ready for practice' : 'Read this document before creating a test'}${item.skippedPages?.length ? ` · ${item.skippedPages.length} pages skipped` : ''}</p></div>${button('Open material', 'material', item.id)}</article>`).join('')}</div>` : empty('A home for what you’re learning', 'Add your lecture notes, textbook chapters, or revision material. Everything here belongs to your account.')}`);
}
const errorBox = '<p id="form-error" class="auth-error" role="alert"></p>';
function upload() {
  shell(`${heading('Add study material', 'Upload a document or an ordered group of page images.')}<div class="grid two"><form id="upload-form" class="card">${errorBox}<div class="field"><label for="upload-name">Title</label><input id="upload-name" name="name" maxlength="160" placeholder="e.g. Cell biology, chapter 3" required></div><div class="field"><label for="upload-subject">Subject or course</label><input id="upload-subject" name="subject" maxlength="80" placeholder="e.g. Biology"></div><div class="field"><label for="upload-files">Study files</label><input id="upload-files" name="files" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" multiple required><span class="hint">One PDF/DOCX, or up to 25 images in reading order. Maximum 30 MB total.</span></div><div class="actions"><button class="btn primary" type="submit">Save material</button>${button('Cancel', 'nav', 'library')}</div></form><aside class="form-aside"><h2>Check the text before you practise</h2><p>After uploading, choose Read document. You can correct the extracted text before creating questions.</p><p>Text PDFs and DOCX are read locally. Scanned pages and images need your connected AI account. Complex visuals may be skipped.</p><p>Your material stays in your personal workspace.</p></aside></div>`);
}
function editor() {
  const material = state.view === 'material' ? state.material : null;
  shell(`${heading(material ? material.name : 'Write a study note', material ? `${material.subject || 'General'} · ${material.kind === 'note' ? 'Written note' : 'Document review'}` : 'Save ideas, explanations, or pasted study text.')}<div class="workspace-editor">${material && material.kind !== 'note' ? `<div class="actions">${button(material.extractedText ? 'Read document again' : 'Read document', 'read', material.id, true)}</div><p class="note-meta">${material.files.map(file => esc(file.name)).join(', ')}${material.pageCount ? ` · ${material.pageCount} pages or paragraphs` : ''}${material.skippedPages?.length ? ` · Skipped pages: ${material.skippedPages.join(', ')}. Add their text manually if needed.` : ''}</p>` : ''}<form id="note-form">${errorBox}<div class="form-grid"><div class="field"><label for="note-name">Title</label><input id="note-name" name="name" value="${esc(material?.name)}" maxlength="160" required></div><div class="field"><label for="note-subject">Subject or course</label><input id="note-subject" name="subject" value="${esc(material?.subject)}" maxlength="80"></div></div><div class="field"><label for="note-text">Study text</label><textarea id="note-text" name="text" maxlength="100000" required>${esc(material?.extractedText)}</textarea><span class="hint">Questions use this text. Check extraction errors before saving.</span></div><div class="actions"><button class="btn primary" type="submit">Save notes</button>${button('Back to library', 'nav', 'library')}${material ? button('Delete material', 'delete-material', material.id) : ''}</div></form></div>`);
}
function createTest() {
  const materials = state.data.materials;
  shell(`${heading('Build your next practice', 'Questions come from the material you select, whatever the subject.')}<div class="grid two"><form id="create-form" class="card">${errorBox}<div class="field"><label for="test-title">Test title</label><input id="test-title" name="title" maxlength="120" placeholder="e.g. Biology revision" required></div><fieldset class="student-question"><legend>Choose study material</legend><div class="question-options">${materials.length ? materials.map(item => `<label class="check-row"><input type="checkbox" name="materialId" value="${item.id}" ${!item.extractedText ? 'disabled' : ''}><span>${esc(item.name)}<small>${esc(item.subject || 'General')} · ${item.extractedText ? 'Ready' : 'Read or add text first'}</small></span></label>`).join('') : '<p class="muted">Add notes or upload a document to begin.</p>'}</div></fieldset><div class="form-grid"><div class="field"><label for="test-count">Questions</label><input id="test-count" name="count" type="number" min="1" max="50" value="10" required></div><div class="field"><label for="test-minutes">Duration, minutes</label><input id="test-minutes" name="minutes" type="number" min="1" max="180" value="15" required></div></div><div class="form-grid"><div class="field"><label for="test-difficulty">Difficulty</label><select id="test-difficulty" name="difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></div><div class="field"><label for="test-penalty">Wrong-answer penalty</label><select id="test-penalty" name="penalty"><option value="0">None</option><option value="0.25">¼ mark</option><option value="${1 / 3}">⅓ mark</option><option value="1">1 mark</option></select></div></div><button class="btn primary" type="submit" ${!materials.some(item => item.extractedText) || !state.data.auth.connected ? 'disabled' : ''}>Generate personal test</button></form><aside class="form-aside"><h2>Practice built around your material</h2><p>Each multiple-choice question includes an explanation and supporting text, shown after submission. Answers receive a second AI check; review any doubtful question against your notes.</p><p>Correct answers earn 1 mark. Unanswered questions earn 0. The timer starts when you start your test, and continues if you close the page.</p><p>Selected study text is sent to your connected AI account for generation. Your saved library and results stay on this computer.</p>${!state.data.auth.connected ? `<p>Connect your own ChatGPT account before generating.</p>${button('Connect AI in Settings', 'nav', 'settings', true)}` : ''}${button('Add or review material', 'nav', 'library')}</aside></div>`);
}
function testsPage() {
  shell(`${heading('Your personal tests', 'Start saved practice, continue a test, or review your answers.', button('Create a test', 'nav', 'create', true))}${state.data.tests.length ? testRows(state.data.tests) : empty('No tests yet', 'Create a test from your study library. Your attempts and results will appear here.')}`);
}
function settings() {
  shell(`${heading('Your account', 'Your study workspace and AI connection.')}<div class="grid two"><section class="card workspace-help"><h2 class="section-heading">Profile</h2><p><strong>${esc(state.user.name)}</strong><br>${esc(state.user.email)}</p><p>Student account · ${esc(state.user.timeZone)}</p><p>Your activity calendar uses this time zone. Completed tests count toward your streak; logins and uploads do not.</p><p>Notes, tests, and results are private to your account.</p>${button('Sign out', 'logout')}</section><section class="card workspace-help"><h2 class="section-heading">Your AI connection</h2><p>${state.data.auth.connected ? 'Your ChatGPT account is connected.' : 'Connect your ChatGPT account to generate tests and read scanned pages.'}</p><p>Only selected study text or page images are sent for AI requests. Generation depends on your account’s available usage. Saved tests can be taken without an AI connection.</p>${button(state.data.auth.connected ? 'Disconnect AI' : 'Connect ChatGPT', state.data.auth.connected ? 'disconnect-ai' : 'connect-ai', '', true)}</section></div>`);
}
function jobPage() {
  shell(`${heading('Preparing your practice', 'Your saved material stays available while this task runs.')}<section class="job-state"><h2 class="section-heading" id="job-progress" role="status">${esc(state.job?.progress || 'Starting…')}</h2><progress aria-label="Task progress"></progress><p>Keep this page open, or come back shortly. You can return to your notes while it finishes.</p>${button('Back to library', 'nav', 'library')}</section>`);
}
const socialData = () => state.data.social || { code: '', connections: [], own: [], received: [] };
function snapsPage() {
  const { own, received } = socialData();
  shell(`${heading('Study snaps', 'A little practice before a little sharing.', button('Take a study snap', 'nav', 'capture', true))}<p class="snap-rule">Complete your mini quiz, then send your photo to selected study mates. A shared streak day counts when your mate opens it on the same day.</p><section class="section"><div class="split"><h2 class="section-heading">From your study mates</h2>${button('Refresh inbox', 'refresh-social')}${button('Manage study mates', 'nav', 'mates')}</div>${received.length ? `<div class="snap-inbox">${received.map(snap => `<article class="snap-message ${snap.openedAt ? '' : 'unopened'}"><div class="mate-initial" aria-hidden="true">${esc(snap.from.slice(0, 1))}</div><div><h3>${esc(snap.from)}</h3><p>${esc(snap.title)}</p><span class="small-text muted">${dateText(snap.sentAt)} · ${snap.openedAt ? 'Opened' : 'New study snap'}</span></div>${button(snap.openedAt ? 'View snap' : 'Open snap', 'open-snap', snap.id, !snap.openedAt)}</article>`).join('')}</div>` : empty('Your next study moment can be shared', 'Add a study mate using their study code. Their snaps will appear here.', button('Find your study mates', 'nav', 'mates'))}</section><section class="section"><h2 class="section-heading">Your study snaps</h2>${own.length ? `<div class="snap-gallery">${own.map(snap => `<article class="snap-tile"><img src="/api/student/snaps/${snap.id}/photo" alt="Your study photo" loading="lazy" width="320" height="220"><div><span class="tag ${snap.sent ? '' : 'neutral'}">${snap.sent ? 'Sent' : snap.completed ? 'Ready to send' : 'Mini quiz waiting'}</span><h3>${esc(snap.title)}</h3><p>${snap.sent ? `${snap.openedCount}/${snap.recipientCount} opened` : snap.completed ? 'Quiz completed. Pick your study mates.' : 'Three questions unlock sharing.'}</p>${button(snap.sent ? 'View snap' : snap.completed ? 'Choose study mates' : 'Take mini quiz', 'own-snap', snap.id)}</div></article>`).join('')}</div>` : empty('Capture what you’re learning today', 'A clear photo of your notes becomes three quick questions. Complete them before sending the snap.')}</section>`);
}
function matesPage() {
  const { code, connections } = socialData();
  const accepted = connections.filter(item => item.status === 'accepted');
  const requests = connections.filter(item => item.status === 'pending');
  shell(`${heading('Your study mates', 'Build a daily study habit together.')}<div class="mate-connect"><section><h2 class="section-heading">Your study code</h2><p class="study-code">${esc(code)}</p><p class="muted small-text">Share this code with someone you know. They’ll send a request for you to accept.</p>${button('Copy study code', 'copy-study-code')}</section><form id="mate-form">${errorBox}<div class="field"><label for="mate-code">Add someone by study code</label><input id="mate-code" name="code" class="input" maxlength="10" minlength="10" pattern="[A-Fa-f0-9]{10}" autocomplete="off" required><span class="hint">Ask your study mate for their 10-character code.</span></div><button class="btn primary" type="submit">Send request</button></form></div>${requests.length ? `<section class="section"><h2 class="section-heading">Study mate requests</h2><div class="workspace-list">${requests.map(mate => `<article class="list-row"><div><h3>${esc(mate.name)}</h3><p>${mate.incoming ? 'Wants to be your study mate' : 'Waiting for them to accept'}</p></div><div class="actions">${mate.incoming ? button('Accept request', 'accept-mate', mate.id, true) : ''}${button(mate.incoming ? 'Decline' : 'Cancel request', 'remove-mate', mate.id)}</div></article>`).join('')}</div></section>` : ''}<section class="section"><div class="split"><h2 class="section-heading">Shared streaks</h2>${button('Refresh', 'refresh-social')}</div><p class="muted small-text">One of you completes a mini quiz and sends the snap; the other opens it that day. Either person can send. Extra snaps count as one streak day.</p>${accepted.length ? `<div class="workspace-list">${accepted.map(mate => `<article class="list-row"><div><h3>${esc(mate.name)} <span class="tag ${mate.streak.todayComplete ? '' : 'neutral'}">${mate.streak.current} day streak</span></h3><p>${mate.streak.todayComplete ? 'Today is complete. See you tomorrow.' : 'Send a snap and have it opened today, or open theirs.'}</p><p>Best: ${mate.streak.longest} days · Days reset in ${esc(mate.streak.timeZone)}</p></div><div class="actions">${button('Take a snap', 'nav', 'capture')}${button('Remove mate', 'remove-mate', mate.id)}</div></article>`).join('')}</div>` : empty('Your first shared streak starts with a study mate', 'Exchange study codes and accept the request. Your personal notes and test results stay private.')}</section>`);
}
function capturePage() {
  shell(`${heading('Snap what you’re studying', 'Turn a page of today’s learning into a quick three-question challenge.')}<div class="snap-capture-layout"><form id="snap-photo-form" class="card">${errorBox}<div class="field"><label for="snap-title">What are you studying?</label><input id="snap-title" name="title" class="input" maxlength="120" placeholder="e.g. Photosynthesis, finally making sense"></div><div class="field"><label for="snap-photo">Take or choose a study photo</label><input id="snap-photo" name="photo" type="file" accept="image/*" capture="environment"><span class="hint">Photograph readable notes, a textbook section, or a study page. Your photo is private until you choose who receives it.</span></div><img class="snap-preview" id="snap-preview" ${state.snapPhoto ? `src="data:image/jpeg;base64,${state.snapPhoto}"` : 'hidden'} alt="Preview of the study photo you will use" width="540" height="400"><p id="photo-status" role="status" class="small-text muted"></p><button id="make-snap" class="btn primary" type="submit" ${!state.snapPhoto || !state.data.auth.connected ? 'disabled' : ''}>Make my mini quiz</button></form><aside class="form-aside"><h2>A small check-in with what you learned</h2><ol class="snap-steps"><li>Take a clear study photo.</li><li>Answer three questions made from that page.</li><li>Choose the study mates who get your snap.</li></ol><p>No timer and no perfect-score requirement. Finish all three questions to unlock sharing. Your answers and score stay private.</p><p>Only this photo is sent to your connected AI account to prepare the quiz. Your library is not shared.</p>${!state.data.auth.connected ? `<p>Connect your own ChatGPT account to make a mini quiz.</p>${button('Connect AI in Settings', 'nav', 'settings', true)}` : ''}</aside></div>`);
}
function snapPage() {
  const snap = state.snap;
  if (!snap) return snapsPage();
  if (!snap.own) {
    shell(`${heading(`${snap.from} shared a study moment`, snap.title, button('Back to study snaps', 'nav', 'snaps'))}<div class="snap-open-layout"><img class="snap-full-photo" src="${snap.photoUrl}" alt="Study material shared by your study mate" width="700" height="800"><section class="snap-open-note"><h2>Learning, shared.</h2><p>Your mate completed a ${snap.count}-question mini quiz before sending this photo.</p><p>You opened their snap. If it was sent today, your shared streak day is complete.</p>${button('See shared streaks', 'nav', 'mates', true)}${button('Send your study moment', 'nav', 'capture')}</section></div>`);
    return;
  }
  const mates = socialData().connections.filter(mate => mate.status === 'accepted');
  if (snap.attempt) {
    shell(`${heading(snap.sent ? 'Your study moment is out there' : 'Mini quiz done. Make someone’s study day.', snap.title, button('Back to study snaps', 'nav', 'snaps'))}<div class="snap-open-layout"><img class="snap-full-photo" src="${snap.photoUrl}" alt="Your study photo" width="700" height="800"><section><div class="snap-complete"><h2>${snap.attempt.result.correct} of ${snap.count} correct</h2><p>Three questions completed. Your score and answers stay with you.</p></div>${snap.sent ? `<h2 class="section-heading section">Sent to your study mates</h2><div class="workspace-list">${snap.deliveries.map(delivery => `<div class="list-row"><div><h3>${esc(delivery.name)}</h3><p>${delivery.openedAt ? `Opened ${dateText(delivery.openedAt)}` : 'Waiting to be opened'}</p></div></div>`).join('')}</div>${button('Refresh delivery status', 'refresh-snap', snap.id)}` : mates.length ? `<form id="send-snap-form">${errorBox}<fieldset class="student-question"><legend>Who gets this study snap?</legend><div class="question-options">${mates.map(mate => `<label class="check-row"><input type="checkbox" name="mateId" value="${mate.id}"><span>${esc(mate.name)}<small>Shared streak: ${mate.streak.current} days</small></span></label>`).join('')}</div></fieldset><p class="small-text muted">Only selected mates can see the photo and caption. Send a fresh snap for each new study day.</p><button class="btn primary" type="submit">Send study snap</button></form>` : empty('Who will you study alongside?', 'Add a study mate first. Your completed snap stays saved here.', button('Add study mates', 'nav', 'mates', true))}<details class="snap-answer-review"><summary>Review your three answers</summary>${snap.questions.map(question => `<article><h3>${esc(question.stem)}</h3><p><strong>Correct answer:</strong> ${esc(question.options[question.answerIndex])}</p><p>${esc(question.explanation)}</p></article>`).join('')}</details><div class="section">${button('Delete this snap', 'delete-snap', snap.id)}</div></section></div>`);
    return;
  }
  const question = snap.questions[state.miniIndex];
  const selected = state.snapAnswers[question.id];
  shell(`${heading('A quick check before you share', snap.title, button('Save for later', 'nav', 'snaps'))}<div class="mini-quiz-layout"><aside><img class="snap-preview" src="${snap.photoUrl}" alt="The study photo for your mini quiz" width="540" height="400"><details class="snap-answer-review"><summary>Check the text read from your photo</summary><p class="snap-source-text">${esc(snap.sourceText)}</p></details></aside><form id="snap-quiz-form" class="mini-quiz">${errorBox}<p class="mini-progress">Question ${state.miniIndex + 1} of ${snap.count}</p><progress value="${state.miniIndex + 1}" max="${snap.count}" aria-label="Mini quiz question"></progress><fieldset class="student-question"><legend>${esc(question.stem)}</legend><div class="question-options">${question.options.map((option, index) => `<label class="student-option"><input type="radio" name="snapAnswer" value="${index}" ${selected === index ? 'checked' : ''} required><span>${esc(option)}</span></label>`).join('')}</div></fieldset><div class="actions submit-area">${state.miniIndex ? button('Previous', 'mini-previous') : ''}${state.miniIndex < snap.count - 1 ? `<button id="mini-next" type="button" class="btn primary" data-action="mini-next" ${selected === undefined ? 'disabled' : ''}>Next question</button>` : `<button class="btn primary" type="submit">Finish mini quiz</button>`}</div><p class="small-text muted">No timer. No perfect score needed. Just a moment to practise what you studied.</p></form></div>`);
}

async function preparePhoto(file) {
  if (!file || !file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This image could not be opened. Try a JPEG or PNG photo.')); image.src = url; });
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('Choose a smaller study photo.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
async function loadSnap(id, open = false) {
  state.snap = await studentApi(`/snaps/${id}${open ? '/open' : ''}`, open ? { method: 'POST' } : undefined);
  state.snapAnswers = {}; state.miniIndex = 0;
  await refresh(); navigate('snap');
}
function runner() {
  const { test, questions, answers } = state.test;
  shell(`${heading(test.title, `${questions.length} multiple-choice questions · ${test.durationMinutes} minutes · ${test.penalty ? `${test.penalty.toFixed(2)} mark deducted for a wrong answer` : 'No negative marking'}`)}<div class="test-toolbar"><span id="answer-count">${Object.keys(answers).length}/${questions.length} answered</span><span id="save-status" class="small-text muted" role="status">Answers saved</span><span class="test-timer" id="test-timer" role="timer" aria-label="Time remaining"></span></div><form id="test-form" class="test-paper">${errorBox}${questions.map((question, index) => `<fieldset class="student-question"><legend>${index + 1}. ${esc(question.stem)}</legend><div class="question-options">${question.options.map((option, choice) => `<label class="student-option"><input type="radio" name="${question.id}" value="${choice}" ${answers[question.id] === choice ? 'checked' : ''} required><span>${esc(option)}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="submit-area"><p class="muted">Unanswered questions receive 0 marks. Submitting finishes this attempt.</p><button class="btn primary" type="submit" formnovalidate>Submit test</button></div></form>`);
  tick();
}
function results() {
  const { test, questions, answers } = state.test;
  const result = test.attempt.result;
  shell(`${heading(test.title, `Completed ${dateText(test.attempt.submittedAt)}. Your practice has been added to your calendar.`, button('Back to my tests', 'nav', 'tests'))}<div class="study-summary"><p><strong>${result.score}/${result.possible}</strong>score</p><p><strong>${result.correct}</strong>correct</p><p><strong>${result.wrong}</strong>wrong</p><p><strong>${result.unanswered}</strong>unanswered</p></div><section class="test-paper"><h2 class="section-heading">Performance by topic</h2><table class="topic-results"><thead><tr><th scope="col">Topic</th><th scope="col">Correct</th><th scope="col">Wrong</th><th scope="col">Skipped</th></tr></thead><tbody>${Object.entries(result.byTopic).map(([topic, value]) => `<tr><th scope="row">${esc(topic)}</th><td>${value.correct}/${value.possible}</td><td>${value.wrong}</td><td>${value.unanswered}</td></tr>`).join('')}</tbody></table><h2 class="section-heading section">Answer review</h2>${questions.map((question, index) => {
    const selected = answers[question.id];
    const correct = selected === question.answerIndex;
    return `<article class="answer-review"><span class="tag ${correct ? '' : selected === undefined ? 'neutral' : 'error'}">${correct ? 'Correct' : selected === undefined ? 'Unanswered' : 'Incorrect'}</span><h2>${index + 1}. ${esc(question.stem)}</h2><ol type="A" class="review-options">${question.options.map((option, choice) => `<li class="${choice === question.answerIndex ? 'correct-choice' : choice === selected ? 'wrong-choice' : ''}">${esc(option)}${choice === question.answerIndex ? ' · Correct answer' : ''}${choice === selected ? ' · Your answer' : ''}</li>`).join('')}</ol><p>${esc(question.explanation)}</p><blockquote class="source-evidence"><p>${esc(question.sourceQuote)}</p><cite>${esc(question.sourceName)}${question.sourceLocation ? ` · ${esc(question.sourceLocation)}` : ''}</cite></blockquote></article>`;
  }).join('')}</section>`);
}
function render() {
  if (!state.user) return authPage();
  if (state.user.role === 'admin') { window.location.replace('/admin'); return; }
  if (state.user.role === 'teacher') return shell(`${heading('Your teacher account is ready', 'You’re signed in as a teacher.')}<div class="workspace-help"><p>Classrooms, assignments, and teacher assessment tools will be added after the teacher workflow is defined.</p><p>Your account is saved. You can sign out and return here later.</p></div>`);
  if (!state.data) return;
  const page = ({ home, library, upload, note: editor, material: editor, create: createTest, tests: testsPage, settings, job: jobPage, test: runner, results, snaps: snapsPage, mates: matesPage, capture: capturePage, snap: snapPage })[state.view] || home;
  page();
}

async function pollJob() {
  clearTimeout(jobTimer);
  if (!state.user || !state.job) return;
  try {
    const job = await studentApi(`/jobs/${state.job.id}`);
    if (job.status === 'running') {
      state.job = job;
      const status = document.querySelector('#job-progress');
      const progress = job.progress || 'Starting…';
      if (status && status.textContent !== progress) status.textContent = progress;
      jobTimer = setTimeout(pollJob, 1500);
      return;
    }
    sessionStorage.removeItem(`mocktaste-job:${state.user.id}`);
    sessionStorage.removeItem(`mocktaste-job-origin:${state.user.id}`);
    state.job = null;
    await refresh();
    const showResult = state.view === 'job';
    if (job.status === 'error') {
      if (showResult) navigate(state.jobOrigin);
      toast(job.error); return;
    }
    if (!showResult) {
      if (['home', 'library', 'tests', 'create', 'settings'].includes(state.view)) render();
      toast(job.result.snapId ? 'Your study snap mini quiz is ready in Study snaps.' : job.result.materialId ? 'Your document text is ready in My notes.' : 'Your personal test is ready in My tests.');
      return;
    }
    if (job.result.snapId) {
      state.snapPhoto = null;
      await loadSnap(job.result.snapId);
    } else if (job.result.materialId) {
      state.material = state.data.materials.find(item => item.id === job.result.materialId);
      navigate('material');
    } else { navigate('tests'); toast('Your personal test is ready.'); }
  } catch (error) {
    if (error.status === 404 && state.user) {
      sessionStorage.removeItem(`mocktaste-job:${state.user.id}`); state.job = null;
      if (state.view === 'job') navigate('library');
      toast('This task is no longer available. Please start it again.');
    } else { toast(error.message); if (state.user) jobTimer = setTimeout(pollJob, 5000); }
  }
}
function watchJob(jobId, origin = 'library') {
  state.jobOrigin = origin;
  state.job = { id: jobId, progress: 'Starting…' };
  sessionStorage.setItem(`mocktaste-job:${state.user.id}`, jobId);
  sessionStorage.setItem(`mocktaste-job-origin:${state.user.id}`, origin);
  navigate('job');
  pollJob();
}
async function openTest(id) {
  state.test = await studentApi(`/tests/${id}/start`, { method: 'POST' });
  navigate(state.test.test.attempt ? 'results' : 'test');
}
async function submitTest() {
  if (state.submitting || !state.test || state.test.test.attempt || !state.user) return;
  state.submitting = true;
  document.querySelectorAll('#test-form button').forEach(item => { item.disabled = true; });
  try {
    await answerQueue;
    if (Date.now() < state.test.deadline) await studentApi(`/tests/${state.test.test.id}/answers`, { method: 'POST', body: { answers: state.test.answers } });
    state.test = await studentApi(`/tests/${state.test.test.id}/submit`, { method: 'POST' });
    await refresh();
    navigate('results');
  } catch (error) {
    toast(`${error.message} Your saved answers are kept. Try submitting again.`);
    document.querySelectorAll('#test-form button').forEach(item => { item.disabled = false; });
  } finally { state.submitting = false; }
}
function tick() {
  if (state.view !== 'test' || !state.test || state.test.test.attempt) return;
  const seconds = Math.max(0, Math.ceil((state.test.deadline - Date.now()) / 1000));
  const timer = document.querySelector('#test-timer');
  if (timer) timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (!seconds) submitTest();
}
setInterval(tick, 1000);

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'toggle-password') {
    const input = document.getElementById(id);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    target.setAttribute('aria-pressed', String(visible));
    target.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${id.endsWith('confirm') ? 'confirm password' : 'password'}`);
    return;
  }
  if (action === 'login-mode' || action === 'signup-mode') {
    if (state.busy || target.getAttribute('aria-pressed') === 'true') return;
    const email = document.querySelector('.ds-form input[name="email"]').value;
    state.authMode = action === 'signup-mode' ? 'signup' : 'login';
    state.error = '';
    render();
    document.querySelector('.ds-form input[name="email"]').value = email;
    document.querySelector(`[data-action="${action}"]`).focus({ preventScroll: true });
    return;
  }
  if (action === 'nav') {
    if (!state.data) return;
    if (state.view === 'test' && !window.confirm('The timer will keep running. Leave this test?')) return;
    navigate(id);
    if (id === 'snaps' || id === 'mates') refreshSocialView(id);
    return;
  }
  perform(async () => {
    if (action === 'retry-workspace') {
      target.disabled = true;
      target.setAttribute('aria-busy', 'true');
      target.textContent = 'Opening workspace…';
      await enterWorkspace();
    }
    if (action === 'logout') {
      if (state.view === 'test' && !window.confirm('Your saved answers will remain, but the timer keeps running. Sign out?')) return;
      await api('/api/account/logout', { method: 'POST' });
      clearWorkspace(); state.error = ''; render();
    }
    if (action === 'material') { state.material = state.data.materials.find(item => item.id === id); navigate('material'); }
    if (action === 'read') { const result = await studentApi(`/materials/${id}/read`, { method: 'POST' }); if (result.jobId) watchJob(result.jobId); }
    if (action === 'delete-material' && window.confirm('Delete this material? Existing tests and results will stay saved.')) {
      await studentApi(`/materials/${id}`, { method: 'DELETE' }); await refresh(); navigate('library'); toast('Material deleted.');
    }
    if (action === 'open-test') await openTest(id);
    if (action === 'connect-ai') { const result = await studentApi('/auth/start', { method: 'POST' }); window.location.assign(result.url); }
    if (action === 'disconnect-ai') { await studentApi('/auth/logout', { method: 'POST' }); await refresh(); render(); }
    if (action === 'refresh-social') { await refresh(); render(); }
    if (action === 'copy-study-code') { await navigator.clipboard.writeText(socialData().code); toast('Study code copied.'); }
    if (action === 'accept-mate') { await studentApi(`/mates/${id}/accept`, { method: 'POST' }); await refresh(); render(); toast('Study mate added.'); }
    if (action === 'remove-mate' && window.confirm('Remove this connection or request? Shared photos will no longer be accessible between these accounts.')) { await studentApi(`/mates/${id}`, { method: 'DELETE' }); await refresh(); render(); }
    if (action === 'own-snap' || action === 'refresh-snap') await loadSnap(id);
    if (action === 'open-snap') await loadSnap(id, true);
    if (action === 'mini-next' && state.snapAnswers[state.snap.questions[state.miniIndex].id] !== undefined) { state.miniIndex++; render(); }
    if (action === 'mini-previous') { state.miniIndex = Math.max(0, state.miniIndex - 1); render(); }
    if (action === 'delete-snap' && window.confirm('Delete this study photo and quiz? Mates will lose access. Completed activity and earned streak days stay counted.')) { await studentApi(`/snaps/${id}`, { method: 'DELETE' }); state.snap = null; await refresh(); navigate('snaps'); }
  });
});

document.addEventListener('change', event => {
  if (event.target.id === 'snap-photo') {
    const file = event.target.files[0];
    const revision = ++state.photoRevision;
    state.photoBusy = true; state.snapPhoto = null;
    const previousPreview = document.querySelector('#snap-preview'); if (previousPreview) previousPreview.hidden = true;
    const make = document.querySelector('#make-snap'); if (make) make.disabled = true;
    const status = document.querySelector('#photo-status'); if (status) status.textContent = 'Preparing your photo…';
    preparePhoto(file).then(photo => {
      if (revision !== state.photoRevision || !state.user) return;
      state.snapPhoto = photo;
      const preview = document.querySelector('#snap-preview'); if (preview) { preview.src = `data:image/jpeg;base64,${photo}`; preview.hidden = false; }
      const currentMake = document.querySelector('#make-snap'); if (currentMake) currentMake.disabled = !state.data.auth.connected;
      const currentStatus = document.querySelector('#photo-status'); if (currentStatus) currentStatus.textContent = 'Photo ready. Nothing is shared until you choose your study mates.';
    }).catch(error => { if (revision !== state.photoRevision) return; const currentStatus = document.querySelector('#photo-status'); if (currentStatus) currentStatus.textContent = error.message; toast(error.message); }).finally(() => { if (revision === state.photoRevision) state.photoBusy = false; });
    return;
  }
  if (state.view === 'snap' && event.target.name === 'snapAnswer') {
    state.snapAnswers[state.snap.questions[state.miniIndex].id] = Number(event.target.value);
    const next = document.querySelector('#mini-next'); if (next) next.disabled = false;
    return;
  }
  if (event.target.id === 'subject-filter') { state.filter = event.target.value; render(); }
  if (state.view !== 'test' || event.target.type !== 'radio' || !state.test) return;
  const { name, value } = event.target;
  state.test.answers[name] = Number(value);
  const count = document.querySelector('#answer-count');
  if (count) count.textContent = `${Object.keys(state.test.answers).length}/${state.test.questions.length} answered`;
  const testId = state.test.test.id;
  const answers = { ...state.test.answers };
  const status = document.querySelector('#save-status');
  if (status) status.textContent = 'Saving…';
  answerQueue = answerQueue.then(() => studentApi(`/tests/${testId}/answers`, { method: 'POST', body: { answers } })).then(() => {
    const current = document.querySelector('#save-status'); if (current) current.textContent = 'Answers saved';
  }).catch(error => {
    const current = document.querySelector('#save-status'); if (current) current.textContent = 'Could not save. Please retry.';
    toast(error.message);
  });
});

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, base64: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Try choosing the file again.`));
    reader.readAsDataURL(file);
  });
}
document.addEventListener('input', event => {
  if (!['signup-password', 'signup-confirm'].includes(event.target.id)) return;
  const confirmation = document.querySelector('#signup-confirm[aria-invalid="true"]');
  if (!confirmation) return;
  confirmation.removeAttribute('aria-invalid');
  confirmation.removeAttribute('aria-describedby');
  document.querySelector('#form-error').textContent = '';
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!['account-form', 'signup-form', 'upload-form', 'note-form', 'create-form', 'test-form', 'mate-form', 'snap-photo-form', 'snap-quiz-form', 'send-snap-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'test-form') { submitTest(); return; }
  const data = new FormData(form);
  perform(async () => {
    if (form.id === 'account-form' || form.id === 'signup-form') {
      const payload = Object.fromEntries(data);
      const signup = form.id === 'signup-form';
      form.querySelector('#form-error').textContent = '';
      if (signup && payload.password !== payload.confirmPassword) {
        const confirmation = form.elements.confirmPassword;
        confirmation.setAttribute('aria-invalid', 'true');
        confirmation.setAttribute('aria-describedby', 'form-error');
        form.querySelector('#form-error').textContent = 'Passwords don’t match. Enter the same password in both fields.';
        confirmation.focus();
        return;
      }
      delete payload.confirmPassword;
      payload.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const submitButton = form.querySelector('button[type="submit"]');
      const [spinner, label] = submitButton.children;
      const idleLabel = label.textContent;
      const modeButtons = root.querySelectorAll('.ds-entry-modes button');
      modeButtons.forEach(item => { item.disabled = true; });
      form.querySelectorAll('input').forEach(item => { item.readOnly = true; });
      if (signup) form.elements.role.disabled = true;
      spinner.hidden = false;
      label.textContent = signup ? 'Creating account…' : 'Signing in…';
      submitButton.setAttribute('aria-busy', 'true');
      try {
        const { user } = await api(`/api/account/${signup ? 'signup' : 'login'}`, { method: 'POST', body: payload });
        state.user = user; state.error = ''; state.view = 'home';
        label.textContent = 'Opening workspace…';
        await enterWorkspace();
      } finally {
        label.textContent = idleLabel;
        spinner.hidden = true;
        submitButton.removeAttribute('aria-busy');
        form.querySelectorAll('input').forEach(item => { item.readOnly = false; });
        if (signup) form.elements.role.disabled = false;
        modeButtons.forEach(item => { item.disabled = false; });
      }
    }
    if (form.id === 'upload-form') {
      const files = data.getAll('files');
      if (files.length > 25 || files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) throw new Error('Choose up to 25 images or one document, with a maximum of 30 MB total.');
      await studentApi('/materials', { method: 'POST', body: { name: data.get('name'), subject: data.get('subject'), files: await Promise.all(files.map(fileData)) } });
      await refresh(); navigate('library'); toast('Material saved. Open it to read and check the text.');
    }
    if (form.id === 'note-form') {
      const editing = state.view === 'material';
      const payload = Object.fromEntries(data);
      const result = await studentApi(editing ? `/materials/${state.material.id}` : '/notes', { method: editing ? 'PATCH' : 'POST', body: payload });
      await refresh(); state.material = result; navigate('material'); toast('Notes saved.');
    }
    if (form.id === 'create-form') {
      const payload = Object.fromEntries(data);
      payload.materialIds = data.getAll('materialId');
      if (!payload.materialIds.length) throw new Error('Select at least one ready study material.');
      const result = await studentApi('/tests', { method: 'POST', body: payload });
      watchJob(result.jobId);
    }
    if (form.id === 'mate-form') { await studentApi('/mates/request', { method: 'POST', body: { code: data.get('code') } }); await refresh(); render(); toast('Study mate request sent.'); }
    if (form.id === 'snap-photo-form') {
      if (!state.snapPhoto || state.photoBusy) throw new Error('Choose a photo and wait for it to finish preparing.');
      const result = await studentApi('/snaps', { method: 'POST', body: { title: data.get('title'), photo: state.snapPhoto } });
      watchJob(result.jobId, 'snaps');
    }
    if (form.id === 'snap-quiz-form') {
      state.snap = await studentApi(`/snaps/${state.snap.id}/submit`, { method: 'POST', body: { answers: state.snapAnswers } });
      await refresh(); render(); toast('Mini quiz complete. Sharing is unlocked.');
    }
    if (form.id === 'send-snap-form') {
      const mateIds = data.getAll('mateId');
      if (!mateIds.length) throw new Error('Choose at least one study mate.');
      state.snap = await studentApi(`/snaps/${state.snap.id}/send`, { method: 'POST', body: { mateIds } });
      await refresh(); render(); toast('Study snap sent. Your mate can open it to complete today’s shared streak.');
    }
  });
});

async function enterWorkspace() {
  if (state.user.role !== 'student') { render(); return; }
  try { await refresh(); }
  catch (error) {
    if (!state.user) return;
    shell(`${heading('Couldn’t open your workspace', 'You’re signed in. Retry to load your study material.')}<p role="alert">${esc(error.message)}</p>${button('Try again', 'retry-workspace', '', true)}`);
    document.querySelector('#main-content')?.focus({ preventScroll: true });
    return;
  }
  render();
  document.querySelector('#main-content')?.focus({ preventScroll: true });
  const jobId = sessionStorage.getItem(`mocktaste-job:${state.user.id}`);
  if (jobId) watchJob(jobId, sessionStorage.getItem(`mocktaste-job-origin:${state.user.id}`) || 'library');
}
async function bootstrap() {
  try {
    const { user } = await api('/api/account');
    state.user = user;
    const view = window.location.hash.slice(1);
    if (['home', 'library', 'create', 'tests', 'settings', 'upload', 'note', 'snaps', 'mates', 'capture'].includes(view)) state.view = view;
    if (user) await enterWorkspace(); else render();
    const snapLink = view.match(/^snap\/([a-f\d-]+)$/);
    if (state.data && snapLink && !state.job) {
      try { await loadSnap(snapLink[1]); } catch (error) { navigate('snaps'); toast(error.message); }
    }
    const query = new URLSearchParams(window.location.search);
    if (query.get('auth_error')) toast(query.get('auth_error'));
    if (state.data && query.has('connected')) { navigate('settings'); toast('AI account connected.'); }
  } catch (error) {
    state.user = null; state.error = error.message; render();
  }
}
bootstrap();
