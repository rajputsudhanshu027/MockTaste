// Freeze this paper's answers before yielding: another screen may become active
// while pending answer writes finish.
export async function submitPractice(api, paper, answers, pendingWrites, now = Date.now) {
  const snapshot = { ...answers };
  await pendingWrites;
  if (now() + paper.clockOffset < paper.deadline) await api.student(`/tests/${paper.test.id}/answers`, { method: 'POST', body: { answers: snapshot } });
  return api.student(`/tests/${paper.test.id}/submit`, { method: 'POST' });
}
