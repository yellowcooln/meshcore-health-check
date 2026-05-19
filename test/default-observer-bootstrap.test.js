import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, '..');

test('bootstrap includes configured default observers even when only some are retained', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-defaults-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const observerActivityFile = path.join(tempDir, 'observer-activity.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const configuredKeys = [
    'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B',
    '01F0E86393494B0BE83E3D93BD528456DE39F389B9DCF802BC90B21F66EA88A6',
    '34945E9CDD2680CD8F2B760211271A9C2E99289A70872B5B224DC616BE357048',
  ];
  fs.writeFileSync(observerFile, JSON.stringify({
    [configuredKeys[0]]: { name: 'Configured Observer 01', lat: 42.3601, lon: -71.0589 },
    [configuredKeys[1]]: { name: 'Configured Observer 02', lat: 42.3736, lon: -71.1097 },
    [configuredKeys[2]]: { name: 'Configured Observer 03', lat: 42.4473, lon: -71.229 },
  }, null, 2), 'utf8');
  fs.writeFileSync(observerActivityFile, '{\n  "version": 1,\n  "observers": {}\n}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    OBSERVER_ACTIVITY_FILE: process.env.OBSERVER_ACTIVITY_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    KNOWN_OBSERVERS: process.env.KNOWN_OBSERVERS,
    OBSERVER_RETENTION_SECONDS: process.env.OBSERVER_RETENTION_SECONDS,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.OBSERVER_ACTIVITY_FILE = observerActivityFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.KNOWN_OBSERVERS = configuredKeys.join(',');
  process.env.OBSERVER_RETENTION_SECONDS = '14400';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?defaults-test=${Date.now()}`
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
    ingestMqttMessage(
      `meshcore/BOS/${configuredKeys[0]}/status`,
      Buffer.from(JSON.stringify({
        name: 'Configured Observer 01',
        location: {
          latitude: 42.3601,
          longitude: -71.0589,
        },
      })),
    );

    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(payload.defaultObserverKeys, configuredKeys);
    assert.equal(payload.defaultObservers.length, 3);
    assert.equal(payload.observerDirectory.length, 1);
    assert.equal(payload.observerDirectory[0].key, configuredKeys[0]);

    const staleDefault = payload.defaultObservers.find((observer) => observer.key === configuredKeys[1]);
    assert.equal(staleDefault?.label, 'Configured Observer 02');
    assert.equal(staleDefault?.isRetained, false);
    assert.equal(staleDefault?.isActive, false);
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

test('observer retention can be disabled with OBSERVER_RETENTION_SECONDS=0', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-retention-off-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const observerActivityFile = path.join(tempDir, 'observer-activity.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  fs.writeFileSync(observerFile, JSON.stringify({
    [observerKey]: { name: 'Retention Disabled Observer', lat: 42.3601, lon: -71.0589 },
  }, null, 2), 'utf8');
  fs.writeFileSync(observerActivityFile, '{\n  "version": 1,\n  "observers": {}\n}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    OBSERVER_ACTIVITY_FILE: process.env.OBSERVER_ACTIVITY_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    KNOWN_OBSERVERS: process.env.KNOWN_OBSERVERS,
    OBSERVER_RETENTION_SECONDS: process.env.OBSERVER_RETENTION_SECONDS,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.OBSERVER_ACTIVITY_FILE = observerActivityFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.KNOWN_OBSERVERS = observerKey;
  process.env.OBSERVER_RETENTION_SECONDS = '0';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?retention-off-test=${Date.now()}`
  );
  const {
    flushScheduledWrites,
    ingestMqttMessage,
    resetTestState,
    server,
  } = serverModule;

  const realNow = Date.now;
  let baseUrl = '';
  try {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    resetTestState();
    const baseNow = realNow();
    Date.now = () => baseNow;
    ingestMqttMessage(
      `meshcore/BOS/${observerKey}/status`,
      Buffer.from(JSON.stringify({
        name: 'Retention Disabled Observer',
        location: {
          latitude: 42.3601,
          longitude: -71.0589,
        },
      })),
    );

    Date.now = () => baseNow + 30 * 24 * 60 * 60 * 1000;
    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const observer = payload.observerDirectory.find((entry) => entry.key === observerKey);

    assert.equal(payload.observerStats.retentionSeconds, 0);
    assert.equal(observer?.label, 'Retention Disabled Observer');
    assert.equal(observer?.isRetained, true);
  } finally {
    Date.now = realNow;
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

test('saved observer profile names are not overridden by lower-quality mqtt metadata names', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-name-preference-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const observerActivityFile = path.join(tempDir, 'observer-activity.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  fs.writeFileSync(observerFile, JSON.stringify({
    [observerKey]: { name: 'Pinned Observer Name', lat: 42.3601, lon: -71.0589 },
  }, null, 2), 'utf8');
  fs.writeFileSync(observerActivityFile, '{\n  "version": 1,\n  "observers": {}\n}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    OBSERVER_ACTIVITY_FILE: process.env.OBSERVER_ACTIVITY_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    KNOWN_OBSERVERS: process.env.KNOWN_OBSERVERS,
    OBSERVER_RETENTION_SECONDS: process.env.OBSERVER_RETENTION_SECONDS,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.OBSERVER_ACTIVITY_FILE = observerActivityFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.KNOWN_OBSERVERS = observerKey;
  process.env.OBSERVER_RETENTION_SECONDS = '14400';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?name-preference-test=${Date.now()}`
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
    ingestMqttMessage(
      `meshcore/BOS/${observerKey}/status`,
      Buffer.from(JSON.stringify({
        name: 'Observer',
        device_name: 'HeltecV3Repeater',
        location: {
          latitude: 42.3601,
          longitude: -71.0589,
        },
      })),
    );

    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const observer = payload.observerDirectory.find((entry) => entry.key === observerKey);

    assert.equal(observer?.label, 'Pinned Observer Name');
    assert.equal(observer?.name, 'Pinned Observer Name');
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

test('bootstrap falls back to the top recent observers when KNOWN_OBSERVERS is blank', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-top-observers-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const observerActivityFile = path.join(tempDir, 'observer-activity.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const observerKeys = Array.from({ length: 12 }, (_, index) =>
    `${(index + 1).toString(16).toUpperCase()}`.repeat(64).slice(0, 64)
  );
  const today = new Date();
  const dayKey = (offsetDays) => new Date(today.getTime() - (offsetDays * 86400000))
    .toISOString()
    .slice(0, 10);
  fs.writeFileSync(observerFile, JSON.stringify(Object.fromEntries(
    observerKeys.map((key, index) => [key, { name: `Tracked Observer ${index + 1}` }]),
  ), null, 2), 'utf8');
  fs.writeFileSync(observerActivityFile, JSON.stringify({
    version: 1,
    observers: Object.fromEntries(observerKeys.map((key, index) => [key, {
      days: index === 10
        ? { [dayKey(8)]: 999 }
        : {
            [dayKey(0)]: 200 - (index * 10),
            [dayKey(1)]: 2,
          },
      lastPacketAt: Date.now() - (index * 1000),
    }])),
  }, null, 2), 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    OBSERVER_ACTIVITY_FILE: process.env.OBSERVER_ACTIVITY_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    KNOWN_OBSERVERS: process.env.KNOWN_OBSERVERS,
    OBSERVER_TOP_WINDOW_DAYS: process.env.OBSERVER_TOP_WINDOW_DAYS,
    OBSERVER_TOP_COUNT: process.env.OBSERVER_TOP_COUNT,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.OBSERVER_ACTIVITY_FILE = observerActivityFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.KNOWN_OBSERVERS = '';
  process.env.OBSERVER_TOP_WINDOW_DAYS = '7';
  process.env.OBSERVER_TOP_COUNT = '10';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?top-observers-test=${Date.now()}`
  );
  const {
    flushScheduledWrites,
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
    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    const expectedTopKeys = observerKeys
      .filter((_, index) => index !== 10)
      .slice(0, 10);
    assert.equal(payload.defaultObserverSource, 'top-window');
    assert.deepEqual(payload.defaultObserverKeys, expectedTopKeys);
    assert.equal(payload.defaultObservers.length, 10);
    assert.equal(payload.defaultObservers[0]?.label, 'Tracked Observer 1');
    assert.equal(payload.defaultObservers.at(-1)?.label, 'Tracked Observer 10');
    assert.equal(payload.observerStats.topWindowDays, 7);
    assert.equal(payload.observerStats.topCount, 10);
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

test('observer hash prefixes follow OBSERVER_HASH_DISPLAY_BYTES', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-hash-bytes-test-'));
  const observerFile = path.join(tempDir, 'observer.json');
  const observerActivityFile = path.join(tempDir, 'observer-activity.json');
  const resultsFile = path.join(tempDir, 'session-results.json');
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  fs.writeFileSync(observerFile, JSON.stringify({
    [observerKey]: { name: 'Hash Width Observer' },
  }, null, 2), 'utf8');
  fs.writeFileSync(observerActivityFile, '{\n  "version": 1,\n  "observers": {}\n}\n', 'utf8');
  fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

  const previousEnv = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED,
    LOG_LEVEL: process.env.LOG_LEVEL,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    OBSERVER_ACTIVITY_FILE: process.env.OBSERVER_ACTIVITY_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
    TEST_CHANNEL_NAME: process.env.TEST_CHANNEL_NAME,
    TEST_CHANNEL_SECRET: process.env.TEST_CHANNEL_SECRET,
    KNOWN_OBSERVERS: process.env.KNOWN_OBSERVERS,
    OBSERVER_HASH_DISPLAY_BYTES: process.env.OBSERVER_HASH_DISPLAY_BYTES,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.TURNSTILE_ENABLED = 'false';
  process.env.LOG_LEVEL = 'info';
  process.env.OBSERVERS_FILE = observerFile;
  process.env.OBSERVER_ACTIVITY_FILE = observerActivityFile;
  process.env.RESULTS_FILE = resultsFile;
  process.env.TEST_CHANNEL_NAME = 'health-check';
  process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
  process.env.KNOWN_OBSERVERS = observerKey;
  process.env.OBSERVER_HASH_DISPLAY_BYTES = '2';

  const serverModule = await import(
    `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?hash-bytes-test=${Date.now()}`
  );
  const {
    flushScheduledWrites,
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
    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.observerStats.hashDisplayBytes, 2);
    assert.equal(payload.defaultObservers[0]?.hash, 'AF07');
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
