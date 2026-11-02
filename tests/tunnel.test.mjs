import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { FriendTunnel } from '../lib/tunnel.mjs';
import fs from 'node:fs';

const marker = '<div class="brand">MockTaste</div>';
function launcher(children) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { child.emit('close', 0); };
    children.push(child);
    queueMicrotask(() => child.stderr.emit('data', `https://exam-${children.length}.trycloudflare.com`));
    return child;
  };
}

test('waits through public 404s and verifies the actual exam before publishing its URL', async () => {
  const children = [];
  let checks = 0;
  const tunnel = new FriendTunnel(4174, { launch: launcher(children), retryMs: 1, timeoutMs: 1000,
    request: async url => {
      assert.equal(url, 'https://exam-1.trycloudflare.com/exam/example');
      assert.equal(tunnel.url, '');
      checks++;
      return new Response(checks < 3 ? '' : marker, { status: checks < 3 ? 404 : 200 });
    },
  });
  try {
    assert.equal(await tunnel.ensure('/exam/example'), 'https://exam-1.trycloudflare.com');
    assert.equal(checks, 3);
    assert.equal(tunnel.url, 'https://exam-1.trycloudflare.com');
  } finally { tunnel.stop(); }
});

test('rejects an unreachable public URL instead of returning a broken link', async () => {
  const tunnel = new FriendTunnel(4174, { launch: launcher([]), retryMs: 1, timeoutMs: 15,
    request: async () => new Response('', { status: 404 }),
  });
  await assert.rejects(tunnel.ensure('/exam/example'), /not reachable/);
  assert.equal(tunnel.url, '');
});

test('rechecks cached tunnels and replaces a dead connection', async () => {
  const children = [];
  let broken = false;
  const tunnel = new FriendTunnel(4174, { launch: launcher(children), retryMs: 1, timeoutMs: 1000,
    request: async url => new Response(marker, { status: broken && url.includes('exam-1.') ? 404 : 200 }),
  });
  try {
    await tunnel.ensure('/exam/example');
    broken = true;
    assert.equal(await tunnel.ensure('/exam/example'), 'https://exam-2.trycloudflare.com');
    children[1].emit('close', 1);
    assert.equal(tunnel.url, '');
  } finally { tunnel.stop(); }
});

test('does not accept an unrelated page as a working exam', async () => {
  const tunnel = new FriendTunnel(4174, { launch: launcher([]), retryMs: 1, timeoutMs: 15,
    request: async () => new Response('Another website'),
  });
  await assert.rejects(tunnel.ensure('/exam/example'), /not reachable/);
});

test('concurrent link requests share one startup and validate both exam paths', async () => {
  const children = [];
  const paths = [];
  const tunnel = new FriendTunnel(4174, { launch: launcher(children), retryMs: 1, timeoutMs: 1000,
    request: async url => { paths.push(new URL(url).pathname); return new Response(marker); },
  });
  try {
    const urls = await Promise.all([tunnel.ensure('/exam/first'), tunnel.ensure('/exam/second')]);
    assert.deepEqual(urls, ['https://exam-1.trycloudflare.com', 'https://exam-1.trycloudflare.com']);
    assert.equal(children.length, 1);
    assert.ok(paths.includes('/exam/first'));
    assert.ok(paths.includes('/exam/second'));
  } finally { tunnel.stop(); }
});

test('isolates friend sharing from a personal cloudflared ingress configuration', async () => {
  const children = [];
  const launch = launcher(children);
  let configFile;
  const tunnel = new FriendTunnel(4174, { retryMs: 1, timeoutMs: 1000,
    launch(command, args) {
      assert.ok(args.includes('--config'));
      configFile = args[args.indexOf('--config') + 1];
      assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), {});
      assert.equal(args[args.indexOf('--url') + 1], 'http://127.0.0.1:4174');
      return launch();
    },
    request: async () => new Response(marker),
  });
  try { await tunnel.ensure('/exam/example'); }
  finally { tunnel.stop(); }
  assert.equal(fs.existsSync(configFile), false);
});
