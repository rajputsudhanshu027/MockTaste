import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { createTest, validateQuestion } from '../lib/core.mjs';

export const MOCK_KEY = 'friend-flow-check-v1';
export const MOCK_TITLE = 'Friend sharing mock · 8 questions';

function chooseQuestions(pool, section, count, usedStems) {
  const candidates = pool.filter(question => question.section === section && !validateQuestion(question) && !usedStems.has(question.stem.trim().toLowerCase()));
  const selected = [];
  const topics = new Set();
  for (const question of candidates) {
    if (topics.has(question.topic)) continue;
    selected.push(question);
    topics.add(question.topic);
    if (selected.length === count) break;
  }
  for (const question of candidates) {
    if (selected.length === count) break;
    if (!selected.includes(question)) selected.push(question);
  }
  if (selected.length !== count) throw new Error(`Need ${count} valid ${section} past-paper questions for the mock`);
  selected.forEach(question => usedStems.add(question.stem.trim().toLowerCase()));
  return selected.map(question => structuredClone(question));
}

export function seedFriendMock(store) {
  const existing = store.state.tests.find(test => test.mockKey === MOCK_KEY);
  if (existing) return { test: existing, created: false };
  const flagged = new Set(store.state.attempts.flatMap(attempt => attempt.flaggedIds || []));
  const pool = store.state.pastQuestions.filter(question => question.provenance?.kind === 'past_paper' && !flagged.has(question.id));
  const usedStems = new Set();
  const questions = [
    ...chooseQuestions(pool, 'math', 4, usedStems),
    ...chooseQuestions(pool, 'reasoning', 4, usedStems),
  ];
  const test = createTest({
    kind: 'practice', questions, retryQuestions: [], requestedCount: 8,
    durationMinutes: 8,
    topics: [...new Map(questions.map(question => [question.topic, { name: question.topic, section: question.section }])).values()],
  });
  test.title = MOCK_TITLE;
  test.mockKey = MOCK_KEY;
  test.notice = 'Feature check using third-party claimed past-paper questions already saved in your local pool. Their origin remains labelled during review.';
  store.update(state => state.tests.unshift(test));
  return { test, created: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const store = new Store(process.env.RRB_DATA_DIR || path.join(root, 'data'));
  const { test, created } = seedFriendMock(store);
  process.stdout.write(JSON.stringify({ id: test.id, title: test.title, questions: test.questions.length, pastPaperCount: test.pastPaperCount, created }) + '\n');
}
