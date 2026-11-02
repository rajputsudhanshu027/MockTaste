import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../lib/store.mjs';
import { MOCK_TITLE, seedFriendMock } from '../scripts/create-mock-test.mjs';

test('creates one eight-question friend mock from labelled local past-paper questions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-mock-'));
  try {
    const store = new Store(dir);
    const questions = ['math', 'reasoning'].flatMap(section => Array.from({ length: 4 }, (_, index) => ({
      id: randomUUID(), section, topic: `${section} topic ${index}`,
      stem: `What is the answer to ${section} item ${index}?`,
      options: ['First', 'Second', 'Third', 'Fourth'], answerIndex: 1,
      explanation: 'The second choice is correct.',
      workedSolution: 'The second choice follows from the steps.',
      provenance: { kind: 'past_paper', label: 'Third-party claimed paper' },
    })));
    store.update(state => { state.pastQuestions.push(...questions); });
    const first = seedFriendMock(store);
    const second = seedFriendMock(store);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.test.id, second.test.id);
    assert.equal(first.test.title, MOCK_TITLE);
    assert.equal(first.test.questions.length, 8);
    assert.equal(first.test.pastPaperCount, 8);
    assert.equal(first.test.questions.filter(question => question.section === 'math').length, 4);
    assert.equal(first.test.questions.filter(question => question.section === 'reasoning').length, 4);
    assert.equal(new Store(dir).state.tests.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
