import { expect, test } from '@playwright/test';

// These proximity tests use synthetic observer/activity and geolocation fixtures,
// not live MQTT reception or a physical device location.
async function openNearbyFixture(page, { mode = 'success', rows, bootstrapOverrides = {} } = {}) {
  const now = Date.now();
  const observers = rows || Array.from({ length: 12 }, (_, i) => ({
    ...mapObserver((i + 1).toString(16).padStart(64, '0'), `Nearby ${i + 1}`, 42, -71, null),
    lastPacketAt: now - 1000,
  })).reverse();
  await page.addInitScript((mode) => {
    window.WebSocket = class { addEventListener() {} close() {} };
    window.geoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { value: mode === 'unavailable' ? undefined : {
      clearWatch() { window.geoCleared = (window.geoCleared || 0) + 1; },
      watchPosition(success, failure, options) {
        window.geoOptions = options;
        window.geoCalls++;
        if (mode === 'denied') failure({ code: 1 });
        else if (mode === 'timeout') failure({ code: 3 });
        else if (mode === 'delayed') window.completeGeo = () => success({ coords: { latitude: 42, longitude: -71 } });
        else if (mode === 'coarse') { window.completeGeo = success; success({ coords: { latitude: 42, longitude: -71, accuracy: 50000 } }); }
        else success({ coords: { latitude: 42, longitude: -71, accuracy: 25 } });
        return 7;
      },
    } });
    if (mode === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false });
  }, mode);
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...mapBootstrap(observers, ''), ...bootstrapOverrides } }));
  let session;
  await page.route('**/api/sessions', (route) => {
    const keys = route.request().postDataJSON().expectedObserverKeys;
    session = { ...mapSession(keys.length ? observers.filter((o) => keys.includes(o.key)) : observers), status: 'waiting' };
    return route.fulfill({ json: session });
  });
  await page.route('**/api/sessions/map-session', (route) => route.fulfill({ json: session }));
  await page.goto('/app');
  await expect(page.locator('#session-code')).toContainText('MHC-');
  return observers;
}

test('nearby blue dot appears only on selection and marks the chosen point', async ({ page }) => {
  await captureMap(page);
  await openNearbyFixture(page);
  const dot = page.locator('.nearby-origin-dot');
  await expect(dot).toHaveCount(0);
  await page.locator('#nearby-location').click();
  await expect(dot).toHaveCount(1);
  const origin = () => page.evaluate(() => {
    const layers = [];
    window.testMap.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker && layer.options.className === 'nearby-origin-dot') {
        layers.push({ point: layer.getLatLng(), color: layer.options.fillColor });
      }
    });
    return layers;
  });
  expect(await origin()).toEqual([{ point: { lat: 42, lng: -71 }, color: '#3b82f6' }]);
  await page.evaluate(() => window.testMap.setView([42.1, -71.1], 9, { animate: false }));
  expect((await origin())[0].point).toEqual({ lat: 42, lng: -71 });
  await page.evaluate(() => document.querySelector('#nearby-center').addEventListener('click', () => {
    window.clickedCenter = window.testMap.getCenter().wrap();
  }, { capture: true, once: true }));
  await page.locator('#nearby-center').click();
  await expect(dot).toHaveCount(1);
  expect((await origin())[0].point).toEqual(await page.evaluate(() => window.clickedCenter));
  await page.reload();
  await expect(page.locator('#session-code')).toContainText('MHC-');
  await expect(dot).toHaveCount(0);
});

