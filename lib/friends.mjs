import { randomUUID } from 'node:crypto';
import { scoreQuestions } from './core.mjs';

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validFriendToken = (token) => tokenPattern.test(token);

function error(message, status = 400) {
  const result = new Error(message);
  result.status = status;
  return result;
}

function sourceTest(state, id) {
  const test = state.tests.find((item) => item.id === id);
  if (!test) throw error('Test not found', 404);
  return test;
}

function activeLink(state, token) {
  if (!validFriendToken(token)) throw error('Exam not found', 404);
  const link = state.friendLinks.find((item) => item.token === token && !item.revokedAt);
  if (!link) throw error('Exam not found', 404);
  return link;
}

export function createFriendLink(store, testId) {
  sourceTest(store.state, testId);
  const existing = store.state.friendLinks.find((item) => item.testId === testId && !item.revokedAt);
  if (existing) return existing;
  const link = { token: randomUUID(), testId, createdAt: new Date().toISOString(), revokedAt: null };
  store.update((state) => state.friendLinks.unshift(link));
  return link;
}

export function revokeFriendLink(store, token) {
  const link = activeLink(store.state, token);
  store.update(() => { link.revokedAt = new Date().toISOString(); });
  return link;
}

export function friendPaper(state, token) {
  const link = activeLink(state, token);
  const test = sourceTest(state, link.testId);
  return {
    token,
    title: test.title || (test.kind === 'full' ? 'Full CBT-1 mock' : test.kind === 'weekly' ? 'Weekly test' : test.kind === 'topic' ? 'Topic test' : 'Practice test'),
    durationMinutes: test.durationMinutes,
    questions: test.questions.map(({ id, stem, options, section, topic }) => ({ id, stem, options, section, topic })),
  };
}

export function submitFriendPaper(store, token, input) {
  const link = activeLink(store.state, token);
  const test = sourceTest(store.state, link.testId);
  const studentName = String(input?.studentName || '').trim().slice(0, 100);
  if (!studentName) throw error('Enter your name');
  if (!input?.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) throw error('Answers are required');
  const answers = {};
  for (const question of test.questions) {
    const value = input.answers[question.id];
    if (value === undefined || value === null || value === '') continue;
    const selected = Number(value);
    if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) throw error('Invalid answer');
    answers[question.id] = selected;
  }
  const report = {
    id: randomUUID(), linkToken: token, testId: test.id, studentName,
    submittedAt: new Date().toISOString(), answers,
    result: scoreQuestions(test.questions, answers), guidance: '', reportToken: null,
  };
  store.update((state) => state.friendReports.unshift(report));
  return report;
}

export function friendReportDetail(state, id) {
  const report = state.friendReports.find((item) => item.id === id);
  if (!report) throw error('Report not found', 404);
  const test = sourceTest(state, report.testId);
  return {
    ...report,
    review: test.questions.map((question, index) => ({
      number: index + 1, stem: question.stem, topic: question.topic,
      options: [...question.options], section: question.section,
      selected: report.answers[question.id] === undefined ? null : question.options[report.answers[question.id]],
      correct: question.options[question.answerIndex],
      right: report.answers[question.id] === question.answerIndex,
      explanation: question.explanation || '',
      workedSolution: question.workedSolution || '', sourceReference: question.sourceReference || null,
    })),
  };
}

export function saveGuidance(store, id, text) {
  const report = friendReportDetail(store.state, id);
  const saved = store.state.friendReports.find((item) => item.id === report.id);
  store.update(() => { saved.guidance = String(text || '').trim().slice(0, 5000); });
  return friendReportDetail(store.state, id);
}

export function releaseFriendReport(store, id) {
  const report = store.state.friendReports.find((item) => item.id === id);
  if (!report) throw error('Report not found', 404);
  if (!report.guidance.trim()) throw error('Write guidance before sharing the report');
  if (!report.reportToken) store.update(() => { report.reportToken = randomUUID(); });
  return report;
}

export function revokeFriendReport(store, id) {
  const report = store.state.friendReports.find((item) => item.id === id);
  if (!report) throw error('Report not found', 404);
  store.update(() => { report.reportToken = null; });
  return report;
}

export function publicReport(state, token) {
  if (!validFriendToken(token)) throw error('Report not found', 404);
  const report = state.friendReports.find((item) => item.reportToken === token);
  if (!report) throw error('Report not found', 404);
  return {
    studentName: report.studentName, submittedAt: report.submittedAt,
    result: report.result, guidance: report.guidance,
  };
}
