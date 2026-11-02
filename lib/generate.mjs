import { createHash, randomUUID } from 'node:crypto';
import { APPROVED_HOSTS, FULL_BLUEPRINT, choosePastQuestions, createTest } from './core.mjs';
import { fetchApproved } from './sources.mjs';
import { ensurePastPaperPool } from './papers.mjs';
import { analyzeMaterials, materialHash } from './material-topics.mjs';

const FULL_TOPICS = {
  awareness: [
    ['Current affairs', 8], ['Indian history', 6], ['Geography', 6],
    ['Indian polity', 6], ['General science', 6], ['Indian economy', 5], ['Computers', 3],
  ],
  math: [['Arithmetic', 12], ['Percentages', 6], ['Algebra', 6], ['Geometry', 6]],
  reasoning: [['Series', 8], ['Analogy', 6], ['Coding and decoding', 6], ['Puzzles', 6], ['Syllogism', 4]],
};

function distribute(topics, count) {
  if (!topics.length || count < 1) return [];
  const groups = topics.map((topic) => ({ topic: typeof topic === 'string' ? topic : topic.name, section: typeof topic === 'string' ? 'awareness' : topic.section, count: 0 }));
  for (let index = 0; index < count; index++) groups[index % groups.length].count++;
  return groups.filter((group) => group.count);
}

function interleaveSections(topics) {
  const sections = ['awareness', 'math', 'reasoning'].map(section => topics.filter(topic => topic.section === section));
  const ordered = [];
  for (let index = 0; sections.some(topics => index < topics.length); index++) {
    sections.forEach(topics => { if (topics[index]) ordered.push(topics[index]); });
  }
  return ordered;
}

function weakTopics(state) {
  const wrong = new Map();
  for (const attempt of state.attempts) {
    const test = state.tests.find((item) => item.id === attempt.testId);
    if (!test) continue;
    for (const question of test.questions) {
      if (attempt.flaggedIds?.includes(question.id)) continue;
      const selected = attempt.answers?.[question.id];
      if (selected === undefined || selected === null || selected === '') continue;
      if (Number(selected) === question.answerIndex) continue;
      const key = `${question.section}:${question.topic}`;
      const entry = wrong.get(key) || { name: question.topic, section: question.section, wrong: 0 };
      entry.wrong++;
      wrong.set(key, entry);
    }
  }
  return [...wrong.values()].sort((a, b) => b.wrong - a.wrong);
}

