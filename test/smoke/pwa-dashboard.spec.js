import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';

// Exercise a real installed prior worker, not a mocked CacheStorage upgrade.
for (const [fixture, oldCache] of [
  ['sw-configured-defaults-13.js', 'mesh-health-check-pwa-v1.4.0-configured-defaults-13'],
  ['sw-code-prefix-24.js', 'mesh-health-check-pwa-v1.4.0-code-prefix-24'],
]) {
  test(`prior PWA ${fixture} upgrades the shell and caches every local vector asset`, async ({ browser }) => {
    const previousWorker = await fs.readFile(new URL(`../fixtures/${fixture}`, import.meta.url), 'utf8');
    let upgraded = false;
    let assetStatus = 200;
    let failedAssetRequests = 0;
    const proxy = http.createServer(async (request, response) => {
      try {
        if (request.url === '/sw.js' && !upgraded) {
          response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
          response.end(previousWorker);
          return;
        }
        if (request.url === '/app.js' && assetStatus !== 200) {
          failedAssetRequests += 1;
          response.writeHead(assetStatus, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
          response.end('temporary asset failure');
          return;
        }
        const upstream = await fetch(`http://127.0.0.1:3091${request.url}`);
        let body = Buffer.from(await upstream.arrayBuffer());
        if (!upgraded && ['/', '/app'].includes(request.url)) {
          body = Buffer.from(body.toString().replace(/^.*\/vendor\/maplibre.*\n/gm, ''));
        }
        const headers = Object.fromEntries(upstream.headers);
        delete headers['content-encoding'];
        delete headers['content-length'];
        headers['cache-control'] = 'no-store';
        response.writeHead(upstream.status, headers);
        response.end(body);
      } catch (error) {
        response.writeHead(500);
        response.end(error.message);
      }
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${proxy.address().port}`;
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/privacy`);
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      });
      await expect.poll(() => page.evaluate(() => caches.keys())).toContain(oldCache);
      const oldShell = await page.evaluate(async (name) => (await (await caches.open(name)).match('/app')).text(), oldCache);
      expect(oldShell).not.toContain('/vendor/maplibre/');
      upgraded = true;
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
      await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 15000 }).toEqual([
        'mesh-health-check-pwa-v1.4.1-maplibre-25',
      ]);
      const cached = await page.evaluate(async () => {
        const cache = await caches.open('mesh-health-check-pwa-v1.4.1-maplibre-25');
        return { paths: (await cache.keys()).map((request) => { const url = new URL(request.url); return url.pathname + url.search; }), shell: await (await cache.match('/app')).text() };
      });
      expect(cached.paths).toEqual(expect.arrayContaining([
        '/map-renderer.js', '/vendor/maplibre/maplibre-gl.mjs',
        '/vendor/maplibre/maplibre-gl-worker.mjs?v=6.15.0',
        '/vendor/maplibre/maplibre-gl.css', '/vendor/maplibre-leaflet/leaflet-maplibre-gl.js',
      ]));
      expect(cached.paths).not.toContain('/vendor/maplibre/maplibre-gl-shared.mjs');
      expect(cached.shell).toContain('/app.js');
      expect(cached.shell).toContain('id="meshcore-scopes"');
      const source = await fs.readFile(new URL('../../public/app.js', import.meta.url), 'utf8');
      expect(await page.evaluate(async () => (await caches.match('/app.js')).text())).toBe(source);
      expect(await page.evaluate(async () => (await (await caches.open('mesh-health-check-pwa-v1.4.1-maplibre-25')).keys()).every((r) => new URL(r.url).origin === location.origin))).toBe(true);
      // Fetch through the controlling worker; a page route mock cannot inject worker network failures.
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      const readAsset = () => page.evaluate(async () => {
        const response = await fetch('/app.js');
        return { status: response.status, body: await response.text() };
      });
      assetStatus = 503;
      expect(await readAsset()).toEqual({ status: 200, body: source });
      expect(failedAssetRequests).toBeGreaterThan(0);
      expect(await page.evaluate(async () => (await caches.match('/app.js')).text())).toBe(source);
      await context.setOffline(true);
      expect(await readAsset()).toEqual({ status: 200, body: source });
      // Never requested before going offline: install must have warmed this exact query key.
      const workerSource = await fs.readFile(new URL('../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url), 'utf8');
      expect(await page.evaluate(async () => {
        const response = await fetch('/vendor/maplibre/maplibre-gl-worker.mjs?v=6.15.0');
        return { status: response.status, body: await response.text() };
      })).toEqual({ status: 200, body: workerSource });
      for (const path of ['/missing.js', '/missing.mjs', '/missing.css']) {
        expect(await page.evaluate(async (url) => {
          try { await fetch(url); return 'unexpected response'; } catch { return 'network error'; }
        }, path)).toBe('network error');
      }
      await context.setOffline(false);
      assetStatus = 404;
      expect((await readAsset()).status).toBe(404);
      expect(await page.evaluate(async () => (await caches.match('/app.js')).text())).toBe(source);
    } finally {
      await context.close();
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });
}
