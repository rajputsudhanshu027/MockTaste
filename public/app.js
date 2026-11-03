const app = document.querySelector('#app');
const toastBox = document.querySelector('#toast');
const state = {
  view: 'overview', status: null, materials: [], tests: [], drafts: [], progress: [], sources: [], pyq: null,
  draftTopics: [], buildMode: 'topic', buildMaterialIds: null,
  materialId: null, readyTestId: null, testData: null, questionIndex: 0, answers: {}, retryAnswers: {},
  deadline: 0, job: null, busy: false, models: [], friends: null, friendReport: null,
};

const sectionNames = { awareness: 'General Awareness', math: 'Mathematics', reasoning: 'Reasoning' };
const kindNames = { weekly: 'Weekly test', topic: 'Topic test', full: 'Full CBT-1 mock', practice: 'Short practice test' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateText = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const pct = (value, total) => total ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) window.location.assign('/');
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function toast(message) {
  toastBox.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastBox.textContent = ''; }, 6500);
}

async function refresh() {
  const [status, materials, tests, drafts, progress, sources, pyq, friends] = await Promise.all([
    api('/api/status'), api('/api/materials'), api('/api/tests'), api('/api/drafts'), api('/api/progress'), api('/api/sources'), api('/api/pyq'), api('/api/friends'),
  ]);
  Object.assign(state, { status, materials, tests, drafts, progress, sources, pyq, friends });
  if (!state.draftTopics.length) state.draftTopics = [...(status.week?.topics || [])];
  render();
}

function icon(name) {
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    build: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 15h8M12 11v8"/>',
    history: '<rect x="5" y="5" width="15" height="16" rx="2"/><path d="M3 16V4a2 2 0 0 1 2-2h11M9 10h7M9 14h7M9 18h4"/>',
    friends: '<path d="M8 12a5 5 0 0 1 5-5h3a5 5 0 0 1 0 10h-3M16 12a5 5 0 0 1-5 5H8A5 5 0 0 1 8 7h3"/>',
    library: '<path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    sources: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    person: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.history}</svg>`;
}

function navItem(view, label) {
  const active = ({ material: 'library', 'friend-report': 'friends', ready: 'history', test: 'history', job: 'build', plan: 'overview' })[state.view] || state.view;
  return `<button type="button" data-action="nav" data-view="${view}" ${active === view ? 'aria-current="page"' : ''}>${icon(view)}<span>${label}</span></button>`;
}