function retriesFromPreviousWeekly(state) {
  const previous = state.attempts.filter((attempt) => {
    const test = state.tests.find((item) => item.id === attempt.testId);
    return test?.kind === 'weekly';
  }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  if (!previous) return [];
  const test = state.tests.find((item) => item.id === previous.testId);
  return test.questions.filter((question) => {
    if (previous.flaggedIds?.includes(question.id)) return false;
    const selected = previous.answers?.[question.id];
    return selected !== undefined && selected !== null && selected !== '' && Number(selected) !== question.answerIndex;
  });
}

function plan(kind, request, state) {
  if (kind === 'full') {
    return Object.entries(FULL_BLUEPRINT).flatMap(([section]) => FULL_TOPICS[section].map(([topic, count]) => ({ topic, section, count })));
  }
  if (kind === 'topic') {
    const topic = String(request.topic || '').trim();
    if (!topic) throw new Error('Choose a topic');
    const section = request.section;
    if (!['awareness', 'math', 'reasoning'].includes(section)) throw new Error('Choose a section');
    const count = Math.max(5, Math.min(50, Number(request.count) || 20));
    return [{ topic, section, count }];
  }
  const current = Array.isArray(request.topics) && request.topics.length ? request.topics : state.weeks[0]?.topics || [];
  const topics = current.filter((item) => item.name?.trim() && ['awareness', 'math', 'reasoning'].includes(item.section));
  if (!topics.length) throw new Error('Mark this week’s studied topics first');
  const count = Math.max(10, Math.min(60, Number(request.count) || 30));
  const weak = weakTopics(state).slice(0, 6);
  const weakCount = weak.length ? Math.round(count * 0.2) : 0;
  return [...distribute(topics, count - weakCount), ...distribute(weak, weakCount)];
}

function mergeGroups(groups) {
  const merged = new Map();
  for (const group of groups) {
    const key = `${group.section}:${group.topic.toLowerCase()}`;
    if (merged.has(key)) merged.get(key).count += group.count;
    else merged.set(key, { ...group });
  }
  return [...merged.values()];
}

function sourcesFromState(state, request, topic, materialOnly = false) {
  const sourceIds = new Set(request.materialIds || []);
  const selected = state.materials.filter((item) => sourceIds.has(item.id) && item.extractedText?.trim()).map((item) => ({
    id: item.id, label: item.name,
    text: materialOnly ? (item.detectedTopics || []).filter(entry => entry.name.toLowerCase() === topic.toLowerCase())
      .flatMap(entry => entry.ranges).map(range => item.extractedText.slice(range.start, range.end)).join('\n\n') : item.extractedText,
    url: null,
  }));
  if (materialOnly) return selected.filter(source => source.text.trim());
  const pages = state.sourcePages.filter((item) => (request.sourceIds || []).includes(item.id) || item.topic?.toLowerCase() === topic.toLowerCase());
  return [...selected, ...pages.map((page) => ({ id: page.id, label: page.label, text: page.text, url: page.url }))].slice(0, 5);
}

async function findSources({ ai, store, topic, section, hosts, progress }) {
  progress(`Finding approved sources for ${topic}`);
  const urls = await ai.discoverUrls({ topic, section, hosts });
  const pages = [];
  for (const url of urls.slice(0, 3)) {
    if (store.state.sourcePages.some((item) => item.url === url)) {
      const existing = store.state.sourcePages.find((item) => item.url === url);
      pages.push({ id: existing.id, label: existing.label, text: existing.text, url: existing.url });
      continue;
    }
    try {
      const fetched = await fetchApproved(url, hosts);
      if (fetched.text.length < 150) continue;
      const page = { id: randomUUID(), label: new URL(url).hostname, url: fetched.url, topic, date: fetched.date, text: fetched.text, addedAt: new Date().toISOString() };
      store.update((state) => state.sourcePages.push(page));
      pages.push(page);
    } catch { /* An inaccessible page cannot support questions. */ }
  }
  return pages;
}

export async function generateTest({ store, ai, request, progress = () => {} }) {
  const kind = ['topic', 'weekly', 'full'].includes(request.kind) ? request.kind : 'topic';
  const materialOnly = kind === 'topic' && !String(request.topic || '').trim();
  const inferred = materialOnly ? await analyzeMaterials({ store, ai, materialIds: request.materialIds, progress }) : [];
  const groups = mergeGroups(materialOnly
    ? distribute(interleaveSections(inferred), Math.max(5, Math.min(50, Number(request.count) || 20)))
    : plan(kind, request, store.state));
  const target = groups.reduce((sum, group) => sum + group.count, 0);
  const hosts = [...APPROVED_HOSTS, ...(store.state.settings.approvedHosts || [])];
  const materialVersions = materialOnly ? (request.materialIds || []).map(id => materialHash(store.state.materials.find(item => item.id === id)?.extractedText)) : [];
  const fingerprint = createHash('sha256').update(JSON.stringify({ kind, request, groups, materialVersions })).digest('hex');
  let draft = store.state.drafts.find((item) => item.fingerprint === fingerprint);
  if (!draft) {
    draft = { id: randomUUID(), fingerprint, request, kind, questions: [], target, createdAt: new Date().toISOString() };
    store.update((state) => state.drafts.unshift(draft));
  }
  const collected = [...draft.questions];
  progress(collected.length ? `Resuming ${collected.length}/${target} saved questions` : 'Starting question generation');
  if (!materialOnly) await ensurePastPaperPool({ store, ai, count: Math.round(target * 0.25), progress });
  const used = new Set(store.state.tests.flatMap((test) => test.questions.filter((question) => question.provenance?.kind === 'past_paper').map((question) => question.id)));
  collected.filter((question) => question.provenance?.kind === 'past_paper').forEach((question) => used.add(question.id));
  if (store.state.pastQuestions.length && store.state.pastQuestions.every((question) => used.has(question.id))) used.clear();
  let remainingPast = Math.max(0, Math.round(target * 0.25) - collected.filter((question) => question.provenance?.kind === 'past_paper').length);
  const allSourceIds = new Set();

  const saveDraft = () => store.update(() => { draft.questions = [...collected]; });

  for (const group of groups) {
    const already = collected.filter((question) => question.section === group.section && question.topic.toLowerCase() === group.topic.toLowerCase()).length;
    if (already >= group.count) continue;
    let sources = sourcesFromState(store.state, request, group.topic, materialOnly);
    if (!materialOnly && group.section === 'awareness' && !sources.some((source) => source.url)) {
      const online = await findSources({ ai, store, topic: group.topic, section: group.section, hosts, progress });
      sources = [...online, ...sources].slice(0, 5);
    }
    sources.forEach((source) => allSourceIds.add(source.id));
    const pastWanted = materialOnly ? 0 : Math.min(group.count - already, remainingPast, Math.max(1, Math.round(group.count * 0.25)));
    const past = choosePastQuestions(store.state.pastQuestions, [...used], pastWanted, group.section, kind === 'full' ? [] : [group.topic]);
    for (const question of past) { collected.push(question); used.add(question.id); }
    if (past.length) saveDraft();
    remainingPast -= past.length;
    let needed = group.count - already - past.length;
    let generatedCount = 0;
    let tries = 0;
    while (needed > 0 && tries < Math.ceil(group.count / 10) + 2) {
      tries++;
      progress(`Writing ${group.topic} · ${collected.length}/${target} questions`);
      const examples = store.state.pastQuestions.filter((item) => item.section === group.section).slice(0, 4);
      let batch = await ai.generateBatch({
        section: group.section, topics: [group.topic], count: Math.min(10, needed),
        sources, examples, approvedHosts: hosts, materialOnly,
      });
      if (materialOnly) batch = batch.map(question => ({ ...question, topic: group.topic }));
      if (!batch.length) break;
      batch = batch.filter((question) => !collected.some((existing) => existing.stem.toLowerCase() === question.stem.toLowerCase()));
      if (!batch.length) break;
      progress(`Checking ${group.topic} answers`);
      const checked = await ai.auditQuestions(batch, sources);
      const accepted = checked.slice(0, needed);
      collected.push(...accepted);
      if (accepted.length) saveDraft();
      generatedCount += accepted.length;
      needed = group.count - already - past.length - generatedCount;
      if (!checked.length) break;
    }
  }
  if (!collected.length) throw new Error('No defensible questions could be made from the selected material and approved sources');
  const actualKind = kind === 'full' && collected.length < 100 ? 'practice' : kind;
  const retryQuestions = kind === 'weekly' ? retriesFromPreviousWeekly(store.state) : [];
  const test = createTest({
    kind: actualKind, questions: collected, retryQuestions,
    topics: groups.map(({ topic, section }) => ({ name: topic, section })),
    sourceIds: [...allSourceIds], requestedCount: target,
    durationMinutes: actualKind === 'full' ? 90 : actualKind === 'topic' && Number(request.durationMinutes) >= 1 && Number(request.durationMinutes) <= 180 ? Number(request.durationMinutes) : undefined,
  });
  if (materialOnly) test.title = 'Document test';
  if (kind === 'full' && actualKind === 'practice') test.notice = 'This is a shorter practice test. There were not enough verified questions for a 100-question full mock.';
  if (collected.length < target && kind !== 'full') test.notice = `Only ${collected.length} defensible questions were available. The timer was scaled to the shorter test.`;
  store.update((state) => {
    state.tests.unshift(test);
    state.drafts = state.drafts.filter((item) => item.id !== draft.id);
  });
  progress('Test ready');
  return test;
}
