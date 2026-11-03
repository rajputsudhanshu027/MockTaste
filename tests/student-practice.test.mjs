import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFor, dateKey, generatePractice, practiceOptions, scorePractice } from '../lib/student-practice.mjs';

test('streak counts completed days, survives an unfinished today, and breaks after a missed day', () => {
  const attempts = ['2026-10-29', '2026-10-30', '2026-10-30', '2026-10-31'].map(day => ({ submittedAt: `${day}T12:00:00Z` }));
  const activity = activityFor(attempts, 'UTC', new Date('2026-11-01T16:00:00Z'));
  assert.equal(activity.current, 3);
  assert.equal(activity.longest, 3);
  assert.equal(activity.total, 4);
  assert.equal(activity.days.find(day => day.date === '2026-10-30').count, 2);
  assert.equal(activityFor(attempts, 'UTC', new Date('2026-11-02T16:00:00Z')).current, 0);
  assert.equal(activityFor([], 'UTC', new Date()).current, 0);
  assert.equal(activity.days.length, 371);
});

test('calendar uses account time zone, including year changes and DST', () => {
  assert.equal(dateKey('2026-12-31T20:00:00Z', 'Asia/Kolkata'), '2027-01-01');
  const attempts = ['2026-03-07T17:00:00Z', '2026-03-08T16:00:00Z', '2026-03-09T16:00:00Z'].map(submittedAt => ({ submittedAt }));
  assert.equal(activityFor(attempts, 'America/New_York', new Date('2026-03-09T20:00:00Z')).current, 3);
});

test('scoring keeps unanswered questions distinct from option zero and handles arbitrary topic names', () => {
  const paper = { penalty: 1 / 3, questions: [
    { id: 'a', answerIndex: 0, topic: '__proto__' }, { id: 'b', answerIndex: 1, topic: 'Literature' },
    { id: 'c', answerIndex: 0, topic: 'Literature' }, { id: 'd', answerIndex: 0, topic: 'Literature' },
  ] };
  const score = scorePractice(paper, { a: 0, b: 0, c: '' });
  assert.equal(score.correct, 1);
  assert.equal(score.wrong, 1);
  assert.equal(score.unanswered, 2);
  assert.equal(score.score, 0.67);
  assert.equal(score.byTopic.__proto__.correct, 1);
});

test('test configuration rejects invalid counts, timers, difficulty, and penalties', () => {
  const options = { count: 10, minutes: 15, difficulty: 'medium', penalty: 0 };
  assert.equal(practiceOptions(options).durationMinutes, 15);
  for (const change of [{ count: 0 }, { count: 51 }, { count: 1.5 }, { minutes: -1 }, { minutes: 1000 }, { difficulty: 'unknown' }, { penalty: -1 }]) assert.throws(() => practiceOptions({ ...options, ...change }));
});

test('generation supports non-RRB subjects and requires exact source evidence plus an independent audit', async () => {
  const material = { id: 'biology', name: 'Biology notes', extractedText: 'Mitochondria produce ATP through cellular respiration. Cells need ATP for energy.' };
  const options = practiceOptions({ count: 2, minutes: 5, difficulty: 'medium' });
  const ai = { async request({ instructions, text }) {
    assert.doesNotMatch(instructions, /RRB|awareness|reasoning/);
    if (instructions.startsWith('Independently')) {
      return JSON.stringify({ checks: JSON.parse(text).questions.map(question => ({ id: question.id, valid: question.stem.includes('produces') })) });
    }
    return JSON.stringify({ questions: [
      { stem: 'Which organelle produces ATP?', options: ['Mitochondrion', 'Nucleus', 'Ribosome', 'Lysosome'], answerIndex: 0, explanation: 'Mitochondria produce ATP through cellular respiration.', topic: 'Cell biology', sourceId: material.id, sourceQuote: 'Mitochondria produce ATP through cellular respiration.' },
      { stem: 'Unsupported question?', options: ['A', 'B', 'C', 'D'], answerIndex: 0, explanation: 'Unsupported', sourceId: material.id, sourceQuote: 'This is not in the source material.' },
      { stem: 'Which process supplies ATP?', options: ['Respiration', 'Digestion', 'Diffusion', 'Osmosis'], answerIndex: 0, explanation: 'Respiration supplies ATP.', sourceId: material.id, sourceQuote: 'Mitochondria produce ATP through cellular respiration.' },
    ] });
  } };
  const generated = await generatePractice({ ai, materials: [material], options });
  assert.equal(generated.questions.length, 1);
  assert.equal(generated.questions[0].topic, 'Cell biology');
  assert.match(generated.notice, /Only 1 of 2/);
  await assert.rejects(generatePractice({ ai, materials: [{ ...material, extractedText: '' }], options }), /Read or add text/);
});