test('repeated map-center searches preserve the panned viewport after browser location', async ({ page }) => {
  await captureMap(page);
  const rows = [42, 42.2, 42.4].map((lat, i) => ({
    ...mapObserver(String(i + 1).repeat(64), `Search area ${i}`, lat, -71, null),
    lastPacketAt: Date.now(),
  }));
  await openNearbyFixture(page, { rows });
  await page.locator('#nearby-radius').selectOption('5');
  await page.locator('#nearby-location').click();
  await expect(page.locator('#nearby-results li')).toHaveCount(1);
  await page.evaluate(() => {
    const map = window.testMap;
    map.stop();
    window.searchFits = [];
    const fit = map.fitBounds.bind(map);
    map.fitBounds = (...args) => { window.searchFits.push(args[0]); return fit(...args); };
    document.querySelector('#nearby-center').addEventListener('click', () => {
      window.searchView = { center: map.getCenter().wrap(), zoom: map.getZoom() };
    }, { capture: true });
  });
  for (const [lat, label] of [[42.03, 'Search area 0'], [42.18, 'Search area 1'], [42.38, 'Search area 2']]) {
    await page.evaluate((lat) => window.testMap.setView([lat, -71], 11, { animate: false }), lat);
    await page.locator('#nearby-center').click();
    await expect(page.locator('#nearby-results li')).toContainText([label]);
    // Observe the viewport through the debounced session replacement too.
    await page.waitForTimeout(700);
    const result = await page.evaluate(() => {
      const map = window.testMap;
      const dots = [];
      map.eachLayer((layer) => {
        if (layer.options.className === 'nearby-origin-dot') dots.push(layer.getLatLng());
      });
      return { fits: window.searchFits, selected: window.searchView,
        center: map.getCenter().wrap(), zoom: map.getZoom(), dots, geoCalls: window.geoCalls };
    });
    expect(result.fits).toEqual([]);
    // Leaflet invalidateSize can nudge the center by a few screen pixels.
    expect(result.center.lat).toBeCloseTo(result.selected.center.lat, 2);
    expect(result.center.lng).toBeCloseTo(result.selected.center.lng, 2);
    expect(result.zoom).toBe(result.selected.zoom);
    expect(result.dots).toEqual([result.selected.center]);
    expect(result.geoCalls).toBe(1);
  }
});

test('location requests high accuracy and displays browser accuracy', async ({ page }) => {
  await openNearbyFixture(page);
  await page.getByRole('button', { name: 'Use my location' }).click();
  expect(await page.evaluate(() => window.geoOptions)).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  await expect(page.locator('#nearby-status')).toContainText('0.02 mi');
});

test('coarse location requires explicit acceptance and cleans up watch', async ({ page }) => {
  await openNearbyFixture(page, { mode: 'coarse' });
  await page.clock.install();
  await page.locator('#nearby-location').click();
  await expect(page.locator('#nearby-results li')).toHaveCount(0);
  await page.clock.fastForward(12001);
  await expect(page.locator('#nearby-status')).toContainText('31.1 mi');
  await expect(page.locator('#nearby-status')).toContainText('selection unchanged');
  await expect(page.locator('#nearby-results li')).toHaveCount(0);
  expect(await page.evaluate(() => window.geoCleared)).toBe(1);
  await page.locator('#nearby-approximate').click();
  await expect(page.locator('#nearby-results li')).toHaveCount(10);
  await expect(page.locator('#nearby-approximate')).toBeHidden();
});

test('improved browser fix completes early without approximate confirmation', async ({ page }) => {
  await openNearbyFixture(page, { mode: 'coarse' });
  await page.locator('#nearby-location').click();
  await page.evaluate(() => window.completeGeo({ coords: { latitude: 42, longitude: -71, accuracy: 25 } }));
  await expect(page.locator('#nearby-results li')).toHaveCount(10);
  await expect(page.locator('#nearby-approximate')).toBeHidden();
  expect(await page.evaluate(() => window.geoCleared)).toBe(1);
});

for (const unit of ['mi', 'km']) {
  test(`configured default reload and 5 ${unit} filtering`, async ({ page }) => {
    const rows = [mapObserver('A'.repeat(64), 'Six km away', 42.054, -71, null)];
    rows[0].lastPacketAt = Date.now();
    await openNearbyFixture(page, { rows, bootstrapOverrides: { observerStats: { distanceUnit: unit, nearbyDefaultRadius: 15, windowSeconds: 14400 } } });
    await expect(page.locator('#nearby-radius')).toHaveValue('15');
    expect(await page.locator('#nearby-radius option').evaluateAll((options) => options.map((o) => o.value))).toEqual(['5','10','15','20','25','50','75','100','150','200']);
    await page.locator('#nearby-radius').selectOption('5');
    await page.locator('#nearby-location').click();
    await expect(page.locator('#nearby-radius')).toHaveValue('5');
    await expect(page.locator('#nearby-results li')).toHaveCount(unit === 'mi' ? 1 : 0);
    await page.reload();
    await expect(page.locator('#nearby-radius')).toHaveValue('15');
    expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  });
}

