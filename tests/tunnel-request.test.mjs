import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTunnelHost } from '../lib/tunnel-request.mjs';

test('uses system DNS when it resolves the tunnel hostname', async () => {
  const addresses = [{ address: '192.0.2.1', family: 4 }];
  assert.deepEqual(await resolveTunnelHost('example.trycloudflare.com', {
    systemLookup: async () => addresses,
    request: async () => assert.fail('DNS fallback is unnecessary'),
  }), addresses);
});

test('resolves quick tunnel hostnames through HTTPS when local DNS returns ENOTFOUND', async () => {
  const addresses = await resolveTunnelHost('example.trycloudflare.com', {
    systemLookup: async () => { throw Object.assign(new Error('DNS failure'), { code: 'ENOTFOUND' }); },
    request: async url => {
      assert.equal(new URL(url).hostname, '1.1.1.1');
      return Response.json({ Status: 0, Answer: [{ type: 1, data: '192.0.2.5' }] });
    },
  });
  assert.deepEqual(addresses, [{ address: '192.0.2.5', family: 4 }]);
});

test('does not accept missing DNS records as a working hostname', async () => {
  await assert.rejects(resolveTunnelHost('example.trycloudflare.com', {
    systemLookup: async () => { throw Object.assign(new Error('DNS failure'), { code: 'ENOTFOUND' }); },
    request: async () => Response.json({ Status: 3 }),
  }), /DNS failure/);
});
