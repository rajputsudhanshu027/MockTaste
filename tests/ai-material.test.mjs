import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatGPTAI } from '../lib/ai.mjs';

test('document maths questions need evidence of the method in the uploaded notes', async () => {
  const ai = new ChatGPTAI({});
  ai.request = async () => JSON.stringify({ questions: [
    { stem: 'What is 10% of 200?', options: ['10', '20', '30', '40'], answerIndex: 1,
      explanation: 'Multiply 200 by 10 and divide by 100.', workedSolution: '200 * 10 / 100 = 20.',
      topic: 'Percentages', sourceId: 'notes', sourceQuote: 'A percentage is a number out of 100.' },
    { stem: 'What is the square root of 81?', options: ['7', '8', '9', '10'], answerIndex: 2,
      explanation: '9 times 9 is 81.', workedSolution: '9 * 9 = 81.', topic: 'Roots', sourceId: 'notes', sourceQuote: 'Square roots reverse squaring.' },
  ] });
  const questions = await ai.generateBatch({ section: 'math', topics: ['Percentages'], count: 2, materialOnly: true,
    sources: [{ id: 'notes', label: 'Uploaded notes', text: 'A percentage is a number out of 100.' }],
  });
  assert.equal(questions.length, 1);
  assert.equal(questions[0].materialBased, true);
  assert.equal(questions[0].sourceReference.quote, 'A percentage is a number out of 100.');
});