test('public privacy page and footer work without authentication', async ({ page, request }) => {
  const response = await request.get('/privacy');
  expect(response.status()).toBe(200);
  await page.goto('/app');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
});

test('Default Set ranks within selected state and reload restores MA markers', async ({ page }) => {
  await captureMap(page);
  const rows = [mapObserver('A'.repeat(64), 'MA observer', 42, -71, 'Massachusetts'), mapObserver('B'.repeat(64), 'CT top', 41.6, -72.7, 'Connecticut'), mapObserver('C'.repeat(64), 'CT lower', 41.5, -72.8, 'Connecticut')];
  await openNearbyFixture(page, { rows, bootstrapOverrides: {
    defaultRegions: ['Massachusetts'], defaultObserverKeys: [rows[0].key], defaultObservers: [rows[0]], defaultObserverSource: 'top-window',
    topObserverKeysByRegion: { Massachusetts: [rows[0].key], Connecticut: [rows[1].key] },
  } });
  await page.getByRole('button', { name: /^Connecticut/ }).click();
  await page.getByRole('button', { name: 'Default Set', exact: true }).click();
  await expect.poll(async () => (await mappedState(page)).markers.map((m) => /CT top/.test(m.popup))).toEqual([true]);
  await page.reload();
  await expect.poll(async () => (await mappedState(page)).markers.map((m) => /MA observer/.test(m.popup))).toEqual([true]);
});

test('All selects the allowed scope, Default Set ranks that scope, reload restores MA', async ({ page }) => {
  const targets = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/sessions') && request.method() === 'POST') {
      targets.push(request.postDataJSON().expectedObserverKeys);
    }
  });
  await captureMap(page);
  const rows = [
    mapObserver('A'.repeat(64), 'MA observer', 42, -71, 'Massachusetts'),
    mapObserver('B'.repeat(64), 'CT top', 41.6, -72.7, 'Connecticut'),
    mapObserver('C'.repeat(64), 'ME observer', 44.3, -69.8, 'Maine'),
    mapObserver('D'.repeat(64), 'NH observer', 43.2, -71.5, 'New Hampshire'),
  ];
  await openNearbyFixture(page, { rows, bootstrapOverrides: {
    defaultRegions: ['Massachusetts'], defaultObserverKeys: [rows[0].key], defaultObservers: [rows[0]],
    defaultObserverSource: 'top-window', topObserverKeys: [rows[1].key],
    topObserverKeysByRegion: { Massachusetts: [rows[0].key] },
  } });
  await expect.poll(async () => (await mappedState(page)).markers.map((m) => /MA observer/.test(m.popup))).toEqual([true]);
  await page.getByRole('button', { name: /^All(?: regions)?\s/ }).click();
  await expect(page.locator('#observer-allowlist input:checked')).toHaveCount(4);
  await expect.poll(async () => (await mappedState(page)).markers.length).toBe(4);
  await expect.poll(async () => {
    const all = await mappedState(page);
    return rows.every((row) => all.markers.some((m) => m.popup.includes(row.name) && m.visible));
  }).toBe(true);
  await page.getByRole('button', { name: 'Default Set', exact: true }).click();
  await expect.poll(async () => (await mappedState(page)).markers.map((m) => /CT top/.test(m.popup))).toEqual([true]);
  await expect.poll(() => targets.at(-1)).toEqual([rows[1].key]);
  await page.reload();
  await expect.poll(async () => (await mappedState(page)).markers.map((m) => /MA observer/.test(m.popup))).toEqual([true]);
});

async function captureMap(page) {
  await page.route('**/vendor/leaflet/leaflet.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst originalMap = L.map; L.map = (...args) => (window.testMap = originalMap(...args));` });
  });
}

async function mappedState(page) {
  await page.waitForFunction(() => window.testMap);
  return page.evaluate(() => {
    const markers = [];
    window.testMap.eachLayer((layer) => {
      if (layer instanceof L.Marker) markers.push({ popup: layer.getPopup().getContent(), visible: window.testMap.getBounds().contains(layer.getLatLng()) });
    });
    return { markers, center: window.testMap.getCenter(), zoom: window.testMap.getZoom() };
  });
}

