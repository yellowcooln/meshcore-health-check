import { expect, test } from '@playwright/test';

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
      version: '1.3.8',
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