function shell(content) {
  const connected = state.status?.auth?.connected;
  const pageName = ({ overview: 'Overview', build: 'Create a test', history: 'Tests & results', friends: 'Sharing & reports', library: 'Study library', sources: 'Question sources', settings: 'Settings', material: 'Document review', 'friend-report': 'Report review', ready: 'Test ready', test: 'Test results', job: 'Preparation', plan: 'Weekly plan' })[state.view] || 'Workspace';
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <a class="brand" href="#overview" data-action="nav" data-view="overview"><img class="brand-mark" src="/logo.svg" width="36" height="36" alt=""><span><strong>MockTaste</strong><small>Private admin panel</small></span></a>
      <button class="btn sidebar-create" type="button" data-action="nav" data-view="build">${icon('build')}Create a test</button>
      <nav class="nav" aria-label="Main navigation">
        ${navItem('overview', 'Overview')}${navItem('build', 'Create a test')}${navItem('history', 'My tests')}${navItem('friends', 'Sharing & reports')}
        <span class="nav-label">Resources</span>
        ${navItem('library', 'Study library')}${navItem('sources', 'Evidence')}${navItem('settings', 'Settings')}
      </nav>
      <div class="sidebar-footer"><div class="device-state"><i aria-hidden="true"></i>Hosted on your laptop</div><p>Keep the app running while friends take their test.</p></div>
    </aside>
    <div class="main">
      <header class="topbar"><div class="breadcrumb"><span>Workspace</span>${icon('chevron')}<strong>${pageName}</strong></div>
        <div class="topbar-actions"><span class="status-pill ${connected ? 'online' : ''}">${connected ? 'AI connected' : 'AI disconnected'}</span><button type="button" class="account-button" data-action="nav" data-view="settings" aria-label="Open account settings"><span class="account-avatar">${icon('person')}</span><span>${connected ? 'My account' : 'Connect account'}</span></button><button type="button" class="btn small" data-action="account-logout">Sign out</button></div>
      </header>
      <main class="content" id="main-content" data-view="${esc(state.view)}">${content}</main>
    </div>
  </div>`;
}

function empty(title, description, button = '') {
  return `<div class="empty"><strong>${esc(title)}</strong><p>${esc(description)}</p>${button}</div>`;
}

function sectionBars(result) {
  return Object.entries(sectionNames).map(([key, label]) => {
    const group = result?.bySection?.[key];
    if (!group?.possible) return '';
    const correct = pct(group.correct, group.possible);
    return `<div class="bar-row"><span>${label}</span><div class="progress-track"><div class="progress-fill" style="width:${correct}%"></div></div><strong>${group.correct}/${group.possible}</strong></div>`;
  }).join('');
}

function overview() {
  const week = state.status?.week;
  const recent = state.tests.slice(0, 3);
  shell(`<h1 class="page-heading">Your test workspace</h1>
    <p class="page-subtitle">Create tests from your notes, share them with friends, and review every submission here.</p>
    <section class="section dashboard-hero"><div class="dashboard-copy"><h2>Turn study notes into a test.</h2><p>Upload a document. We identify its topics and prepare checked questions. Share the test when you’re ready.</p><div class="actions"><button class="btn primary" type="button" data-action="nav" data-view="build">${icon('build')}Create a test</button><button class="btn" type="button" data-action="nav" data-view="friends">View reports</button></div></div><div class="dashboard-guide" aria-label="How it works"><strong>From your notes to their results</strong><div>${icon('upload')}<span><b>Upload your material</b>Topics are identified automatically.</span></div><div>${icon('friends')}<span><b>Send the test link</b>Your laptop hosts the exam.</span></div><div>${icon('check')}<span><b>Review their answers</b>Share feedback when you’re ready.</span></div></div></section>
    <section class="section grid three workspace-summary" aria-label="Workspace summary"><div class="metric"><span>Tests created</span><strong>${state.tests.length}</strong><span>${state.tests.filter(test => !test.attemptId).length} ready to take</span></div><div class="metric"><span>Reports received</span><strong>${state.friends?.reports?.length || 0}</strong><span>Private until you share them</span></div><div class="metric"><span>Study documents</span><strong>${state.materials.length}</strong><span>Saved in your library</span></div></section>
    <section class="section"><div class="split"><h2 class="section-heading">Recent tests</h2><button class="btn small" type="button" data-action="nav" data-view="history">See all tests</button></div>${recent.length ? `<div class="card">${recent.map((test) => `<div class="list-row"><div><h4>${esc(test.title || kindNames[test.kind] || test.kind)}</h4><p>${dateText(test.createdAt)} · ${test.count} questions · ${test.durationMinutes} min</p></div><div class="actions"><button class="btn small" type="button" data-action="open-test" data-id="${test.id}">${test.attemptId ? 'Review' : 'Start test'}</button><button class="btn small" type="button" data-action="create-friend-link" data-id="${test.id}">Create friend link</button></div></div>`).join('')}</div>` : empty('No tests yet', 'Upload a document to make your first test.', '<button class="btn primary" type="button" data-action="nav" data-view="build">Create a test</button>')}</section>
    <section class="section dashboard-secondary"><span>${week?.topics?.length ? `${week.topics.length} topics in this week’s plan` : 'Planning a weekly test?'}</span><button type="button" class="btn small" data-action="nav" data-view="plan">${week?.topics?.length ? 'Edit weekly plan' : 'Plan this week'}</button></section>`);
}

function materialChecks(selected = [], formId = '') {
  return state.materials.length ? `<div class="check-list">${state.materials.map((item) => `<label class="check-row"><input type="checkbox" name="materialId" value="${item.id}" ${formId ? `form="${formId}"` : ''} ${selected.includes(item.id) ? 'checked' : ''}><span>${esc(item.name)}${item.extractedText ? ' · Ready' : ' · Needs text extraction'}</span></label>`).join('')}</div>` : '<p class="small-text muted">No material yet. You can still use approved online sources.</p>';
}

function plan() {
  const topics = state.draftTopics;
  shell(`<p class="eyebrow">Sunday starts here</p><h1 class="page-heading">Plan this week.</h1><p class="page-subtitle">Mark what you studied. Upload dates do not decide what appears in your weekly test.</p>
    <section class="section grid two"><div class="card"><h2 class="section-heading">Studied topics</h2>
      <div class="topic-list">${topics.length ? topics.map((topic, index) => `<span class="topic-chip">${esc(topic.name)} <small>· ${esc(sectionNames[topic.section])}</small><button type="button" aria-label="Remove ${esc(topic.name)}" data-action="remove-topic" data-index="${index}">×</button></span>`).join('') : '<span class="muted small-text">No topics marked yet.</span>'}</div>
      <form id="add-topic-form"><div class="form-grid"><div class="field"><label for="topic-name">Topic name</label><input id="topic-name" name="name" type="text" maxlength="100" placeholder="e.g. Percentages" required></div><div class="field"><label for="topic-section">Section</label><select id="topic-section" name="section"><option value="awareness">General Awareness</option><option value="math">Mathematics</option><option value="reasoning">Reasoning</option></select></div></div><button class="btn" type="submit">Add topic</button></form>
    </div><div class="card"><h2 class="section-heading">Material for this week</h2><p class="small-text muted">Choose several files if you studied across chapters or notes. A topic can also use approved online sources.</p><div class="divider"></div><form id="save-week-form">${materialChecks(state.status?.week?.materialIds || [])}<div class="divider"></div><button class="btn primary" type="submit">Save this week</button></form></div></section>`);
}

function library() {
  shell(`<p class="eyebrow">Reference shelf</p><h1 class="page-heading">Study library.</h1><p class="page-subtitle">Keep the pages that matter close. Extract text from the range you studied, check it, and use it in a test.</p>
    <section class="section grid two"><div class="card"><h2 class="section-heading">Add material</h2><form id="upload-form"><div class="field"><label for="material-name">Name</label><input id="material-name" name="name" type="text" placeholder="e.g. Arithmetic notes, week 2"></div><div class="field"><label for="material-files">PDF, DOCX, or images</label><input id="material-files" name="files" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" multiple required><span class="hint">Choose one PDF/DOCX or several images in reading order. Maximum 30 MB total.</span></div><button class="btn primary" type="submit">Add to library</button></form></div>
      <div class="card"><h2 class="section-heading">Reading rules</h2><p>Text-readable PDFs and DOCX files are extracted locally. Clear scans and images use your connected ChatGPT plan for text recognition. You can correct the result before generating questions.</p><div class="divider"></div><p>Complex diagrams, maps, and charts are skipped. The app shows which pages need your attention.</p></div></section>
    <section class="section"><div class="split"><h2 class="section-heading">Saved material</h2><span class="tag neutral">${state.materials.length} item${state.materials.length === 1 ? '' : 's'}</span></div>
      ${state.materials.length ? `<div class="card">${state.materials.map((item) => `<div class="list-row"><div><h4>${esc(item.name)}</h4><p>${esc(item.kind.toUpperCase())} · ${item.files.length} file${item.files.length === 1 ? '' : 's'} · ${item.extractedText ? `${item.extractedText.length.toLocaleString()} characters ready` : 'Needs extraction'}${item.skippedPages?.length ? ` · ${item.skippedPages.length} skipped page${item.skippedPages.length === 1 ? '' : 's'}` : ''}</p></div><div class="actions"><button type="button" class="btn small" data-action="edit-material" data-id="${item.id}">Extract / edit</button><button type="button" class="btn danger small" data-action="delete-material" data-id="${item.id}">Delete</button></div></div>`).join('')}</div>` : empty('Your library is empty', 'Add your first study file. Choose a chapter or range when extracting it.')}</section>`);
}

function materialEditor() {
  const material = state.materials.find((item) => item.id === state.materialId);
  if (!material) { state.view = 'library'; return library(); }
  const rangeLabel = material.kind === 'images' ? 'image' : material.kind === 'docx' ? 'paragraph' : 'page';
  shell(`<button type="button" class="btn small" data-action="nav" data-view="library">← Back to library</button><div class="section"><p class="eyebrow">Material / ${esc(material.kind)}</p><h1 class="page-heading">${esc(material.name)}</h1><p class="page-subtitle">Extract the pages you studied. Correct any reading errors before using this material for questions.</p></div>
    <section class="section grid two"><div class="card"><h2 class="section-heading">Choose a range</h2><form id="extract-form"><div class="form-grid"><div class="field"><label for="extract-from">From ${rangeLabel}</label><input id="extract-from" name="from" type="number" min="1" value="${material.selectedRange?.from || 1}"></div><div class="field"><label for="extract-to">To ${rangeLabel}</label><input id="extract-to" name="to" type="number" min="1" value="${material.selectedRange?.to || material.pageCount || (material.kind === 'images' ? material.files.length : material.kind === 'docx' ? 40 : 1)}"></div></div>
      <p class="small-text muted">${material.kind === 'pdf' ? 'Up to 40 pages per extraction. Scanned pages use AI vision.' : material.kind === 'images' ? 'Up to 20 images per extraction.' : 'Choose up to 200 paragraphs from the DOCX. Headings appear in the extracted text.'}</p><button class="btn primary" type="submit">Extract text</button></form>
      ${material.skippedPages?.length ? `<div class="notice">Skipped ${material.skippedPages.length} page${material.skippedPages.length === 1 ? '' : 's'}: ${material.skippedPages.join(', ')}. Connect ChatGPT or use clearer pages, then extract again.</div>` : ''}</div>
      <div class="card"><h2 class="section-heading">File details</h2>${material.files.map((file, index) => `<div class="list-row"><div><h4>${esc(file.name)}</h4><p>${(file.size / 1024 / 1024).toFixed(1)} MB · ${index + 1} of ${material.files.length}</p></div></div>`).join('')}<div class="divider"></div><p class="small-text muted">Only selected pages or extracted text are sent for AI generation.</p></div></section>
    <section class="section"><div class="card"><h2 class="section-heading">Extracted text</h2><form id="material-text-form"><div class="field"><label for="material-text">Review and edit before using</label><textarea id="material-text" name="text" rows="18" placeholder="Extract a range to see its text here.">${esc(material.extractedText || '')}</textarea></div><div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" data-action="nav" data-view="build" data-mode="topic">Create topic test</button></div></form></div></section>`);
}