for (const used of [false, true]) {
  test(`map follows nearby then region and default reload with ${used ? 'used' : 'unused'} session`, async ({ page }) => {
    await captureMap(page);
    const rows = Array.from({ length: 7 }, (_, i) => ({
      ...mapObserver((i + 1).toString(16).padStart(64, '0'), `Transition ${i}`, i < 5 ? 42 + i / 100 : 48 + i / 100, i < 5 ? -71 : 2, i < 5 ? 'BOS' : 'CDG'),
      lastPacketAt: Date.now(),
    }));
    await openNearbyFixture(page, { rows });
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.locator('#nearby-results li')).toHaveCount(5);
    await page.waitForTimeout(500);
    expect((await mappedState(page)).markers).toHaveLength(5);
    if (used) {
      const historical = { ...mapSession(rows.slice(0, 5)), status: 'active', useCount: 1 };
      await page.route('**/api/sessions/map-session', (route) => route.fulfill({ json: historical }));
      await page.reload();
      await expect(page.locator('#observed-count')).toHaveText('0 / 5');
      await expect.poll(async () => (await mappedState(page)).markers.length).toBe(7);
    }
    await page.getByRole('button', { name: /^CDG/ }).click();
    await expect.poll(async () => (await mappedState(page)).markers.length).toBe(2);
    const region = await mappedState(page);
    expect(region.markers.every((m) => /Transition [56]/.test(m.popup) && m.visible)).toBe(true);
    expect(region.center.lng).toBeGreaterThan(0);
    await page.reload();
    await expect.poll(async () => (await mappedState(page)).markers.length).toBe(7);
    const defaults = await mappedState(page);
    expect(defaults.markers.every((m) => m.visible)).toBe(true);
    expect(defaults.zoom).toBeLessThan(region.zoom);
    expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  });
}

test('reload resets nearby and stale storage to website defaults', async ({ page }) => {
  const rows = await openNearbyFixture(page);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#nearby-results li')).toHaveCount(10);
  await page.waitForTimeout(400);
  await page.evaluate((key) => {
    localStorage.setItem('mesh-health-check-observer-allowlist', JSON.stringify([key]));
    sessionStorage.setItem('mesh-health-check-observer-allowlist', JSON.stringify([key]));
  }, rows[0].key);
  await page.reload();
  await expect(page.locator('#observer-allowlist-note')).toContainText('Default:');
  await expect(page.locator('#observer-allowlist input:checked')).toHaveCount(rows.length);
  await expect(page.locator('#nearby-results li')).toHaveCount(0);
  expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  await expect(page.locator('#observed-count')).toContainText(String(rows.length));
});

test('reload preserves a used session without restoring its custom selection', async ({ page }) => {
  const rows = await openNearbyFixture(page);
  const used = { ...mapSession([rows[0]]), useCount: 1, status: 'active' };
  await page.route('**/api/sessions/map-session', (route) => route.fulfill({ json: used }));
  let posts = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/sessions') && request.method() === 'POST') posts++;
  });
  await page.reload();
  await expect(page.locator('#observer-allowlist-note')).toContainText('Default:');
  await expect(page.locator('#observer-allowlist input:checked')).toHaveCount(rows.length);
  await expect(page.locator('#session-code')).toHaveText(used.code);
  await expect(page.locator('#observed-count')).toHaveText('0 / 1');
  expect(posts).toBe(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mesh-health-check-session-history')))).toContain(used.id);
});

for (const unit of ['mi', 'km']) {
  test(`nearby uses configured ${unit} for radius and distances`, async ({ page }) => {
    await openNearbyFixture(page);
    await page.route('**/api/bootstrap', (route) => {
      const data = mapBootstrap([{ ...mapObserver(MAP_TEST_KEYS.target, 'Offset', 42.5, -71, null), lastPacketAt: Date.now() }], '');
      data.observerStats.distanceUnit = unit;
      return route.fulfill({ json: data });
    });
    await page.reload();
    await expect(page.locator('#nearby-radius option:checked')).toHaveText(`100 ${unit}`);
    await page.locator('#nearby-radius').selectOption('50');
    await page.getByRole('button', { name: 'Use my location' }).click();
    if (unit === 'mi') {
      await expect(page.locator('#nearby-results li')).toContainText('34.5 mi');
    } else {
      await expect(page.locator('#nearby-status')).toContainText('No active observers');
    }
  });
}

