import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTunnelUrl } from '../scripts/share.mjs';

test('extracts only a temporary Cloudflare tunnel address', () => {
  assert.equal(
    extractTunnelUrl('Your quick Tunnel has been created! https://quiet-moon-123.trycloudflare.com'),
    'https://quiet-moon-123.trycloudflare.com',
  );
  assert.equal(extractTunnelUrl('https://example.com'), null);
  assert.equal(extractTunnelUrl('https://quiet-moon.trycloudflare.com.evil.example'), null);
});