function detectedTopicPreview(ids) {
  const materials = state.materials.filter(item => ids.includes(item.id));
  if (!materials.length) return '<p class="muted">Upload a document to discover its topics automatically.</p>';
  return materials.map(material => `<div class="detected-material"><strong>${esc(material.name)}</strong>
    ${material.detectedTopics?.length ? `<ul class="detected-topics">${material.detectedTopics.map(topic => `<li><span>${esc(topic.name)}</span><small>${esc(sectionNames[topic.section])}</small></li>`).join('')}</ul>`
      : `<p>Topics will be identified from the document before questions are written.</p><button class="btn small" type="button" data-action="analyze-material" data-id="${material.id}">${material.extractedText ? 'Identify topics' : 'Read and identify topics'}</button>`}
    ${material.selectedRange ? `<p class="small-text muted">Using ${material.kind === 'docx' ? 'paragraphs' : 'pages'} ${material.selectedRange.from}–${material.selectedRange.to}.</p>` : ''}
    ${material.skippedPages?.length ? `<p class="notice">Unreadable or complex pages skipped: ${material.skippedPages.map(esc).join(', ')}. Review them in Study library.</p>` : ''}</div>`).join('');
}

function build() {
  const mode = state.buildMode;
  const week = state.status?.week;
  const selected = state.buildMaterialIds ?? [...new Set([...(mode === 'weekly' ? week?.materialIds || [] : []), state.materialId].filter(Boolean))];
  const modeOptions = [
    { id: 'topic', title: 'Document test', detail: 'Topics detected automatically · 5–50 questions' },
    { id: 'weekly', title: 'Weekly test', detail: 'This week’s topics · 30 questions' },
    { id: 'full', title: 'Full mock', detail: 'CBT-1 format · 100 questions' },
  ];
  shell(`<h1 class="page-heading">Create a test</h1><p class="page-subtitle">Start with your notes. We find the topics; you choose the length and time.</p>
    <section class="section build-section"><div class="step-heading"><span class="step-number">1</span><div><h2>Upload your material</h2><p>PDF, DOCX, or clear images. Maximum 30 MB.</p></div></div>
      <div class="card"><form id="build-upload-form" class="upload-form"><div class="field upload-zone">${icon('upload')}<label for="build-files">Choose your study material</label><input id="build-files" name="files" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" multiple required><span class="hint">One PDF or DOCX, or images in reading order. Up to 30 MB.</span></div><div class="field"><label for="build-name">Document name <span class="muted">(optional)</span></label><input id="build-name" name="name" type="text" placeholder="e.g. Weekly revision notes"></div><button class="btn primary" type="submit">Upload and identify topics</button><p class="upload-privacy">The full document is read. Text and scans may be sent to ChatGPT to identify topics.</p></form>
      ${state.materials.length ? `<div class="saved-material"><strong>Use a saved document</strong>${materialChecks(selected, 'generate-form')}<div class="actions">${state.materialId ? `<button type="button" class="text-button" data-action="edit-material" data-id="${state.materialId}">Review extracted text</button>` : ''}<button type="button" class="text-button" data-action="nav" data-view="library">Open study library</button></div></div>` : ''}</div></section>
    <section class="section build-section"><div class="step-heading"><span class="step-number">2</span><div><h2>Choose your test</h2><p>Set the question count and time before generating.</p></div></div>
      <div class="card"><div class="mode-options" role="group" aria-label="Test type">${modeOptions.map((item) => `<button type="button" class="mode-option ${mode === item.id ? 'selected' : ''}" data-action="mode" data-mode="${item.id}" aria-pressed="${mode === item.id}"><strong>${item.title}</strong><span>${item.detail}</span></button>`).join('')}</div>
      <form id="generate-form" class="test-options">
      ${mode === 'weekly' ? `<div class="inline-note">${week?.topics?.length ? `Using this week’s topics: ${week.topics.map((item) => esc(item.name)).join(', ')}.` : 'Add the topics you studied before making a weekly test.'} <button type="button" class="text-button" data-action="nav" data-view="plan">${week?.topics?.length ? 'Edit topics' : 'Plan this week'}</button></div>` : ''}
      ${mode === 'full' ? '<div class="inline-note">100 questions in 90 minutes: 40 Awareness, 30 Mathematics, and 30 Reasoning. If fewer verified questions are available, the test is labelled as shorter practice.</div>' : ''}
      ${mode === 'topic' ? `<section aria-labelledby="detected-topic-heading"><h3 id="detected-topic-heading">Topics from your document</h3><div id="detected-topic-preview" aria-live="polite">${detectedTopicPreview(selected)}</div></section>` : ''}
      ${mode !== 'full' ? `<div class="form-grid"><div class="field"><label for="build-count">Questions</label><input id="build-count" name="count" type="number" min="${mode === 'weekly' ? 10 : 5}" max="${mode === 'weekly' ? 60 : 50}" value="${mode === 'weekly' ? 30 : 20}"></div>${mode === 'topic' ? '<div class="field"><label for="build-minutes">Time limit (minutes)</label><input id="build-minutes" name="minutes" type="number" min="1" max="180" value="18"></div>' : '<p class="small-text muted option-hint">Time scales with the question count.</p>'}</div>` : ''}
      <div class="inline-note">${mode === 'topic' ? 'Questions follow the detected topics in your selected notes. Each answer is checked against the notes or a worked solution.' : 'We find relevant online sources and English past-paper questions automatically. Checked questions show their source and paper origin.'}</div>
      <div class="generate-footer"><p>Selected text may be sent to ChatGPT to write and check questions. Every question has four choices.</p><button class="btn primary" type="submit" ${!state.status?.auth?.connected ? 'disabled' : ''}>Generate ${mode === 'full' ? 'full mock' : 'test'}</button></div>
      ${!state.status?.auth?.connected ? '<p class="small-text muted">Connect ChatGPT in Settings to generate questions.</p>' : ''}</form></div></section>`);
}

function sources() {
  shell(`<p class="eyebrow">Evidence</p><h1 class="page-heading">Sources we found.</h1><p class="page-subtitle">The app looks for relevant pages and English UG CBT-1 past papers when it makes a test. You can review where questions came from here.</p>
    <section class="section grid two"><div class="card metric"><span>Past-paper questions checked</span><strong>${state.pyq?.count || 0}</strong><span>Mathematics and Reasoning only</span></div><div class="card"><h2 class="section-heading">Paper origin</h2><p>Public third-party copies are labelled as such. They are never presented as official RRB releases.</p><div class="divider"></div><a href="https://prepp.in/rrb-ntpc-exam/question-paper-2024" target="_blank" rel="noreferrer noopener">View the paper collection ↗</a></div></section>
    <section class="section"><h2 class="section-heading">Saved factual sources</h2>${state.sources.length ? `<div class="card">${state.sources.map((source) => `<div class="list-row"><div><h4>${esc(source.label)}</h4><p>${esc(source.topic || 'General source')} · ${source.date ? esc(dateText(source.date)) : 'Date unavailable'}</p><p><a href="${esc(source.url)}" target="_blank" rel="noreferrer noopener">Open source ↗</a></p></div><button class="btn danger small" type="button" data-action="delete-source" data-id="${source.id}">Remove</button></div>`).join('')}</div>` : empty('Sources appear here after generation', 'Factual questions are supported by the uploaded text or pages the app finds online.')}</section>`);
}