test('nearby copy is sentence case and mobile controls fit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNearbyFixture(page);
  expect(await page.locator('#nearby-status').evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('nearby opt-in selects deterministic top ten, distances and keys-only session payload', async ({ page }) => {
  const rows = await openNearbyFixture(page);
  expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  const posted = page.waitForRequest((r) => r.url().endsWith('/api/sessions') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#nearby-status')).toContainText('10 selected');
  await expect(page.locator('#nearby-results li')).toHaveCount(10);
  await expect(page.locator('#nearby-results li').first()).toContainText('Nearby 1');
  await expect(page.locator('#nearby-results li').first()).toContainText('0.0 mi');
  const payload = (await posted).postDataJSON();
  expect(Object.keys(payload)).toEqual(['expectedObserverKeys']);
  expect(payload.expectedObserverKeys).toEqual(rows.map((o) => o.key).sort().slice(0, 10));
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('latitude');
  const selectedKey = await page.locator('#observer-allowlist input:checked').first().getAttribute('value');
  await page.locator(`#observer-allowlist input[value="${selectedKey}"]`).uncheck();
  await expect(page.locator('#nearby-results li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Default Set', exact: true }).click();
  await expect(page.locator('#observer-allowlist-note')).toContainText('Default:');
});

for (const mode of ['denied', 'unavailable', 'insecure', 'timeout']) {
  test(`nearby ${mode} location falls back explicitly to map center`, async ({ page }) => {
    await openNearbyFixture(page, { mode });
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.locator('#nearby-status')).toContainText('Location');
    await expect(page.locator('#nearby-status')).toContainText('map center');
    await expect(page.locator('#nearby-status')).toContainText('10 selected');
    if (mode === 'insecure' || mode === 'unavailable') expect(await page.evaluate(() => window.geoCalls)).toBe(0);
  });
}

test('nearby empty and stale activity preserve the previous observer selection', async ({ page }) => {
  const rows = [
    { ...mapObserver(MAP_TEST_KEYS.target, 'Stale', 42, -71, null), lastPacketAt: Date.now() - 1000000 },
    { ...mapObserver(MAP_TEST_KEYS.outside, 'Unknown', 42, -71, null) },
    { ...mapObserver(MAP_TEST_KEYS.zero, 'Bad coordinates', null, -71, null), lastPacketAt: Date.now() },
  ];
  await openNearbyFixture(page, { rows });
  const before = await page.locator('#observer-allowlist input:checked').evaluateAll((els) => els.map((el) => el.value));
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#nearby-status')).toContainText('No active observers');
  await expect(page.locator('#nearby-status')).toContainText('unchanged');
  expect(await page.locator('#observer-allowlist input:checked').evaluateAll((els) => els.map((el) => el.value))).toEqual(before);
});

test('nearby radius is explicit and map-center selection needs no location permission', async ({ page }) => {
  await openNearbyFixture(page);
  await expect(page.locator('#nearby-radius')).toHaveValue('100');
  await page.locator('#nearby-radius').selectOption('25');
  await page.getByRole('button', { name: 'Use map center', exact: true }).click();
  await expect(page.locator('#nearby-status')).toContainText('25 mi');
  await expect(page.locator('#nearby-status')).toContainText('10 selected');
  expect(await page.evaluate(() => window.geoCalls)).toBe(0);
});

test('late geolocation cannot overwrite a newer manual choice', async ({ page }) => {
  await openNearbyFixture(page, { mode: 'delayed' });
  await page.getByRole('button', { name: 'Use my location' }).click();
  const selectedKey = await page.locator('#observer-allowlist input:checked').first().getAttribute('value');
  await page.locator(`#observer-allowlist input[value="${selectedKey}"]`).uncheck();
  const before = await page.locator('#observer-allowlist input:checked').count();
  await page.evaluate(() => window.completeGeo());
  expect(await page.locator('#observer-allowlist input:checked').count()).toBe(before);
  await expect(page.locator('#nearby-results li')).toHaveCount(0);
});


const MAP_TEST_KEYS = {
  target: '1111111111111111111111111111111111111111111111111111111111111111',
  outside: '2222222222222222222222222222222222222222222222222222222222222222',
  zero: '3333333333333333333333333333333333333333333333333333333333333333',
};

function mapObserver(key, label, lat, lon, region) {
  return {
    key,
    hash: key.slice(0, 2),
    label,
    name: label,
    shortKey: `${key.slice(0, 6)}...${key.slice(-6)}`,
    lat,
    lon,
    hasLocation: true,
    region,
    regionGroup: null,
    isActive: true,
    isRetained: true,
    packetCount: 1,
  };
}

function mapBootstrap(observerDirectory, cartoBasemapKey = 'test-carto-key') {
  return {
    site: {
      title: 'MeshCore Observer Coverage',
      eyebrow: 'MeshCore Observer Coverage',
      headline: 'Check your mesh reach.',
      description: 'Generate a test code, send it to the configured channel, and watch observer coverage build in real time.',
      version: '1.4.0',
      repoUrl: 'https://github.com/yellowcooln/meshcore-health-check',
      changesUrl: 'https://github.com/yellowcooln/meshcore-health-check/blob/main/CHANGES.md',
    },
    mqtt: { connected: false, broker: 'mqtt.example.test', topics: ['meshcore/BOS/#'] },
    map: {
      cartoBasemapKey,
      darkBasemapAvailable: Boolean(cartoBasemapKey),
    },
    testChannel: { name: 'health-check', hash: '99' },
    turnstile: { enabled: false, verified: true },
    defaultObserverSource: 'configured',
    defaultObserverKeys: observerDirectory.map((observer) => observer.key),
    defaultObservers: observerDirectory,
    observerDirectory,
    activeObservers: observerDirectory,
    observerStats: {
      activeCount: observerDirectory.length,
      windowSeconds: 900,
      configuredCount: observerDirectory.length,
      retentionSeconds: 0,
      topWindowDays: 7,
      topCount: 10,
      hashDisplayBytes: 1,
      distanceUnit: 'mi',
    },
    availableRegions: [...new Set(observerDirectory.map((observer) => observer.region).filter(Boolean))],
    regionHierarchy: [],
    results: { retentionSeconds: 604800 },
  };
}

function mapSession(expectedObservers) {
  const now = Date.now();
  return {
    id: 'map-session',
    code: 'MHC-MAP123',
    instructions: 'Send MHC-MAP123 to #health-check',
    status: 'active',
    createdAt: now,
    expiresAt: now + 600000,
    resultExpiresAt: now + 604800000,
    maxUses: 3,
    useCount: 0,
    usesRemaining: 3,
    expectedCount: expectedObservers.length,
    observedCount: 0,
    healthPercent: 0,
    healthLabel: 'POOR',
    expectedObserverSource: 'selected observers',
    expectedObservers: expectedObservers.map((observer) => ({
      key: observer.key,
      hash: observer.hash,
      label: observer.label,
      seen: false,
    })),
    receipts: [],
  };
}

async function openMockMapSession(
  page,
  observerDirectory,
  expectedObservers,
  cartoBasemapKey = 'test-carto-key',
) {
  await page.addInitScript(() => {
    window.WebSocket = class {
      addEventListener() {}
      close() {}
    };
  });
  await page.route('**/api/bootstrap', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(mapBootstrap(observerDirectory, cartoBasemapKey)),
  }));
  await page.route('**/api/sessions/map-session', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(mapSession(expectedObservers)),
  }));
  await page.goto('/share/map-session');
}

