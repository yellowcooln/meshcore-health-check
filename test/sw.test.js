import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('PWA update uses a distinct cache and bypasses stale HTTP assets during install', async () => {
  const handlers = {};
  let name; let assets; let installed;
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    Request: class { constructor(url, options) { this.url = url; this.cache = options?.cache; } },
    self: { addEventListener: (event, fn) => { handlers[event] = fn; }, skipWaiting() {} },
    caches: { open: async (key) => { name = key; return { addAll: async (requests) => { assets = requests; } }; } },
  });
  handlers.install({ waitUntil: (promise) => { installed = promise; } });
  await installed;
  assert.notEqual(name, 'mesh-health-check-pwa-v1.4.0');
  assert.ok(assets.every((request) => request.cache === 'reload'));
});