function history() {
  const recent = state.progress.slice(0, 8);
  shell(`<h1 class="page-heading">My tests</h1><p class="page-subtitle">Your saved papers, ready to take or share. Each friend’s submission appears in Sharing & reports.</p>
    <section class="section"><div class="split"><h2 class="section-heading">Saved tests <span class="tag neutral">${state.tests.length}</span></h2><button type="button" class="btn primary small" data-action="nav" data-view="build">${icon('build')}Create a test</button></div>${state.tests.length ? `<div class="card">${state.tests.map(test => `<div class="list-row"><div><h4>${esc(test.title || kindNames[test.kind] || test.kind)}</h4><p>${dateText(test.createdAt)} · ${test.count} questions · ${test.durationMinutes} minutes</p>${test.topics?.length ? `<p>${test.topics.slice(0, 3).map(topic => esc(topic.name)).join(', ')}${test.topics.length > 3 ? ` and ${test.topics.length - 3} more` : ''}</p>` : ''}${test.notice ? `<p>${esc(test.notice)}</p>` : ''}</div><div class="actions"><span class="tag ${test.attemptId ? 'neutral' : ''}">${test.attemptId ? 'Taken' : 'Ready'}</span><button type="button" class="btn small" data-action="open-test" data-id="${test.id}">${test.attemptId ? 'Review' : 'Take test'}</button><button type="button" class="btn small" data-action="create-friend-link" data-id="${test.id}">Create friend link</button><button type="button" class="btn danger small" data-action="delete-test" data-id="${test.id}" aria-label="Delete ${esc(test.title || 'test')}">Delete</button></div></div>`).join('')}</div>` : empty('Create your first test', 'Upload your study material. We identify the topics and prepare questions for you.', '<button type="button" class="btn primary" data-action="nav" data-view="build">Create a test</button>')}</section>
    ${state.drafts.length ? `<section class="section"><h2 class="section-heading">Saved generation progress</h2><p class="small-text muted">If your ChatGPT plan limit stopped a test, its checked questions are saved here. Resume when usage is available.</p><div class="card">${state.drafts.map((draft) => `<div class="list-row"><div><h4>${esc(kindNames[draft.kind] || draft.kind)}</h4><p>${dateText(draft.createdAt)} · ${draft.count} of ${draft.target} questions saved</p></div><button type="button" class="btn small" data-action="resume-draft" data-id="${draft.id}" ${!state.status?.auth?.connected ? 'disabled' : ''}>Resume</button></div>`).join('')}</div></section>` : ''}
    ${recent.length ? `<section class="section grid two"><div class="card"><h2 class="section-heading">Your own attempts</h2>${recent.map(item => `<div class="list-row"><div><h4>${esc(kindNames[item.kind] || item.kind)}</h4><p>${dateText(item.submittedAt)} · ${item.result.correct} correct · ${item.result.wrong} wrong</p></div><button class="btn small" type="button" data-action="open-test" data-id="${item.testId}">Review</button></div>`).join('')}</div><div class="card"><h2 class="section-heading">Your section accuracy</h2>${sectionBars(recent[0].result)}<div class="divider"></div><p class="small-text muted">Scoring: +1 correct, −⅓ wrong. Flagged questions are excluded.</p></div></section>` : ''}`);
}

function ready() {
  const test = state.tests.find((item) => item.id === state.readyTestId);
  if (!test) { state.view = 'history'; return history(); }
  shell(`<h1 class="page-heading">Your test is ready</h1><p class="page-subtitle">Create a link and send it to your friend. Their answers and report come back to this workspace.</p>
    <section class="section"><div class="card ready-card"><div><h2 class="section-heading">${esc(test.title || kindNames[test.kind] || test.kind)}</h2><p>${test.count} questions · ${test.durationMinutes} minutes · four choices per question</p></div><div class="actions"><button type="button" class="btn primary" data-action="create-friend-link" data-id="${test.id}">Create friend link</button><button type="button" class="btn" data-action="open-test" data-id="${test.id}">Take it myself</button></div></div></section>`);
}

function friends() {
  const data = state.friends || { baseUrl: '', addresses: [], port: 4174, links: [], reports: [] };
  shell(`<h1 class="page-heading">Sharing & reports</h1><p class="page-subtitle">Send a test link. Review your friend’s answers here, then share feedback when it’s ready.</p>
    <section class="section sharing-summary">${icon('shield')}<div><strong>${data.sharingReady ? 'Your exam connection is ready' : 'Share securely from your laptop'}</strong><p>Keep this laptop on and the app running until your friend submits.</p></div><span class="tag ${data.sharingReady ? '' : 'neutral'}">${data.sharingReady ? 'Connected' : 'Connects when you share'}</span></section>
    <section class="section"><div class="split"><h2 class="section-heading">Active exam links</h2><button class="btn small" type="button" data-action="nav" data-view="history">Choose a test</button></div>${data.links.length ? `<div class="card">${data.links.map(link => `<div class="list-row"><div><h4>${esc(link.title)}</h4><p>${link.count} questions · ${link.reportCount} reports</p><p class="copy-url">${data.sharingReady ? esc(link.url) : 'Reconnect to get a working friend link.'}</p></div><div class="actions"><button type="button" class="btn small" data-action="copy-friend-link" data-id="${link.testId}">${data.sharingReady ? 'Copy link' : 'Reconnect and copy'}</button><button type="button" class="btn danger small" data-action="revoke-friend-link" data-token="${link.token}">Revoke</button></div></div>`).join('')}</div>` : empty('No friend links yet', 'Create a test, then choose Create friend link.', '<button class="btn primary" type="button" data-action="nav" data-view="build">Create a test</button>')}</section>
    <section class="section"><div class="split"><h2 class="section-heading">Reports received</h2><span class="tag neutral">${data.reports.length} submissions</span></div>${data.reports.length ? `<div class="card">${data.reports.map(report => `<div class="list-row"><div><h4>${esc(report.studentName)}</h4><p>${dateText(report.submittedAt)} · ${report.result.correct}/${report.result.possible} correct</p></div><div class="actions"><span class="tag ${report.shared ? '' : 'neutral'}">${report.shared ? 'Shared' : 'Private'}</span><button class="btn small" type="button" data-action="open-friend-report" data-id="${report.id}">Review report</button></div></div>`).join('')}</div>` : empty('Your first report will appear here', 'Once your friend submits a test, you can review their answers and write feedback. Only you can see their report until you share it.')}</section>
    <details class="advanced-settings"><summary>Advanced connection settings</summary><div class="card"><h2 class="section-heading">Custom server address</h2><p class="small-text muted">Friend links connect automatically. This setting is for a server address you manage yourself.</p><div class="divider"></div><form id="friend-address-form"><div class="field"><label for="friend-base-url">Address friends can reach</label><input id="friend-base-url" name="baseUrl" type="url" value="${esc(data.baseUrl)}" required></div><button class="btn" type="submit">Save address</button></form>${data.addresses.length ? `<p class="small-text muted">Local network: ${data.addresses.map(esc).join(', ')}</p>` : ''}</div></details>`);
}

