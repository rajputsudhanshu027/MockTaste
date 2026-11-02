import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedSource, choosePastQuestions, createTest, isSundayEvening, minutesForQuestions, scoreQuestions, validateQuestion } from '../lib/core.mjs';

const question = (id, answerIndex = 1, section = 'math') => ({
  id, stem: `What is the answer to practice question ${id}?`,
  options: ['One', 'Two', 'Three', 'Four'], answerIndex,
  explanation: 'The answer follows from the calculation.',
  workedSolution: 'Calculate the result step by step.',
  topic: 'Arithmetic', section,
  provenance: { kind: 'practice' },
  sourceReference: section === 'awareness' ? { label: 'Reference', location: 'Page 2', url: 'https://www.pib.gov.in/example' } : null,
});

test('scores correct, wrong, unanswered, and excluded questions', () => {
  const questions = [question('a'), question('b'), question('c'), question('d')];
  const result = scoreQuestions(questions, { a: 1, b: 0, d: 3 }, ['d']);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 1);
  assert.equal(result.unanswered, 1);
  assert.equal(result.excluded, 1);
  assert.equal(result.possible, 3);
  assert.equal(result.score, 0.67);
  assert.equal(result.byTopic.Arithmetic.score, 0.67);
});

test('requires evidence for factual questions and worked solutions for others', () => {
  assert.equal(validateQuestion(question('math')), null);
  const factual = question('fact', 1, 'awareness');
  assert.equal(validateQuestion(factual), null);
  factual.sourceReference = null;
  assert.match(validateQuestion(factual), /source reference/);
  const maths = question('other');
  maths.workedSolution = '';
  assert.match(validateQuestion(maths), /worked solution/);
});

test('rejects unapproved and non-HTTPS source URLs', () => {
  assert.equal(allowedSource('https://www.pib.gov.in/example'), true);
  assert.equal(allowedSource('http://www.pib.gov.in/example'), false);
  assert.equal(allowedSource('https://pib.gov.in.evil.example/a'), false);
  assert.equal(allowedSource('https://127.0.0.1/private'), false);
});

test('full mocks retain the exact 100-question boundary', () => {
  assert.throws(() => createTest({ kind: 'full', questions: [question('one')] }), /100 defensible/);
  const practice = createTest({ kind: 'practice', questions: [question('one')] });
  assert.equal(practice.kind, 'practice');
  assert.equal(practice.durationMinutes, 0.9);
});

test('past-paper selection does not repeat used questions while pool remains', () => {
  const pool = [question('a'), question('b'), question('c')];
  assert.deepEqual(choosePastQuestions(pool, ['a'], 2).map((item) => item.id), ['b', 'c']);
});

test('weekly pacing and Sunday evening are based on IST', () => {
  assert.equal(minutesForQuestions(20), 18);
  assert.equal(minutesForQuestions(30), 27);
  assert.equal(isSundayEvening(new Date('2026-11-01T13:00:00.000Z')), true);
  assert.equal(isSundayEvening(new Date('2026-11-01T10:00:00.000Z')), false);
});
