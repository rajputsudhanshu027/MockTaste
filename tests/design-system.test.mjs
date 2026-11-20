import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const tokens = read('public/design-system/tokens.css');
const components = read('public/design-system/components.css');
const patterns = read('public/design-system/patterns.css');

test('shared components resolve their tokens and cannot introduce private colors or dimensions', () => {
  const definitions = new Set([...tokens.matchAll(/(--ds-[\w-]+)\s*:/g)].map(match => match[1]));
  const all = [tokens, components, patterns].join('\n');
  for (const [, reference] of all.matchAll(/var\((--ds-[\w-]+)/g)) {
    assert.ok(definitions.has(reference), `Undefined design token: ${reference}`);
  }
  for (const [name, css] of [['components', components], ['patterns', patterns]]) {
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i, `${name} must consume semantic color tokens`);
    const declarations = css.replace(/@media[^{}]+\{/g, '{');
    assert.doesNotMatch(declarations, /\b\d+(?:\.\d+)?(?:px|ms)\b/, `${name} must consume dimension and motion tokens`);
  }
});

test('authentication composes the shared system without private styles', () => {
  const source = read('public/workspace.js');
  const auth = source.slice(source.indexOf('function authPage()'), source.indexOf('function shell('));
  const css = `${components}\n${patterns}`;
  const classes = [...auth.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
  assert.ok(classes.length > 0);
  for (const name of classes) {
    assert.match(name, /^ds-/, `Private authentication class: ${name}`);
    assert.ok(css.includes(`.${name}`), `Missing system component: ${name}`);
  }
  assert.doesNotMatch(auth, /style=|#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(read('public/workspace.css'), /\.ds-|\.auth-(?:layout|card|main|form|switch|password)/);
  const html = read('public/workspace.html');
  for (const file of ['components.css', 'patterns.css']) assert.ok(html.includes(`/design-system/${file}`));
  assert.match(read('public/styles.css'), /@import url\("\/design-system\/tokens.css"\)/);
});
