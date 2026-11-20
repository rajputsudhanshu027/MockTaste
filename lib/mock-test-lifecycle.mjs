import { randomUUID } from 'node:crypto';
import { accountError } from './accounts.mjs';
import { scorePractice } from './student-practice.mjs';

export class MockTestLifecycle {
  constructor(store) {
    this.store = store;
  }

  attempt(test) {
    return this.store.state.attempts.find(item => item.testId === test.id) || null;
  }

  testView(test) {
    return {
      id: test.id,
      title: test.title,
      count: test.questions.length,
      durationMinutes: test.durationMinutes,
      difficulty: test.difficulty,
      penalty: test.penalty,
      createdAt: test.createdAt,
      startedAt: test.startedAt,
      notice: test.notice,
      attempt: this.attempt(test),
    };
  }

  detail(test, now = Date.now()) {
    const attempt = this.attempt(test);
    return {
      test: this.testView(test),
      questions: attempt ? test.questions : test.questions.map(({ id, stem, options, topic }) => ({ id, stem, options, topic })),
      answers: attempt?.answers || test.savedAnswers || {},
      deadline: test.startedAt ? Date.parse(test.startedAt) + test.durationMinutes * 60000 : null,
      serverNow: now,
    };
  }

  start(test, now = Date.now()) {
    if (!test.startedAt && !this.attempt(test)) {
      this.store.update(() => {
        test.startedAt = new Date(now).toISOString();
        test.savedAnswers = {};
      });
    }
    return this.detail(test);
  }

  assertCanSaveAnswers(test, now = Date.now()) {
    if (this.attempt(test)) throw accountError('This test is already submitted', 409);
    if (!test.startedAt) throw accountError('Start the test first', 409);
    if (now >= Date.parse(test.startedAt) + test.durationMinutes * 60000) throw accountError('Time ended. Submit your saved answers.', 409);
  }

  saveAnswers(test, answers, now = Date.now()) {
    this.assertCanSaveAnswers(test, now);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw accountError('Invalid answers');
    const savedAnswers = {};
    for (const [id, answer] of Object.entries(answers)) {
      if (!test.questions.some(question => question.id === id) || !Number.isInteger(answer) || answer < 0 || answer > 3) throw accountError('Invalid answer');
      savedAnswers[id] = answer;
    }
    this.store.update(() => { test.savedAnswers = savedAnswers; });
    return { saved: true };
  }

  submit(test, now = Date.now()) {
    if (this.attempt(test)) return false;
    if (!test.startedAt) throw accountError('Start the test first', 409);
    this.finish(test, new Date(now).toISOString());
    return true;
  }

  finishExpired(now = Date.now()) {
    for (const test of this.store.state.tests) {
      if (!test.startedAt || this.attempt(test)) continue;
      const deadline = Date.parse(test.startedAt) + test.durationMinutes * 60000;
      if (now >= deadline) this.finish(test, new Date(deadline).toISOString());
    }
  }

  finish(test, submittedAt) {
    const answers = { ...test.savedAnswers };
    const saved = {
      id: randomUUID(),
      testId: test.id,
      answers,
      result: scorePractice(test, answers),
      submittedAt,
    };
    this.store.update(value => value.attempts.unshift(saved));
  }
}