function friendReportView() {
  const report = state.friendReport;
  if (!report) return friends();
  const weak = Object.entries(report.result.byTopic || {}).filter(([, value]) => value.correct < value.possible).sort((a, b) => a[1].correct / a[1].possible - b[1].correct / b[1].possible).slice(0, 3).map(([topic]) => topic);
  shell(`<p class="eyebrow">Private report</p><h1 class="page-heading">${esc(report.studentName)}'s results.</h1><p class="page-subtitle">Submitted ${dateText(report.submittedAt)}. You choose when to share feedback.</p>
    <section class="section grid two"><div class="card metric"><span>Score</span><strong>${esc(report.result.score)} / ${report.result.possible}</strong><span>${report.result.correct} correct · ${report.result.wrong} wrong · ${report.result.unanswered} unanswered</span></div><div class="card"><h2 class="section-heading">Focus next</h2><p>${weak.length ? esc(weak.join(', ')) : 'Every topic was answered correctly.'}</p></div></section>
    <section class="section"><h2 class="section-heading">Answer review</h2><div class="card">${report.review.map(item => `<div class="list-row"><div><h4>${item.number}. ${esc(item.stem)}</h4><p>${esc(item.topic || 'General')} · ${item.right ? 'Correct' : 'Needs review'}</p><p>Chosen: ${esc(item.selected || 'Unanswered')} · Correct: ${esc(item.correct)}</p>${item.explanation ? `<p>${esc(item.explanation)}</p>` : ''}</div></div>`).join('')}</div></section>
    <section class="section grid two"><div class="card"><h2 class="section-heading">Your advice</h2><form id="friend-guidance-form" data-id="${report.id}"><div class="field"><label for="friend-guidance">What should they do next?</label><textarea id="friend-guidance" name="guidance" maxlength="5000" rows="7" placeholder="Optional: topics to revise and a clear next step.">${esc(report.guidance)}</textarea></div><button class="btn" type="submit">Save advice</button></form></div><div class="card"><h2 class="section-heading">PDF report</h2><p>Download the score, topic breakdown, advice, and complete answer review as a PDF. Send the file to your friend; they can read it offline.</p><div class="divider"></div><button class="btn primary" type="button" data-action="download-friend-report" data-id="${report.id}">Download PDF report</button><p class="small-text muted" style="margin-top:12px">Any advice you enter here is saved before the PDF is created.</p></div></section>`);
}

function settings() {
  const connected = state.status?.auth?.connected;
  shell(`<p class="eyebrow">Local by design</p><h1 class="page-heading">Settings.</h1><p class="page-subtitle">Your study library and results stay on this computer. Generation uses your ChatGPT Plus plan only when you ask for it.</p>
    <section class="section grid two"><div class="card"><h2 class="section-heading">ChatGPT connection</h2><p>${connected ? `Connected as ${esc(state.status.auth.email || 'your ChatGPT account')}. AI requests use your plan allowance and stop if the limit is reached.` : 'Connect your ChatGPT Plus account to read scans, find sources, and generate questions. No separate API key is needed.'}</p><div class="divider"></div><div class="actions">${connected ? `<button type="button" class="btn danger" data-action="signout">Disconnect</button><button type="button" class="btn" data-action="load-models">Choose model</button>` : '<button type="button" class="btn primary" data-action="connect">Continue with ChatGPT</button>'}<a class="btn ghost" href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer noopener">Manage usage ↗</a></div>
      ${state.models.length ? `<form id="model-form" style="margin-top:18px"><div class="field"><label for="model-choice">Available model</label><select id="model-choice" name="model">${state.models.map((model) => `<option value="${esc(model.slug)}" ${model.slug === state.status.auth.model ? 'selected' : ''}>${esc(model.displayName)}</option>`).join('')}</select></div><button type="submit" class="btn small">Save model</button></form>` : ''}
    </div><div class="card"><h2 class="section-heading">Online evidence</h2><p>The app searches approved sites and English UG CBT-1 paper collections while building a test. Factual questions retain their source link; third-party paper questions keep their origin label.</p><div class="divider"></div><button class="btn small" type="button" data-action="nav" data-view="sources">Review evidence</button></div></section>
    <section class="section grid two"><div class="card"><h2 class="section-heading">Your local data</h2><p>Download a JSON copy of your study plan, sources, tests, and results. Uploaded PDFs and images are not included in this export.</p><div class="divider"></div><a class="btn" href="/api/export" download>Export study history</a></div><div class="card"><h2 class="section-heading">Weekly reminder</h2><p>Sunday evening, shown while this local app is open. Prepare a test ahead of time so it is ready even if AI plan usage is unavailable later.</p><div class="divider"></div><button class="btn small" type="button" data-action="nav" data-view="plan">Edit studied topics</button></div></section>`);
}

function jobView() {
  const job = state.job;
  shell(`<h1 class="page-heading">Preparing your material</h1><p class="page-subtitle">We identify the topics, prepare questions, and check the answers. Progress appears below.</p>
    <section class="section"><div class="card job" data-state="${esc(job?.status || 'running')}">${job?.status === 'running' ? '<span class="spinner" aria-hidden="true"></span>' : icon(job?.status === 'error' ? 'alert' : 'check')}<h2 class="section-heading">${esc(job?.status === 'error' ? 'Preparation needs attention' : job?.status === 'done' ? 'Ready' : 'Working on your material')}</h2><p role="status" aria-live="polite">${esc(job?.error || job?.progress || 'Starting...')}</p>${job?.status === 'error' ? `<button type="button" class="btn" data-action="nav" data-view="${state.jobOrigin || 'build'}">${state.jobOrigin === 'history' ? 'See saved progress' : 'Back to test creation'}</button>` : ''}</div></section>`);
}

function timerText() {
  const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
  return { remaining, label: `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}` };
}

