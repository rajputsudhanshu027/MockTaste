import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReportPdf, reportFilename } from '../lib/report-pdf.mjs';

const fixture = () => ({
  studentName: 'Zoë Martin', submittedAt: '2026-11-01T18:30:00Z', guidance: 'Revise percentages before your next test.',
  result: { score: -0.33, possible: 2, correct: 0, wrong: 1, unanswered: 1,
    bySection: { math: { correct: 0, possible: 2 } }, byTopic: { Percentages: { correct: 0, possible: 2 } } },
  review: [
    { number: 1, stem: 'What is 10% of 200?', topic: 'Percentages', options: ['10', '20', '30', '40'], selected: '10', correct: '20', right: false,
      explanation: 'Multiply by ten and divide by one hundred.', workedSolution: '200 × 10 / 100 = 20.', sourceReference: { label: 'Study notes', location: 'Page 2' } },
    { number: 2, stem: 'What is 50% of 40?', topic: 'Percentages', options: ['10', '20', '30', '40'], selected: null, correct: '20', right: false },
  ],
});

test('PDF report contains scores, Unicode names, feedback and complete answer review', async () => {
  const pdf = await createReportPdf(fixture(), { title: 'Weekly revision' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
  for (const expected of ['Zoë Martin', 'Weekly revision', '-0.33', 'Revise percentages', 'Section performance', 'Mathematics',
    'Topic performance', 'What is 10% of 200?', 'Your answer: 10', 'Correct answer: 20', 'Your answer: Unanswered', 'Study notes', 'Page 2']) {
    assert.ok(text.includes(expected), `Missing report content: ${expected}`);
  }
});

test('long reports paginate without losing questions or feedback', async () => {
  const report = fixture();
  report.guidance = 'Review the worked solution and explain each calculation. '.repeat(70);
  report.review = Array.from({ length: 100 }, (_, index) => ({ ...report.review[0], number: index + 1, stem: `Unique question ${index + 1}: ${report.review[0].stem}` }));
  const pdf = await createReportPdf(report);
  const info = execFileSync('pdfinfo', ['-'], { input: pdf, encoding: 'utf8' });
  assert.ok(Number(info.match(/Pages:\s+(\d+)/)?.[1]) > 3);
  const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
  assert.match(text, /Unique question 100:/);
  assert.match(text, /Page 1 of/);
});

test('feedback is optional and filenames cannot inject headers or paths', async () => {
  const report = fixture();
  report.guidance = '';
  const pdf = await createReportPdf(report);
  const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
  assert.doesNotMatch(text, /Feedback from the creator/);
  assert.equal(reportFilename('Zoë Martin'), 'rrb-report-Zoe-Martin.pdf');
  assert.match(reportFilename('../A\r\n"; malicious'), /^rrb-report-[a-z0-9_-]+\.pdf$/i);
});
