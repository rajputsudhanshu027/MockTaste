import { randomUUID } from 'node:crypto';

export const SECTIONS = Object.freeze({
  awareness: 'General Awareness',
  math: 'Mathematics',
  reasoning: 'General Intelligence & Reasoning',
});

export const FULL_BLUEPRINT = Object.freeze({ awareness: 40, math: 30, reasoning: 30 });
export const APPROVED_HOSTS = Object.freeze([
  'rrbcdg.gov.in', 'rrbchennai.gov.in', 'pib.gov.in', 'rbi.org.in',
  'isro.gov.in', 'prepp.in', 'adda247.com',
]);

export function allowedSource(rawUrl, hosts = APPROVED_HOSTS) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return hosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function minutesForQuestions(count) {
  return Math.round(count * 0.9 * 10) / 10;
}

export function validateQuestion(question) {
  if (!question || typeof question !== 'object') return 'Question is missing';
  if (!Object.hasOwn(SECTIONS, question.section)) return 'Unknown section';
  if (typeof question.stem !== 'string' || question.stem.trim().length < 12) return 'Question text is too short';
  if (!Array.isArray(question.options) || question.options.length !== 4) return 'Exactly four options are required';
  const options = question.options.map((option) => String(option).trim());
  if (options.some((option) => !option) || new Set(options.map((option) => option.toLowerCase())).size !== 4) return 'Options must be distinct';
  if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3) return 'Answer key is invalid';
  if (typeof question.explanation !== 'string' || question.explanation.trim().length < 8) return 'Explanation is missing';
  if (question.section === 'awareness') {
    if (!question.sourceReference?.label || !question.sourceReference?.location) return 'Factual answer needs a source reference';
    if (question.sourceReference.url && !allowedSource(question.sourceReference.url, question.allowedHosts || APPROVED_HOSTS)) return 'Source URL is not approved';
  } else if (!question.workedSolution || String(question.workedSolution).trim().length < 8) {
    return 'Mathematics or reasoning answer needs a worked solution';
  }
  return null;
}

export function scoreQuestions(questions, answers = {}, flaggedIds = []) {
  const flagged = new Set(flaggedIds);
  const bySection = {};
  const byTopic = {};
  const totals = { correct: 0, wrong: 0, unanswered: 0, excluded: 0, score: 0, possible: 0 };
  for (const question of questions) {
    const section = bySection[question.section] ||= { correct: 0, wrong: 0, unanswered: 0, score: 0, possible: 0 };
    const topic = byTopic[question.topic || 'Uncategorised'] ||= { correct: 0, wrong: 0, unanswered: 0, score: 0, possible: 0 };
    if (flagged.has(question.id)) { totals.excluded++; continue; }
    totals.possible++; section.possible++; topic.possible++;
    const selected = answers[question.id];
    if (selected === undefined || selected === null || selected === '') {
      totals.unanswered++; section.unanswered++; topic.unanswered++;
    } else if (Number(selected) === question.answerIndex) {
      totals.correct++; section.correct++; topic.correct++;
      totals.score++; section.score++; topic.score++;
    } else {
      totals.wrong++; section.wrong++; topic.wrong++;
      totals.score -= 1 / 3; section.score -= 1 / 3; topic.score -= 1 / 3;
    }
  }
  const round = (group) => { group.score = Math.round(group.score * 100) / 100; };
  round(totals);
  Object.values(bySection).forEach(round);
  Object.values(byTopic).forEach(round);
  return { ...totals, bySection, byTopic };
}

export function choosePastQuestions(pool, usedIds, count, section = null, topics = []) {
  const used = new Set(usedIds);
  const topicSet = new Set(topics.map((topic) => topic.toLowerCase()));
  const matches = (question) => (!section || question.section === section) &&
    (!topicSet.size || topicSet.has(String(question.topic).toLowerCase()));
  const available = pool.filter((question) => !used.has(question.id) && matches(question));
  return available.slice(0, count);
}

export function createTest({ kind, questions, retryQuestions = [], topics = [], sourceIds = [], requestedCount, durationMinutes }) {
  const count = questions.length;
  if (!count) throw new Error('No defensible questions are available');
  if (kind === 'full' && count !== 100) throw new Error('A full mock must contain 100 defensible questions');
  const resolvedKind = ['full', 'weekly', 'topic', 'practice'].includes(kind) ? kind : 'topic';
  return {
    id: randomUUID(), kind: resolvedKind, createdAt: new Date().toISOString(),
    questions, retryQuestions, topics, sourceIds,
    requestedCount: requestedCount || count,
    durationMinutes: durationMinutes || (resolvedKind === 'full' ? 90 : minutesForQuestions(count)),
    pastPaperCount: questions.filter((question) => question.provenance?.kind === 'past_paper').length,
    status: 'ready',
  };
}

export function isSundayEvening(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return weekday === 'Sun' && hour >= 18;
}