test('dashboard loads and creates a session code', async ({ page }) => {
  await page.goto('/app');

  await expect(page).toHaveTitle(/MeshCore Observer Coverage/i);
  await expect(page.getByText('MeshCore Observer Coverage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Code' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'yellowcooln/meshcore-health-check' })).toBeVisible();
  await expect(page.locator('#session-code')).toContainText('MHC-', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(page.getByText('Where the observers are')).toBeVisible();
  await expect(page.locator('#map-observer-note')).toContainText('mapped observers reached.');
  await expect(page.locator('#observer-map')).toBeVisible();
  await expect(page.getByText('When each observer saw it')).toBeVisible();
  await expect(page.getByText('Timeline appears after the first observer report.')).toBeVisible();
});

test('share button uses the browser share API with the retained share link', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shareCalls = [];
    navigator.share = async (payload) => {
      window.__shareCalls.push(payload);
    };
  });

  await page.goto('/app');
  await expect(page.locator('#session-code')).toContainText('MHC-', { timeout: 10000 });

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('button', { name: 'Shared' })).toBeVisible();

  const shareCalls = await page.evaluate(() => window.__shareCalls);
  expect(shareCalls).toHaveLength(1);
  expect(shareCalls[0].text).toBeUndefined();
  expect(shareCalls[0].url).toMatch(/^http:\/\/127\.0\.0\.1:3091\/share\/[0-9a-f-]+$/i);
});