function testRunner() {
  const { test, questions } = state.testData;
  const index = state.questionIndex;
  const question = questions[index];
  const answered = Object.keys(state.answers).filter((id) => state.answers[id] !== '').length;
  const timer = timerText();
  app.innerHTML = `<main class="exam-shell"><header class="exam-header"><div><h1>${esc(test.title || kindNames[test.kind] || test.kind)}</h1><p class="exam-description">${test.count} questions · ${test.durationMinutes} minutes</p></div><div class="exam-meta"><span class="tag neutral">${answered}/${questions.length} answered</span><span class="timer ${timer.remaining <= 300 ? 'urgent' : ''}" id="timer" role="timer" aria-label="Time remaining">${timer.label}</span><button type="button" class="btn primary" data-action="submit-test">Submit test</button></div></header>
    ${test.notice ? `<div class="notice">${esc(test.notice)}</div>` : ''}
    <div class="exam-layout"><section class="card question-card"><p class="question-number">Question ${index + 1} of ${questions.length} · ${esc(sectionNames[question.section])}</p><h2>${esc(question.stem)}</h2>
      <div class="options" role="radiogroup" aria-label="Answer choices">${question.options.map((option, optionIndex) => `<label class="option ${Number(state.answers[question.id]) === optionIndex ? 'selected' : ''}"><input type="radio" name="answer" value="${optionIndex}" ${Number(state.answers[question.id]) === optionIndex ? 'checked' : ''}><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span></label>`).join('')}</div>
      <div class="question-actions"><button type="button" class="btn" data-action="previous-question" ${index === 0 ? 'disabled' : ''}>Previous</button><div class="actions"><button type="button" class="btn ghost" data-action="clear-answer">Clear answer</button><button type="button" class="btn primary" data-action="next-question" ${index === questions.length - 1 ? 'disabled' : ''}>Next</button></div></div>
    </section><aside class="card palette" aria-label="Question navigation"><h3>Question map</h3><p>Jump to any question.</p><div class="question-grid">${questions.map((item, number) => `<button type="button" data-action="jump-question" data-index="${number}" class="${number === index ? 'current' : state.answers[item.id] !== undefined && state.answers[item.id] !== '' ? 'answered' : ''}" aria-label="Question ${number + 1}${state.answers[item.id] !== undefined && state.answers[item.id] !== '' ? ', answered' : ''}" ${number === index ? 'aria-current="true"' : ''}>${number + 1}</button>`).join('')}</div><div class="palette-legend"><span><i class="answered"></i>Answered</span><span><i></i>Unanswered</span></div></aside></div></main>`;
}

function reviewCard(question, answer, attempt, number, retry = false) {
  const selected = answer?.[question.id];
  const flagged = attempt.flaggedIds?.includes(question.id);
  const correct = selected !== undefined && selected !== '' && Number(selected) === question.answerIndex;
  const source = question.sourceReference;
  return `<article class="review-card"><div class="split"><div class="actions"><span class="tag neutral">${retry ? 'Retry' : `Question ${number + 1}`}</span><span class="tag ${flagged ? 'error' : correct ? '' : selected === undefined || selected === '' ? 'neutral' : 'error'}">${flagged ? 'Excluded' : correct ? 'Correct' : selected === undefined || selected === '' ? 'Unanswered' : 'Incorrect'}</span><span class="tag gold">${esc(question.provenance?.label || 'New question')}</span></div>${!retry ? `<button type="button" class="btn small ${flagged ? '' : 'danger'}" data-action="flag-question" data-id="${question.id}">${flagged ? 'Undo flag' : 'Flag issue'}</button>` : ''}</div>
    <h3>${esc(question.stem)}</h3><div class="review-options">${question.options.map((option, index) => `<div class="review-option ${index === question.answerIndex ? 'correct' : Number(selected) === index ? 'wrong' : ''}">${String.fromCharCode(65 + index)}. ${esc(option)} ${index === question.answerIndex ? '· Correct' : Number(selected) === index ? '· Your answer' : ''}</div>`).join('')}</div>
    <div class="review-details"><p><strong>Why:</strong> ${esc(question.explanation)}</p>${question.workedSolution ? `<p><strong>Worked solution:</strong> ${esc(question.workedSolution)}</p>` : ''}${source ? `<p><strong>Source:</strong> ${esc(source.label)} · ${esc(source.location)} ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noreferrer noopener">Open ↗</a>` : ''}</p>` : ''}${source?.quote ? `<p><strong>Supporting text:</strong> “${esc(source.quote)}”</p>` : ''}</div></article>`;
}

function review() {
  const { test, questions, retryQuestions, attempt } = state.testData;
  const result = attempt.result;
  const score = result.score;
  const topics = Object.entries(result.byTopic || {}).sort((a, b) => pct(a[1].correct, a[1].possible) - pct(b[1].correct, b[1].possible));
  shell(`<button type="button" class="text-button" data-action="nav" data-view="history">Back to my tests</button><h1 class="page-heading">Test results</h1><p class="page-subtitle">${esc(test.title || kindNames[test.kind] || test.kind)} · Submitted ${dateText(attempt.submittedAt)}</p>
    <section class="section"><div class="result-hero"><div><h2>Your score</h2><p>${result.correct} correct · ${result.wrong} wrong · ${result.unanswered} unanswered · ${result.excluded} excluded</p></div><div class="result-score">${esc(score)} <small style="font-size:22px;opacity:.75">/ ${result.possible}</small></div></div>
      ${test.notice ? `<div class="notice">${esc(test.notice)}</div>` : ''}
    </section><section class="section grid two"><div class="card"><h2 class="section-heading">By section</h2>${sectionBars(result) || '<p class="muted">No section data.</p>'}</div>
      <div class="card"><h2 class="section-heading">Topics to revisit</h2>${topics.length ? topics.slice(0, 5).map(([name, item]) => `<div class="bar-row"><span>${esc(name)}</span><div class="progress-track"><div class="progress-fill" style="width:${pct(item.correct, item.possible)}%"></div></div><strong>${item.correct}/${item.possible}</strong></div>`).join('') : '<p class="muted">No topic data.</p>'}</div></section>
    ${retryQuestions?.length ? `<section class="section"><div class="split"><div><p class="section-label">Carryover practice</p><h2 class="section-heading">Last week’s missed questions</h2></div><span class="tag gold">${retryQuestions.length} extra · untimed</span></div>
      ${attempt.retryResult ? `<div class="notice success">Retry result: ${attempt.retryResult.correct} of ${attempt.retryResult.possible} correct. This is separate from your main score.</div>${retryQuestions.map((question, index) => reviewCard(question, attempt.retryAnswers, attempt, index, true)).join('')}` : `<form id="retry-form" class="stack">${retryQuestions.map((question, index) => `<div class="card"><p class="eyebrow">Retry ${index + 1} of ${retryQuestions.length}</p><h3>${esc(question.stem)}</h3><div class="options">${question.options.map((option, optionIndex) => `<label class="option"><input type="radio" name="retry-${question.id}" value="${optionIndex}"><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${esc(option)}</span></label>`).join('')}</div></div>`).join('')}<button type="submit" class="btn primary">Check retries</button></form>`}</section>` : ''}
    <section class="section"><p class="section-label">Answer review</p><h2 class="section-heading">Every question, explained</h2>${questions.map((question, index) => reviewCard(question, attempt.answers, attempt, index)).join('')}</section>`);
}

function render() {
  if (!state.status) return;
  if (state.view === 'test' && state.testData) return state.testData.attempt ? review() : testRunner();
  if (state.view === 'overview') return overview();
  if (state.view === 'plan') return plan();
  if (state.view === 'library') return library();
  if (state.view === 'material') return materialEditor();
  if (state.view === 'build') return build();
  if (state.view === 'sources') return sources();
  if (state.view === 'history') return history();
  if (state.view === 'friends') return friends();
  if (state.view === 'friend-report') return friendReportView();
  if (state.view === 'ready') return ready();
  if (state.view === 'settings') return settings();
  if (state.view === 'job') return jobView();
  overview();
}

