import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, '..');

function squareFeature(label, macro, west, south, east, north) {
  return {
    type: 'Feature',
    properties: { label, macro },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}

test('bootstrap exposes grouped region hierarchy for observer filters', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-regions-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const regionsFile = path.join(tempDir, 'regions.geojson');
  const observerKeys = [
    '1111111111111111111111111111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '3333333333333333333333333333333333333333333333333333333333333333',
    '4444444444444444444444444444444444444444444444444444444444444444',
  ];

  fs.writeFileSync(observerFile, '{}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');
  fs.writeFileSync(regionsFile, `${JSON.stringify({
    type: 'FeatureCollection',
    features: [
      squareFeature('Alpha', 'North', 0, 0, 1, 1),
      squareFeature('Beta', 'North', 1, 0, 2, 1),
      squareFeature('Gamma', 'South', 0, -1, 1, 0),
      squareFeature('Outside Census places', 'North', 0, 0, 3, 1),
    ],
  })}\n`, 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    REGIONS_FILE: process.env.REGIONS_FILE,
    REGION_NAME_PROPERTY: process.env.REGION_NAME_PROPERTY,
    REGION_GROUP_PROPERTY: process.env.REGION_GROUP_PROPERTY,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    OBSERVER_RETENTION_SECONDS: process.env.OBSERVER_RETENTION_SECONDS,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.REGIONS_FILE = regionsFile;
  process.env.REGION_NAME_PROPERTY = 'label';
  process.env.REGION_GROUP_PROPERTY = 'macro';
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.OBSERVER_RETENTION_SECONDS = '14400';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?regions-test=${Date.now()}`
  );
  const {
    flushScheduledWrites,
    ingestMqttMessage,
    resetTestState,
    server,
  } = serverModule;

  let baseUrl = '';
  try {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    resetTestState();
    const locations = [
      { key: observerKeys[0], name: 'Alpha Observer', latitude: 0.5, longitude: 0.5 },
      { key: observerKeys[1], name: 'Beta Observer', latitude: 0.5, longitude: 1.5 },
      { key: observerKeys[2], name: 'Gamma Observer', latitude: -0.5, longitude: 0.5 },
      { key: observerKeys[3], name: 'Fallback Observer', latitude: 0.5, longitude: 2.5 },
    ];
    for (const location of locations) {
      ingestMqttMessage(
        `meshcore/TEST/${location.key}/status`,
        Buffer.from(JSON.stringify({
          name: location.name,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        })),
      );
    }

    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(payload.availableRegions, ['Alpha', 'Beta', 'Gamma', 'Outside Census places']);
    assert.deepEqual(payload.availableRegionGroups, ['North', 'South']);
    assert.deepEqual(payload.regionHierarchy, [
      {
        group: 'North',
        count: 3,
        regions: [
          { name: 'Alpha', count: 1, packetCount: 1 },
          { name: 'Beta', count: 1, packetCount: 1 },
          { name: 'Outside Census places', count: 1, packetCount: 1 },
        ],
      },
      {
        group: 'South',
        count: 1,
        regions: [
          { name: 'Gamma', count: 1, packetCount: 1 },
        ],
      },
    ]);

    const alphaObserver = payload.observerDirectory.find((entry) => entry.key === observerKeys[0]);
    assert.equal(alphaObserver?.region, 'Alpha');
    assert.equal(alphaObserver?.regionGroup, 'North');

    const fallbackObserver = payload.observerDirectory.find((entry) => entry.key === observerKeys[3]);
    assert.equal(fallbackObserver?.region, 'Outside Census places');
    assert.equal(fallbackObserver?.regionGroup, 'North');
  } finally {
    flushScheduledWrites();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    fs.rmSync(tempDir, { recursive: true, force: true });

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('bootstrap falls back to flat region filters when boundaries have no group property', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-regions-flat-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const regionsFile = path.join(tempDir, 'regions.geojson');
  const observerKeys = [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ];

  fs.writeFileSync(observerFile, '{}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');
  fs.writeFileSync(regionsFile, `${JSON.stringify({
    type: 'FeatureCollection',
    features: [
      squareFeature('Alpha', undefined, 0, 0, 1, 1),
      squareFeature('Beta', undefined, 1, 0, 2, 1),
    ].map((feature) => ({
      ...feature,
      properties: { label: feature.properties.label },
    })),
  })}\n`, 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    REGIONS_FILE: process.env.REGIONS_FILE,
    REGION_NAME_PROPERTY: process.env.REGION_NAME_PROPERTY,
    REGION_GROUP_PROPERTY: process.env.REGION_GROUP_PROPERTY,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    OBSERVER_RETENTION_SECONDS: process.env.OBSERVER_RETENTION_SECONDS,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.REGIONS_FILE = regionsFile;
  process.env.REGION_NAME_PROPERTY = 'label';
  process.env.REGION_GROUP_PROPERTY = 'macro';
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.OBSERVER_RETENTION_SECONDS = '14400';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?regions-flat-test=${Date.now()}`
  );
  const {
    flushScheduledWrites,
    ingestMqttMessage,
    resetTestState,
    server,
  } = serverModule;

  let baseUrl = '';
  try {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    resetTestState();
    const locations = [
      { key: observerKeys[0], name: 'Alpha Observer', latitude: 0.5, longitude: 0.5 },
      { key: observerKeys[1], name: 'Beta Observer', latitude: 0.5, longitude: 1.5 },
    ];
    for (const location of locations) {
      ingestMqttMessage(
        `meshcore/TEST/${location.key}/status`,
        Buffer.from(JSON.stringify({
          name: location.name,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        })),
      );
    }

    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(payload.availableRegions, ['Alpha', 'Beta']);
    assert.deepEqual(payload.availableRegionGroups, []);
    assert.deepEqual(payload.regionHierarchy, [
      {
        group: '',
        count: 2,
        regions: [
          { name: 'Alpha', count: 1, packetCount: 1 },
          { name: 'Beta', count: 1, packetCount: 1 },
        ],
      },
    ]);
  } finally {
    flushScheduledWrites();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    fs.rmSync(tempDir, { recursive: true, force: true });

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
