import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../lib/store.mjs';
import { generateTest } from '../lib/generate.mjs';

function fakeAI() {
  let sequence = 0;
  return {
    async discoverUrls() { return []; },
    async generateBatch({ section, topics, count, sources }) {
      if (section === 'awareness' && !sources.length) return [];
      return Array.from({ length: count }, () => {
        const number = ++sequence;
        return {
          id: `q-${number}`, stem: `What is the answer to question number ${number}?`,
          options: ['One', 'Two', 'Three', 'Four'], answerIndex: 1,
          explanation: 'The second option follows from the calculation.',
          workedSolution: section === 'awareness' ? '' : 'Calculate the result step by step.',
          topic: topics[0], section, provenance: { kind: 'practice' },
          sourceReference: section === 'awareness' ? { label: sources[0].label, location: 'Page 1' } : null,
        };
      });
    },
    async auditQuestions(questions) { return questions; },
  };
}

async function withStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-test-'));
  try { return await fn(new Store(dir)); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('weekly generation combines current topics, weak-topic practice, and separate exact retries', async () => {
  await withStore(async (store) => {
    const ai = fakeAI();
    const first = await generateTest({ store, ai, request: { kind: 'weekly', topics: [{ name: 'Percentages', section: 'math' }] } });
    assert.equal(first.questions.length, 30);
    assert.equal(first.durationMinutes, 27);
    const missed = first.questions[0];
    store.update((state) => state.attempts.unshift({
      id: 'attempt-one', testId: first.id, submittedAt: new Date().toISOString(),
      answers: { [missed.id]: 0 }, flaggedIds: [],
    }));
    const second = await generateTest({ store, ai, request: { kind: 'weekly', topics: [{ name: 'Algebra', section: 'math' }] } });
    assert.equal(second.questions.length, 30);
    assert.equal(second.questions.filter((question) => question.topic === 'Algebra').length, 24);
    assert.equal(second.questions.filter((question) => question.topic === 'Percentages').length, 6);
    assert.deepEqual(second.retryQuestions.map((question) => question.id), [missed.id]);
    assert.equal(second.questions.some((question) => question.id === missed.id), false);
  });
});

test('a partial full mock is labelled as shorter practice', async () => {
  await withStore(async (store) => {
    const result = await generateTest({ store, ai: fakeAI(), request: { kind: 'full' } });
    assert.equal(result.kind, 'practice');
    assert.equal(result.questions.length, 60);
    assert.match(result.notice, /not enough verified questions/);
  });
});

test('generation resumes saved checked questions after an AI usage interruption', async () => {
  await withStore(async (store) => {
    const ai = fakeAI();
    const original = ai.generateBatch;
    let calls = 0;
    ai.generateBatch = async (input) => {
      calls++;
      if (calls === 2) throw new Error('Plan limit reached');
      return original(input);
    };
    const request = { kind: 'topic', topic: 'Percentages', section: 'math', count: 20, durationMinutes: 18 };
    await assert.rejects(generateTest({ store, ai, request }), /Plan limit reached/);
    assert.equal(store.state.drafts.length, 1);
    assert.equal(store.state.drafts[0].questions.length, 10);

    const resumed = await generateTest({ store, ai, request });
    assert.equal(resumed.questions.length, 20);
    assert.equal(resumed.durationMinutes, 18);
    assert.equal(store.state.drafts.length, 0);
    assert.equal(new Set(resumed.questions.map((question) => question.stem)).size, 20);
  });
});

test('document test infers multiple subjects and stays within the uploaded notes', async () => {
  await withStore(async store => {
    store.update(state => state.materials.push({ id: 'notes', name: 'My PDF', extractedText: 'Percentages express a number out of 100. Number series use repeated rules.' }));
    store.update(state => state.pastQuestions.push({ id: 'unrelated-paper', stem: 'An unrelated paper question', topic: 'Percentages', section: 'math', provenance: { kind: 'past_paper' } }));
    const ai = fakeAI();
    ai.detectTopics = async () => [
      { name: 'Percentages', section: 'math', evidence: 'Percentages express a number out of 100.' },
      { name: 'Number series', section: 'reasoning', evidence: 'Number series use repeated rules.' },
    ];
    ai.discoverUrls = async () => assert.fail('Document tests must not pull unrelated online material');
    const generate = ai.generateBatch;
    ai.generateBatch = async input => {
      assert.equal(input.materialOnly, true);
      assert.ok(input.sources.some(source => source.id === 'notes'));
      return generate(input);
    };
    const result = await generateTest({ store, ai, request: { kind: 'topic', materialIds: ['notes'], count: 10, durationMinutes: 12 } });
    assert.equal(result.title, 'Document test');
    assert.equal(result.questions.length, 10);
    assert.equal(result.durationMinutes, 12);
    assert.deepEqual(result.topics.map(topic => topic.section), ['math', 'reasoning']);
    assert.equal(result.pastPaperCount, 0);
    assert.ok(result.questions.every(question => ['Percentages', 'Number series'].includes(question.topic)));
  });
});

test('short document tests cover mixed sections instead of only the first listed subjects', async () => {
  await withStore(async store => {
    const text = 'Study notes teach polity, rights, parliament, history, percentages and number series.';
    store.update(state => state.materials.push({ id: 'mixed', name: 'Mixed notes', extractedText: text }));
    const ai = fakeAI();
    ai.detectTopics = async () => [
      ...['Polity', 'Rights', 'Parliament', 'History'].map(name => ({ name, section: 'awareness', evidence: text })),
      { name: 'Percentages', section: 'math', evidence: text },
      { name: 'Number series', section: 'reasoning', evidence: text },
    ];
    const result = await generateTest({ store, ai, request: { kind: 'topic', materialIds: ['mixed'], count: 5 } });
    assert.deepEqual([...new Set(result.questions.map(question => question.section))], ['awareness', 'math', 'reasoning']);
  });
});
