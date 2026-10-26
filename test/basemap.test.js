import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
process.env.TURNSTILE_ENABLED = 'false';
process.env.CARTO_BASEMAP_KEY = '';
const { server } = await import('../server.js');
let baseUrl;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('keyless sites advertise a dark basemap', async () => {
  const bootstrap = await (await fetch(`${baseUrl}/api/bootstrap`)).json();
  assert.equal(bootstrap.map.cartoBasemapKey, '');
  assert.equal(bootstrap.map.darkBasemapAvailable, true);
});

test('dashboard and shared results serve pinned local module renderer assets', async () => {
  for (const asset of [
    '/map-renderer.js',
    '/vendor/maplibre/maplibre-gl.mjs',
    '/vendor/maplibre/maplibre-gl-worker.mjs?v=6.15.0',
    '/vendor/maplibre/maplibre-gl.css',
    '/vendor/maplibre-leaflet/leaflet-maplibre-gl.js',
  ]) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/, asset);
    assert.ok((await response.text()).length > 100, asset);
  }
  const response = await fetch(`${baseUrl}/app`);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /connect-src[^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(csp, /worker-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval|worker-src[^;]*blob:/);
  const html = await response.text();
  assert.doesNotMatch(html, /maplibre-gl-csp|leaflet-maplibre-gl.js/);
  const app = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(app, /import ['"]\.\/map-renderer.js['"]/);
});

test('renderer is pinned to the reviewed 6.15.0 release', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.dependencies['maplibre-gl'], '6.15.0');
});