test('changing the observer selection updates the target and regenerates the unused code', async ({ page }) => {
  await page.goto('/app');

  const sessionCode = page.locator('#session-code');
  await expect(sessionCode).toContainText('MHC-', { timeout: 10000 });
  const initialCode = await sessionCode.textContent();

  const observerOptions = page.locator('#observer-allowlist input[type="checkbox"]');
  await expect(observerOptions.first()).toBeVisible();
  const initialObserverCount = await observerOptions.count();
  expect(initialObserverCount).toBeGreaterThan(1);
  await observerOptions.nth(0).uncheck();

  await expect(page.locator('#expected-observers .observer-pill')).toHaveCount(1);
  await expect(sessionCode).not.toHaveText(initialCode || '', { timeout: 10000 });
  await expect(page.locator('#expected-source')).toContainText('Custom set');
});

test('coverage map only plots observers targeted by the selected region', async ({ page }) => {
  const target = mapObserver(MAP_TEST_KEYS.target, 'Target Observer', 42.3601, -71.0589, 'BOS');
  const outside = mapObserver(MAP_TEST_KEYS.outside, 'Outside Observer', 48.8566, 2.3522, 'CDG');

  await openMockMapSession(page, [target, outside], [target]);

  await expect(page.locator('#map-observer-note')).toHaveText('0/1 mapped observers reached.');
  await expect(page.locator('#observer-map .leaflet-marker-icon')).toHaveCount(1);
});

test('coverage map omits observers with 0,0 coordinates', async ({ page }) => {
  const target = mapObserver(MAP_TEST_KEYS.target, 'Target Observer', 42.3601, -71.0589, 'BOS');
  const zero = mapObserver(MAP_TEST_KEYS.zero, 'Zero Observer', 0, 0, 'BOS');

  await openMockMapSession(page, [target, zero], [target, zero]);

  await expect(page.locator('#map-observer-note')).toHaveText('0/1 mapped observers reached.');
  await expect(page.locator('#observer-map .leaflet-marker-icon')).toHaveCount(1);
});

test('dark coverage map sends the configured CARTO API key', async ({ page }) => {
  const target = mapObserver(MAP_TEST_KEYS.target, 'Target Observer', 42.3601, -71.0589, 'BOS');
  const cartoRequests = [];
  await page.route('https://*.basemaps.cartocdn.com/**', async (route) => {
    cartoRequests.push(route.request().url());
    await route.abort();
  });

  await openMockMapSession(page, [target], [target]);

  await expect.poll(() => cartoRequests.length).toBeGreaterThan(0);
  expect(cartoRequests[0]).toContain('dark_all');
  expect(cartoRequests[0]).toContain('key=test-carto-key');
});

test('dark dashboard falls back to OpenStreetMap without a CARTO key', async ({ page }) => {
  const target = mapObserver(MAP_TEST_KEYS.target, 'Target Observer', 42.3601, -71.0589, 'BOS');
  const cartoRequests = [];
  const osmRequests = [];
  await page.route('https://*.basemaps.cartocdn.com/**', async (route) => {
    cartoRequests.push(route.request().url());
    await route.abort();
  });
  await page.route('https://*.tile.openstreetmap.org/**', async (route) => {
    osmRequests.push(route.request().url());
    await route.abort();
  });

  await openMockMapSession(page, [target], [target], '');

  await expect.poll(() => osmRequests.length).toBeGreaterThan(0);
  expect(cartoRequests).toHaveLength(0);
  await expect(page.locator('body')).toHaveAttribute('data-ui-theme', 'dark');
});

