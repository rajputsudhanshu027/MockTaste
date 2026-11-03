import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateApiUrl } from '../mobile/src/api.mjs';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../mobile/app.config.js');

test('native and JavaScript network policies agree for HTTPS and local APK builds', () => {
  const previous = process.env.MOCKTASTE_LOCAL_NETWORK;
  try {
    for (const mode of [undefined, '0', '1']) {
      if (mode === undefined) delete process.env.MOCKTASTE_LOCAL_NETWORK;
      else process.env.MOCKTASTE_LOCAL_NETWORK = mode;
      delete require.cache[configPath];
      const { expo } = require(configPath);
      const native = expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')[1].android;
      assert.equal(expo.extra.allowLocalNetwork, mode === '1');
      assert.equal(native.usesCleartextTraffic, expo.extra.allowLocalNetwork);
      assert.equal(validateApiUrl('https://study.example', expo.extra.allowLocalNetwork), 'https://study.example');
      if (mode === '1') assert.equal(validateApiUrl('http://192.168.1.4:4175', expo.extra.allowLocalNetwork), 'http://192.168.1.4:4175');
      else assert.throws(() => validateApiUrl('http://192.168.1.4:4175', expo.extra.allowLocalNetwork));
      assert.throws(() => validateApiUrl('http://public.example', expo.extra.allowLocalNetwork));
    }
  } finally {
    if (previous === undefined) delete process.env.MOCKTASTE_LOCAL_NETWORK;
    else process.env.MOCKTASTE_LOCAL_NETWORK = previous;
    delete require.cache[configPath];
  }
});
