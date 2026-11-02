import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMaterials } from '../lib/material-topics.mjs';

function storeWith(text) {
  return { state: { materials: [{ id: 'notes', name: 'Untitled notes.pdf', extractedText: text }] }, update(run) { run(this.state); } };
}

test('identifies mixed subjects using evidence and reuses unchanged analysis', async () => {
  const store = storeWith('A percentage means a number out of 100. The Constitution came into force on 26 January 1950.');
  let calls = 0;
  const ai = { async detectTopics() { calls++; return [
    { name: 'Percentages', section: 'math', evidence: 'A percentage means a number out of 100.' },
    { name: 'Indian Constitution', section: 'awareness', evidence: 'The Constitution came into force on 26 January 1950.' },
    { name: 'Geometry', section: 'math', evidence: 'Triangles have three sides.' },
    { name: 'Unsupported', section: 'other', evidence: 'A percentage means a number out of 100.' },
  ]; } };
  const input = { store, ai, materialIds: ['notes', 'notes'] };
  const topics = await analyzeMaterials(input);
  assert.deepEqual(topics.map(topic => topic.name), ['Percentages', 'Indian Constitution']);
  await analyzeMaterials(input);
  assert.equal(calls, 1);
  store.state.materials[0].extractedText += ' New study content.';
  await analyzeMaterials(input);
  assert.equal(calls, 2);
});

test('reads later document packets rather than inferring topics only from the beginning', async () => {
  const store = storeWith('Introduction. '.repeat(1000) + 'A number series follows a repeated arithmetic rule.');
  const ai = { async detectTopics({ text }) { return text.includes('A number series follows')
    ? [{ name: 'Number series', section: 'reasoning', evidence: 'A number series follows a repeated arithmetic rule.' }] : []; } };
  const topics = await analyzeMaterials({ store, ai, materialIds: ['notes'] });
  assert.equal(topics[0].name, 'Number series');
  assert.ok(store.state.materials[0].detectedTopics[0].ranges[0].start > 0);
});

test('rejects unsupported or unreadable documents without inventing a subject', async () => {
  const store = storeWith('An advertisement unrelated to studying.');
  await assert.rejects(analyzeMaterials({ store, ai: { detectTopics: async () => [] }, materialIds: ['notes'] }), /No supported test topics/);
  await assert.rejects(analyzeMaterials({ store, ai: {}, materialIds: [] }), /Upload or select/);
});
