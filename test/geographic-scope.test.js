import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const keys = ['1', '2', '3'].map((n) => n.repeat(64));
async function fixture(overrides, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhc-scope-'));
  const saved = { ...process.env };
  const regions = path.join(dir, 'regions.json');
  fs.writeFileSync(regions, JSON.stringify({ type: 'FeatureCollection', features: [
    ['Massachusetts', 'New England', 0], ['New Jersey', 'Mid Atlantic', 2],
    ['Connecticut', 'New England', 4], ['Maine', 'New England', 6], ['New Hampshire', 'New England', 8],
  ].map(([label, macro, x]) => ({ type: 'Feature', properties: { label, macro }, geometry: {
    type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]],
  } })) }));
  Object.assign(process.env, {
    MESH_HEALTH_DISABLE_RUNTIME: 'false', TURNSTILE_ENABLED: 'false',
    OBSERVERS_FILE: path.join(dir, 'observers.json'),
    OBSERVER_ACTIVITY_FILE: path.join(dir, 'activity.json'), RESULTS_FILE: path.join(dir, 'results.json'),
    REGIONS_FILE: regions, REGION_NAME_PROPERTY: 'label', REGION_GROUP_PROPERTY: 'macro',
    ALLOWED_REGION_GROUPS: '', ALLOWED_REGIONS: '', INITIAL_REGION: '', KNOWN_OBSERVERS: '', OBSERVER_TOP_COUNT: '10',
    RATE_LIMIT_MAX: '100', ...overrides,
  });
  fs.writeFileSync(process.env.RESULTS_FILE, JSON.stringify({ version: 1, sessions: [{
    id: 'historical', code: 'MHC-AABBCC', createdAt: Date.now(), expiresAt: Date.now() + 60000,
    status: 'active', useCount: 1, maxUses: 3, allowlistEnabled: true,
    expectedObserverKeys: [keys[1]], expectedObserverSource: 'selected observer',
    receipts: [{ observerKey: keys[1], count: 1, firstSeenAt: Date.now() }],
  }] }));
  let mod;
  try {
    mod = await import(`../server.js?scope=${crypto.randomUUID()}`);
    await new Promise((resolve) => mod.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${mod.server.address().port}`;
    for (let i = 0; i < keys.length; i++) mod.ingestMqttMessage(`meshcore/TEST/${keys[i]}/status`, Buffer.from(JSON.stringify({
      name: `Observer ${i}`, ...(i < 2 ? { location: { latitude: 0.5, longitude: i * 2 + 0.5 } } : {}),
    })));
    await run({ mod, dir, url, bootstrap: async () => (await fetch(`${url}/api/bootstrap`)).json(),
      create: (body = {}) => fetch(`${url}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  } finally {
    if (mod) { mod.flushScheduledWrites(); await new Promise((resolve) => mod.server.close(resolve)); }
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('scope retains historical out-of-scope targets, receipts and scores across persistence', () => fixture({ ALLOWED_REGION_GROUPS: 'New England' }, async ({ url, create, mod, dir }) => {
  const session = await (await fetch(`${url}/api/sessions/historical`)).json();
  assert.deepEqual(session.expectedObservers.map((o) => o.key), [keys[1]]);
  assert.equal(session.healthPercent, 100);
  assert.equal(session.receipts.length, 1);
  await create();
  mod.flushScheduledWrites();
  const retained = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'))).sessions.find((s) => s.id === 'historical');
  assert.deepEqual(retained.expectedObserverKeys, [keys[1]]);
  assert.equal(retained.receipts.length, 1);
}));

test('blank scope preserves all observers including unknown locations', () => fixture({}, async ({ bootstrap }) => {
  assert.equal((await bootstrap()).observerDirectory.length, 3);
}));
test('group scope filters directory, hierarchy, dynamic defaults and new sessions without deleting metadata', () => fixture({ ALLOWED_REGION_GROUPS: 'New England' }, async ({ bootstrap, create, mod, dir }) => {
  const b = await bootstrap();
  assert.deepEqual(b.observerDirectory.map((o) => o.key), [keys[0]]);
  assert.deepEqual(b.availableRegions, ['Massachusetts']);
  assert.deepEqual(b.availableRegionGroups, ['New England']);
  assert.deepEqual(b.defaultObserverKeys, [keys[0]]);
  const response = await create();
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.deepEqual(session.expectedObservers.map((o) => o.key), [keys[0]]);
  assert.equal(session.allowlistEnabled, true);
  mod.flushScheduledWrites();
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'observers.json')));
  assert.ok(stored[keys[1]], 'out-of-scope MQTT metadata remains persisted');
}));
test('individual region and group lists have union semantics', () => fixture({ ALLOWED_REGION_GROUPS: 'New England', ALLOWED_REGIONS: 'New Jersey' }, async ({ bootstrap }) => {
  assert.equal((await bootstrap()).observerDirectory.length, 2);
}));
test('configured defaults are filtered, not replaced with out-of-scope targets', () => fixture({ ALLOWED_REGIONS: 'Massachusetts', KNOWN_OBSERVERS: keys.join(',') }, async ({ bootstrap }) => {
  assert.deepEqual((await bootstrap()).defaultObserverKeys, [keys[0]]);
}));
test('out-of-scope, mixed, and unknown custom session targets are rejected', () => fixture({ ALLOWED_REGION_GROUPS: 'New England' }, async ({ create }) => {
  for (const expectedObserverKeys of [[keys[1]], [keys[0], keys[1]], [keys[2]], ['F'.repeat(64)]]) {
    const response = await create({ expectedObserverKeys });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'observer_outside_geographic_scope');
  }
}));
test('no scoped default candidates never creates an unrestricted session', () => fixture({ ALLOWED_REGION_GROUPS: 'New England', KNOWN_OBSERVERS: keys[1] }, async ({ create, bootstrap }) => {
  assert.deepEqual((await bootstrap()).defaultObserverKeys, []);
  const response = await create();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'no_observers_in_geographic_scope');
}));
test('MA defaults keep NE directory and explicit CT selection; refresh and session fallback restore MA', () => fixture({ ALLOWED_REGION_GROUPS: 'New England', INITIAL_REGION: 'Massachusetts', OBSERVER_TOP_COUNT: '1' }, async ({ bootstrap, create, mod }) => {
  for (const [digit, longitude] of [['4', 4.5], ['5', 6.5], ['6', 8.5]]) {
    for (let n = 0; n < 3; n++) mod.ingestMqttMessage(`meshcore/TEST/${digit.repeat(64)}/status`, Buffer.from(JSON.stringify({ name: digit, location: { latitude: 0.5, longitude } })));
  }
  const b = await bootstrap();
  assert.deepEqual(b.availableRegions, ['Connecticut', 'Maine', 'Massachusetts', 'New Hampshire']);
  assert.deepEqual(b.defaultObserverKeys, [keys[0]], 'filter MA before ranking limit');
  assert.deepEqual(b.topObserverKeysByRegion.Connecticut, ['4'.repeat(64)]);
  const selected = await create({ expectedObserverKeys: ['4'.repeat(64)] });
  assert.equal(selected.status, 201);
  assert.deepEqual((await selected.json()).expectedObservers.map((o) => o.key), ['4'.repeat(64)]);
  assert.deepEqual((await bootstrap()).defaultObserverKeys, [keys[0]]);
  assert.deepEqual((await (await create()).json()).expectedObservers.map((o) => o.key), [keys[0]]);
}));