function navigate(view, mode) {
  if (mode) state.buildMode = mode;
  state.view = view;
  if (view !== 'test') state.testData = null;
  window.location.hash = view;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function persistAnswers() {
  const id = state.testData?.test?.id;
  if (id) localStorage.setItem(`rrb-answers-${id}`, JSON.stringify(state.answers));
}

async function openTest(id) {
  state.testData = await api(`/api/tests/${id}`);
  state.questionIndex = 0;
  if (!state.testData.attempt) {
    state.answers = JSON.parse(localStorage.getItem(`rrb-answers-${id}`) || '{}');
    const saved = Number(localStorage.getItem(`rrb-deadline-${id}`));
    state.deadline = saved || Date.now() + state.testData.test.durationMinutes * 60_000;
    localStorage.setItem(`rrb-deadline-${id}`, String(state.deadline));
  }
  state.view = 'test';
  window.location.hash = `test/${id}`;
  render();
  window.scrollTo(0, 0);
  tick();
}

async function submitTest(auto = false) {
  if (!state.testData || state.testData.attempt || state.busy) return;
  if (!auto && !confirm('Submit this test? You can review every answer afterward.')) return;
  state.busy = true;
  const id = state.testData.test.id;
  const elapsedSeconds = Math.max(0, Math.round((state.testData.test.durationMinutes * 60_000 - (state.deadline - Date.now())) / 1000));
  try {
    state.testData = await api(`/api/tests/${id}/submit`, { method: 'POST', body: { answers: state.answers, elapsedSeconds } });
    localStorage.removeItem(`rrb-deadline-${id}`);
    localStorage.removeItem(`rrb-answers-${id}`);
    await refresh();
    state.view = 'test';
    render();
    window.scrollTo(0, 0);
  } catch (error) { toast(error.message); }
  finally { state.busy = false; }
}

function tick() {
  if (state.view !== 'test' || !state.testData || state.testData.attempt) return;
  const timer = timerText();
  const element = document.querySelector('#timer');
  if (element) {
    element.textContent = timer.label;
    element.classList.toggle('urgent', timer.remaining <= 300);
  }
  if (timer.remaining <= 0) submitTest(true);
}
setInterval(tick, 1000);
setInterval(async () => {
  if (state.view !== 'friends' || document.hidden) return;
  try {
    const latest = await api('/api/friends');
    const newReports = latest.reports.length - (state.friends?.reports.length || 0);
    const connectionChanged = latest.baseUrl !== state.friends?.baseUrl || latest.sharingReady !== state.friends?.sharingReady;
    state.friends = latest;
    if (connectionChanged && !document.querySelector('#friend-address-form')?.contains(document.activeElement)) render();
    if (newReports > 0) {
      if (!document.querySelector('#friend-address-form')?.contains(document.activeElement)) render();
      toast(`${newReports} new friend report${newReports === 1 ? '' : 's'} received.`);
    }
  } catch {}
}, 8000);

async function startJob(endpoint, body) {
  state.jobOrigin = endpoint.includes('/materials/') ? 'build' : 'history';
  const { jobId } = await api(endpoint, { method: 'POST', body });
  state.job = { id: jobId, status: 'running', progress: 'Starting' };
  navigate('job');
  const poll = async () => {
    try {
      const job = await api(`/api/jobs/${jobId}`);
      state.job = job;
      if (state.view === 'job') render();
      if (job.status === 'running') return setTimeout(poll, 2200);
      await refresh();
      if (job.status === 'done') {
        if (job.result?.testId) { state.readyTestId = job.result.testId; navigate('ready'); }
        else if (job.result?.materialId) { state.materialId = job.result.materialId; navigate('build'); toast('Topics identified. Set the question count and time, then generate your test.'); }
        else { navigate('sources'); toast(`Imported ${job.result?.imported || 0} checked questions.`); }
      } else toast(job.error || 'Generation failed');
    } catch (error) { state.job = { id: jobId, status: 'error', error: error.message }; render(); }
  };
  setTimeout(poll, 1000);
}

async function openFriendReport(id) {
  state.friendReport = await api(`/api/friend-reports/${id}`);
  navigate('friend-report');
}

async function copyLink(url) {
  await navigator.clipboard.writeText(url);
  toast('Link copied.');
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  event.preventDefault();
  try {
    if (action === 'account-logout') { await api('/api/account/logout', { method: 'POST' }); window.location.assign('/'); return; }
    if (action === 'nav') return navigate(target.dataset.view, target.dataset.mode);
    if (action === 'mode') { state.buildMode = target.dataset.mode; return render(); }
    if (action === 'resume-draft') {
      const draft = state.drafts.find((item) => item.id === target.dataset.id);
      if (!draft) throw new Error('Saved progress was not found');
      return startJob('/api/tests/generate', draft.request);
    }
    if (action === 'remove-topic') { state.draftTopics.splice(Number(target.dataset.index), 1); return render(); }
    if (action === 'edit-material') { state.materialId = target.dataset.id; return navigate('material'); }
    if (action === 'delete-material') {
      if (!confirm('Delete this material from your computer?')) return;
      await api(`/api/materials/${target.dataset.id}`, { method: 'DELETE' }); await refresh(); return toast('Material deleted.');
    }
    if (action === 'delete-test') {
      if (!confirm('Delete this test and its result?')) return;
      await api(`/api/tests/${target.dataset.id}`, { method: 'DELETE' }); await refresh(); return toast('Test deleted.');
    }
    if (action === 'delete-source') {
      if (!confirm('Remove this source page?')) return;
      await api(`/api/sources/${target.dataset.id}`, { method: 'DELETE' }); await refresh(); return toast('Source removed.');
    }
    if (action === 'open-test') return openTest(target.dataset.id);
    if (action === 'analyze-material') {
      const material = state.materials.find(item => item.id === target.dataset.id);
      return startJob(`/api/materials/${material.id}/${material.extractedText ? 'analyze' : 'prepare'}`, {});
    }
    if (action === 'copy-friend-link') {
      target.disabled = true;
      target.textContent = 'Checking connection…';
      try {
        const link = await api(`/api/tests/${target.dataset.id}/friend-link`, { method: 'POST', body: {} });
        await refresh();
        try { await copyLink(link.url); }
        catch { toast('Link verified. Copy the address shown above and send it to your friend.'); }
      } finally { target.disabled = false; target.textContent = 'Copy link'; }
      return;
    }
    if (action === 'create-friend-link') {
      toast('Starting secure friend link. This can take up to 45 seconds.');
      await api(`/api/tests/${target.dataset.id}/friend-link`, { method: 'POST', body: {} });
      await refresh(); navigate('friends');
      return toast('Friend link ready. Keep this PC and the app running.');
    }
    if (action === 'copy-link') return copyLink(target.dataset.url);
    if (action === 'revoke-friend-link') {
      if (!confirm('Revoke this exam link? Friends will no longer be able to open it.')) return;
      await api(`/api/friend-links/${target.dataset.token}`, { method: 'DELETE' });
      await refresh(); return toast('Exam link revoked.');
    }
    if (action === 'open-friend-report') return openFriendReport(target.dataset.id);
    if (action === 'download-friend-report') {
      target.disabled = true;
      target.textContent = 'Creating PDF…';
      try {
        const id = target.dataset.id;
        const guidance = document.querySelector('#friend-guidance')?.value ?? state.friendReport.guidance ?? '';
        if (guidance !== (state.friendReport.guidance || '')) {
          state.friendReport = await api(`/api/friend-reports/${id}/guidance`, { method: 'POST', body: { guidance } });
        }
        const response = await fetch(`/api/friend-reports/${id}/pdf`);
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Could not create the PDF. Try downloading again.');
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'test-report.pdf';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        toast('PDF report downloaded. You can send the file to your friend.');
      } finally { target.disabled = false; target.textContent = 'Download PDF report'; }
      return;
    }
    if (action === 'previous-question') { state.questionIndex--; return render(); }
    if (action === 'next-question') { state.questionIndex++; return render(); }
    if (action === 'jump-question') { state.questionIndex = Number(target.dataset.index); return render(); }
    if (action === 'clear-answer') { delete state.answers[state.testData.questions[state.questionIndex].id]; persistAnswers(); return render(); }
    if (action === 'submit-test') return submitTest();
    if (action === 'flag-question') {
      state.testData = await api(`/api/attempts/${state.testData.attempt.id}/flag`, { method: 'POST', body: { questionId: target.dataset.id } });
      await refresh(); state.view = 'test'; render(); return toast('Score updated.');
    }
    if (action === 'connect') { const result = await api('/api/auth/start', { method: 'POST', body: {} }); window.location.href = result.url; return; }
    if (action === 'signout') { if (!confirm('Disconnect ChatGPT from this local app?')) return; await api('/api/auth/logout', { method: 'POST', body: {} }); await refresh(); return; }
    if (action === 'load-models') { const models = await api('/api/models'); state.models = models.models; return render(); }
  } catch (error) { toast(error.message); }
});