test('escapes untrusted observer labels in timeline and map popups', async ({ page }) => {
  const maliciousLabel = '<img src=x onerror="window.__meshHealthXssHit=true">Evil Observer';
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  const now = Date.now();
  const session = {
    id: 'xss-session',
    code: 'MHC-XSS123',
    instructions: 'Send MHC-XSS123 to #health-check',
    status: 'active',
    createdAt: now,
    expiresAt: now + 600000,
    resultExpiresAt: now + 604800000,
    maxUses: 3,
    useCount: 1,
    usesRemaining: 2,
    expectedCount: 1,
    observedCount: 1,
    healthPercent: 100,
    healthLabel: 'VERY HEALTHY',
    messageHash: 'ABCDEF1234567890',
    messageBody: 'malicious label check',
    sender: 'Tester',
    channelName: 'health-check',
    shareUrl: 'http://127.0.0.1:3091/share/xss-session',
    expectedObserverSource: 'configured',
    expectedObservers: [{
      key: observerKey,
      hash: 'AF',
      label: maliciousLabel,
      seen: true,
    }],
    receipts: [{
      observerKey,
      observerHash: 'AF',
      observerShortKey: 'AF07FC...D11A2B',
      observerLabel: maliciousLabel,
      firstSeenAt: now,
      lastSeenAt: now,
      count: 1,
      messageHash: 'ABCDEF1234567890',
      rssi: -45,
      snr: 8,
      duration: 125,
      path: ['AF07'],
    }],
  };

  await page.addInitScript(() => {
    window.__meshHealthXssHit = false;
    window.WebSocket = class {
      addEventListener() {}
      close() {}
    };
  });
  await page.route('**/api/bootstrap', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        site: {
          title: 'MeshCore Observer Coverage',
          eyebrow: 'MeshCore Observer Coverage',
          headline: 'Check your mesh reach.',
          description: 'Generate a test code, send it to the configured channel, and watch observer coverage build in real time.',
          version: '1.3.5',
          coreScopeUrl: 'https://analyzer.example.test',
          repoUrl: 'https://github.com/yellowcooln/meshcore-health-check',
          changesUrl: 'https://github.com/yellowcooln/meshcore-health-check/blob/main/CHANGES.md',
        },
        mqtt: {
          connected: false,
          broker: 'mqtt.example.test',
          topics: ['meshcore/SITE/#'],
        },
        testChannel: {
          name: 'health-check',
          hash: '99',
        },
        turnstile: {
          enabled: false,
          verified: true,
        },
        defaultObserverSource: 'configured',
        defaultObservers: [{
          key: observerKey,
          hash: 'AF',
          label: maliciousLabel,
          name: maliciousLabel,
          shortKey: 'AF07FC...D11A2B',
          lat: 42.3601,
          lon: -71.0589,
          hasLocation: true,
          isActive: true,
          isRetained: true,
          packetCount: 1,
        }],
        observerDirectory: [{
          key: observerKey,
          hash: 'AF',
          label: maliciousLabel,
          name: maliciousLabel,
          shortKey: 'AF07FC...D11A2B',
          lat: 42.3601,
          lon: -71.0589,
          hasLocation: true,
          isActive: true,
          isRetained: true,
          packetCount: 1,
        }],
        observerStats: {
          activeCount: 1,
          windowSeconds: 900,
          configuredCount: 1,
          retentionSeconds: 0,
          topWindowDays: 7,
          topCount: 10,
          hashDisplayBytes: 1,
          distanceUnit: 'mi',
        },
        availableRegions: [],
        regionHierarchy: [],
        results: {
          retentionSeconds: 604800,
        },
      }),
    });
  });
  await page.route('**/api/sessions', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });

  await page.goto('/app');
  await expect(page.locator('#session-code')).toHaveText('MHC-XSS123');
  await expect(page.locator('#session-hash')).toHaveAttribute(
    'href',
    'https://analyzer.example.test/#/packets/abcdef1234567890',
  );
  await expect(page.locator('#receipt-timeline')).toContainText('Evil Observer');
  await expect(page.locator('#receipt-timeline img')).toHaveCount(0);
  await expect(page.locator('#receipts img')).toHaveCount(0);
  await expect(page.locator('#observer-allowlist img')).toHaveCount(0);

  await page.locator('.leaflet-marker-icon').first().click();
  await expect(page.locator('.leaflet-popup-content')).toContainText('Evil Observer');
  await expect(page.locator('.leaflet-popup-content img')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__meshHealthXssHit)).toBe(false);
});
