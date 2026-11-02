import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function renderPage(view, data = {}) {
  const app = { innerHTML: '' };
  const context = vm.createContext({
    document: { querySelector: selector => selector === '#app' ? app : {}, addEventListener() {} },
    window: { location: { search: '', hash: '' } }, URLSearchParams,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: () => new Promise(() => {}),
    initialData: { view, status: { auth: { connected: true } }, ...data },
  });
  vm.runInContext(fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext('Object.assign(state, initialData); render();', context);
  return app.innerHTML;
}

const renderBuild = (materials = [], selected = []) => renderPage('build', { materials, buildMaterialIds: selected });

test('default test creation has no required topic or subject field', () => {
  const html = renderBuild();
  assert.match(html, /Upload and identify topics/);
  assert.match(html, /Document test/);
  assert.doesNotMatch(html, /name="(?:topic|section)"/);
  assert.match(html, /name="count"/);
  assert.match(html, /name="minutes"/);
});

test('selected document shows inferred topics and skipped pages safely', () => {
  const html = renderBuild([{ id: 'notes', name: 'Mixed notes.pdf', extractedText: 'Notes',
    detectedTopics: [{ name: 'Percentages <example>', section: 'math' }, { name: 'Number patterns', section: 'reasoning' }],
    selectedRange: { from: 1, to: 42 }, skippedPages: [7],
  }], ['notes']);
  assert.match(html, /Percentages &lt;example&gt;/);
  assert.match(html, /Number patterns/);
  assert.match(html, /pages 1–42/);
  assert.match(html, /pages skipped: 7/);
});

test('sharing puts exam links and reports ahead of advanced connection settings', () => {
  const html = renderPage('friends', { friends: { baseUrl: 'https://example.test', addresses: [], sharingReady: true,
    links: [{ token: 'example', testId: 'paper', title: 'Document test', count: 10, reportCount: 0, url: 'https://example.test/exam/example' }], reports: [],
  } });
  assert.ok(html.indexOf('Active exam links') < html.indexOf('Advanced connection settings'));
  assert.match(html, /<details class="advanced-settings">/);
  assert.match(html, /data-action="copy-friend-link" data-id="paper"/);
  assert.match(html, /data-view="friends" aria-current="page"/);
});

test('saved tests remain the main action on the tests page', () => {
  const html = renderPage('history', { tests: [{ id: 'paper', title: 'Revision test', count: 20, durationMinutes: 18, topics: [] }] });
  assert.match(html, /Revision test/);
  assert.match(html, /data-action="create-friend-link" data-id="paper"/);
  assert.match(html, /data-action="open-test" data-id="paper"/);
});

test('all workspace pages render with navigation and meaningful headings', () => {
  for (const view of ['overview', 'build', 'history', 'friends', 'library', 'sources', 'settings']) {
    const html = renderPage(view);
    assert.match(html, /<h1 class="page-heading">/);
    assert.match(html, /aria-label="Main navigation"/);
    assert.ok(html.includes(`data-view="${view}" aria-current="page"`));
  }
});

test('report review downloads a PDF instead of creating a report link', () => {
  const html = renderPage('friend-report', { friendReport: { id: 'report-id', studentName: 'Sam', submittedAt: '2026-11-01', guidance: '',
    result: { score: 0, possible: 1, correct: 0, wrong: 0, unanswered: 1, byTopic: {} }, review: [],
  } });
  assert.match(html, /data-action="download-friend-report" data-id="report-id"/);
  assert.match(html, /Download PDF report/);
  assert.doesNotMatch(html, /Create report link|Copy report link|share-friend-report/);
});