test('initial region uses activity defaults rather than fixed keys', () => fixture({ ALLOWED_REGION_GROUPS: 'New England', INITIAL_REGION: 'Massachusetts', KNOWN_OBSERVERS: keys[1] }, async ({ bootstrap, create }) => {
  assert.deepEqual((await bootstrap()).defaultObserverKeys, [keys[0]]);
  assert.equal((await create()).status, 201);
}));

test('empty geographic defaults without allow scope cannot create unrestricted sessions', () => fixture({ INITIAL_REGION: 'Maine' }, async ({ bootstrap, create }) => {
  assert.deepEqual((await bootstrap()).defaultObserverKeys, []);
  assert.equal((await create()).status, 400);
}));

for (const overrides of [{ INITIAL_REGION: 'Massachusets' }, { INITIAL_REGION: 'New Jersey', ALLOWED_REGION_GROUPS: 'New England' }, { INITIAL_REGION: 'Maine', REGIONS_FILE: '/missing/defaults.json' }, { ALLOWED_REGION_GROUPS: 'New Englad' }, { ALLOWED_REGIONS: 'Massachusets' }, { ALLOWED_REGION_GROUPS: 'New England', REGIONS_FILE: '/missing/scope.json' }]) {
  test(`invalid geographic configuration fails startup: ${JSON.stringify(overrides)}`, async () => {
    await assert.rejects(fixture(overrides, async () => {}), /geographic scope/i);
  });
}
