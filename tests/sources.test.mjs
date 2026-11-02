import test from 'node:test';
import assert from 'node:assert/strict';
import { colorAnswerKeyText, paperLinksFromHtml, parseColorPaperQuestions } from '../lib/sources.mjs';

test('paper discovery keeps English UG CBT-1 PDFs and gives generic links useful labels', () => {
  const html = [
    '<a href="https://www.adda247.com/RRB-NTPC-UG-Answer-Key-English-07-08-2025-Shift-1-Paper.pdf">Click Here</a>',
    '<a href="https://www.adda247.com/RRB-NTPC-UG-CBT-2-Question-Paper-English.pdf">Click Here</a>',
    '<a href="https://www.adda247.com/RRB-NTPC-UG-Answer-Key-Hindi.pdf">Click Here</a>',
  ].join('');
  const links = paperLinksFromHtml(html, 'https://www.adda247.com/jobs/rrb-ntpc/', ['adda247.com']);
  assert.equal(links.length, 1);
  assert.match(links[0].label, /07 08 2025 Shift 1/);
  assert.equal(links[0].provenance, 'Third-party claimed paper');
});

test('PDF colour key survives extraction as an explicit answer marker', () => {
  const xml = `<pdf2xml><page>
    <fontspec id="0" color="#242424"/><fontspec id="2" color="#40c54a"/>
    <text font="0"><b>Q.1</b></text><text font="0">What is 10% of 200?</text>
    <text font="0">1. 10</text><text font="2">2. 20</text>
    <text font="0">3. 30</text><text font="0">4. 40</text>
  </page></pdf2xml>`;
  assert.match(colorAnswerKeyText(xml), /\[CORRECT\] 2\. 20/);
  assert.doesNotMatch(colorAnswerKeyText(xml), /\[CORRECT\] 1\. 10/);
});

test('colour-key parsing uses paper section order and preserves keyed options', () => {
  const text = [
    'Q.1', 'Which monument is in Agra?', 'Ans', '1. Red Fort', '[CORRECT] 2. Taj Mahal', '3. Gateway of India', '4. India Gate',
    'Q.1', 'What is 10 percent of 200?', 'Ans', '1. 10', '[CORRECT] 2. 20', '3. 30', '4. 40',
    'Q.1', 'Which number comes next in 2, 4, 6?', 'Ans', '1. 7', '[CORRECT] 2. 8', '3. 9', '4. 10',
  ].join('\n');
  const questions = parseColorPaperQuestions(text);
  assert.deepEqual(questions.map((question) => question.section), ['math', 'reasoning']);
  assert.deepEqual(questions.map((question) => question.answerIndex), [1, 1]);
  assert.equal(questions[0].stem, 'What is 10 percent of 200?');
});
