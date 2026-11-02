import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePastPaperPool } from '../lib/papers.mjs';

const answerKeyText = `Q. 1 General Awareness question
Ans 1. A
2. B
3. C
4. D
Q. 1 What is twelve plus eight?
Ans 1. 18
[CORRECT] 2. 20
3. 22
4. 24
Q. 1 Which number comes next: 2, 4, 6?
Ans 1. 7
[CORRECT] 2. 8
3. 9
4. 10`;

test('automatically imports checked English paper questions once', async () => {
  const store = {
    state: { pastQuestions: [] },
    update(change) { change(this.state); },
  };
  let fetches = 0;
  const fetchPaper = async () => { fetches++; return { answerKeyText }; };
  const ai = {
    async enrichColorPaperQuestions({ candidates, url, label, provenance }) {
      return candidates.map((candidate, index) => ({
        ...candidate, id: `${candidate.section}-${index}`,
        provenance: { kind: 'past_paper', label: provenance, sourceUrl: url },
        sourceReference: { label, location: candidate.sourceLocation, url },
      }));
    },
    async auditQuestions(questions) { return questions; },
  };
  assert.equal(await ensurePastPaperPool({ store, ai, count: 2, fetchPaper }), 2);
  assert.equal(fetches, 1);
  assert.deepEqual(store.state.pastQuestions.map((item) => item.section), ['math', 'reasoning']);
  assert.equal(store.state.pastQuestions[0].provenance.label, 'Third-party claimed paper');
  assert.equal(await ensurePastPaperPool({ store, ai, count: 2, fetchPaper }), 0);
  assert.equal(fetches, 1);
});

test('unavailable paper downloads do not prevent test generation', async () => {
  const store = { state: { pastQuestions: [] }, update() {} };
  const imported = await ensurePastPaperPool({
    store, ai: {}, count: 3,
    fetchPaper: async () => { throw new Error('Unavailable'); },
  });
  assert.equal(imported, 0);
});