document.addEventListener('change', (event) => {
  if (state.view === 'build' && event.target.name === 'materialId') {
    state.buildMaterialIds = new FormData(document.querySelector('#generate-form')).getAll('materialId');
    const preview = document.querySelector('#detected-topic-preview');
    if (preview) preview.innerHTML = detectedTopicPreview(state.buildMaterialIds);
    return;
  }
  if (state.view !== 'test' || state.testData?.attempt || event.target.name !== 'answer') return;
  const value = Number(event.target.value);
  state.answers[state.testData.questions[state.questionIndex].id] = value;
  persistAnswers(); render();
  document.querySelector(`input[name="answer"][value="${value}"]`)?.focus();
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form.id) return;
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  try {
    const data = new FormData(form);
    if (form.id === 'friend-address-form') {
      await api('/api/friends/address', { method: 'POST', body: { baseUrl: data.get('baseUrl') } });
      await refresh(); return toast('Friend link address saved.');
    }
    if (form.id === 'friend-guidance-form') {
      await api(`/api/friend-reports/${form.dataset.id}/guidance`, { method: 'POST', body: { guidance: data.get('guidance') } });
      state.friendReport = await api(`/api/friend-reports/${form.dataset.id}`);
      await refresh(); state.view = 'friend-report'; render(); return toast('Advice saved.');
    }
    if (form.id === 'add-topic-form') {
      state.draftTopics.push({ name: String(data.get('name')).trim(), section: String(data.get('section')) }); render(); return;
    }
    if (form.id === 'save-week-form') {
      const week = await api('/api/weeks', { method: 'POST', body: { topics: state.draftTopics, materialIds: data.getAll('materialId') } });
      await refresh(); state.status.week = week; navigate('overview'); return toast('This week’s topics saved.');
    }
    if (form.id === 'upload-form' || form.id === 'build-upload-form') {
      if (form.id === 'build-upload-form') { submitButton.disabled = true; toast('Uploading and reading your document...'); }
      const files = [...form.querySelector('input[type=file]').files];
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > 30 * 1024 * 1024) throw new Error('Choose at most 30 MB of files');
      const encoded = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, base64: String(reader.result).split(',')[1] });
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
      })));
      const material = await api('/api/materials', { method: 'POST', body: { name: data.get('name'), files: encoded } });
      state.materialId = material.id;
      if (form.id === 'build-upload-form') {
        state.buildMaterialIds = [material.id];
        await refresh();
        return startJob(`/api/materials/${material.id}/prepare`, {});
      }
      await refresh(); navigate('material'); return toast('Material saved. Extract a range before generating questions.');
    }
    if (form.id === 'extract-form') {
      toast('Extracting text. Scanned pages may take a moment...');
      await api(`/api/materials/${state.materialId}/extract`, { method: 'POST', body: { from: Number(data.get('from')), to: Number(data.get('to')) } });
      await refresh(); state.view = 'material'; render(); return toast('Text extracted. Review it for reading errors.');
    }
    if (form.id === 'material-text-form') {
      await api(`/api/materials/${state.materialId}`, { method: 'PATCH', body: { extractedText: data.get('text') } });
      await refresh(); state.view = 'material'; render(); return toast('Corrections saved.');
    }
    if (form.id === 'generate-form') {
      const body = { kind: state.buildMode, materialIds: data.getAll('materialId'), sourceIds: data.getAll('sourceId') };
      if (!body.materialIds.length && !body.sourceIds.length) throw new Error('Upload or select a document first');
      if (body.materialIds.some((id) => !state.materials.find((item) => item.id === id)?.extractedText)) throw new Error('Use Read and identify topics on the selected document first');
      if (state.buildMode === 'weekly') { body.count = Number(data.get('count')); body.topics = state.status.week?.topics || []; if (!body.topics.length) throw new Error('Mark your studied topics first'); }
      if (state.buildMode === 'topic') { body.count = Number(data.get('count')); body.durationMinutes = Number(data.get('minutes')); }
      return startJob('/api/tests/generate', body);
    }
    if (form.id === 'model-form') {
      await api('/api/models', { method: 'POST', body: { model: data.get('model') } }); await refresh(); navigate('settings'); return toast('Model saved.');
    }
    if (form.id === 'retry-form') {
      const answers = {};
      for (const question of state.testData.retryQuestions) {
        const value = data.get(`retry-${question.id}`);
        if (value !== null) answers[question.id] = Number(value);
      }
      state.testData = await api(`/api/tests/${state.testData.test.id}/retry`, { method: 'POST', body: { answers } });
      render(); return toast('Retries checked separately from your main score.');
    }
  } catch (error) { if (form.isConnected && submitButton) submitButton.disabled = false; toast(error.message); }
});

const authError = new URLSearchParams(window.location.search).get('auth_error');
if (authError) { toast(`ChatGPT sign-in: ${authError}`); window.history.replaceState({}, '', '/'); }
refresh().then(() => {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('test/')) openTest(hash.slice(5)).catch((error) => toast(error.message));
  else if (['overview', 'plan', 'library', 'build', 'sources', 'history', 'friends', 'settings'].includes(hash)) navigate(hash);
}).catch((error) => { app.textContent = `Could not load the local app: ${error.message}`; });
