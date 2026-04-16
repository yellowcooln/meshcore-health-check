import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildGroupTextEnvelope } from './support/build-meshcore-fixture.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-health-check-test-'));
const observerFile = path.join(tempDir, 'observer.json');
const resultsFile = path.join(tempDir, 'session-results.json');
fs.writeFileSync(observerFile, '{}\n', 'utf8');
fs.writeFileSync(resultsFile, '{\n  "version": 1,\n  "sessions": []\n}\n', 'utf8');

process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
process.env.TURNSTILE_ENABLED = 'false';
process.env.LOG_LEVEL = 'info';
process.env.OBSERVERS_FILE = observerFile;
process.env.RESULTS_FILE = resultsFile;
process.env.APP_TITLE = 'Boston MeshCore Observer Coverage';
process.env.APP_EYEBROW = 'Boston MeshCore Observer Coverage';
process.env.DASH_BROKER_HOST = 'mqttmc01.bostonme.sh:443';
process.env.TEST_CHANNEL_NAME = 'health-check';
process.env.TEST_CHANNEL_SECRET = 'E6D973AAC5101145AD3A3F3A0B3D52EB';
process.env.OBSERVER_RETENTION_SECONDS = '14400';

const serverModule = await import(
  `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?test=${Date.now()}`
);

const {
  flushScheduledWrites,
  ingestMqttMessage,
  server,
  resetTestState,
} = serverModule;
const packetFixture = JSON.parse(
  fs.readFileSync(path.join(TEST_DIR, 'fixtures/grouptext-message.json'), 'utf8'),
);

let baseUrl = '';

before(async () => {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  resetTestState();
});

after(async () => {
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
});

test('GET /api/bootstrap returns site and channel configuration', async () => {
  const response = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.site.title, 'Boston MeshCore Observer Coverage');
  assert.equal(payload.site.version, '1.2.5');
  assert.equal(payload.testChannel.name, 'health-check');
  assert.equal(payload.testChannel.hash, '99');
  assert.equal(payload.turnstile.enabled, false);
  assert.equal(payload.mqtt.broker, 'mqttmc01.bostonme.sh:443');
  assert.equal(payload.results.retentionSeconds, 604800);
});

test('GET /app includes server-rendered social meta tags', async () => {
  const response = await fetch(`${baseUrl}/app`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<meta property="og:title" content="Boston MeshCore Observer Coverage">/);
  assert.match(html, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/logo\.png">/);
  assert.match(html, /<meta name="twitter:title" content="Boston MeshCore Observer Coverage">/);
});

test('GET /manifest.webmanifest returns installable app metadata', async () => {
  const response = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.name, 'Mesh Reach');
  assert.equal(payload.short_name, 'Mesh Reach');
  assert.equal(payload.display, 'standalone');
  assert.equal(payload.start_url, '/');
  assert.equal(payload.icons[0].src, '/logo.png');
});

test('GET /share/:sessionId returns the dashboard shell', async () => {
  const response = await fetch(`${baseUrl}/share/example-session`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Observer coverage someone shared with you\./);
  assert.match(html, /Run Your Own Check/);
});

test('POST /api/sessions creates a session and GET returns it', async () => {
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.code, /^MHC-[0-9A-F]{6}$/);
  assert.equal(created.status, 'waiting');
  assert.equal(created.maxUses, 3);
  assert.match(created.sharePath, new RegExp(`^/share/${created.id}$`));
  assert.equal(created.shareUrl, `${baseUrl}/share/${created.id}`);
  assert.ok(created.resultExpiresAt >= created.createdAt + 604799000);

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);

  const session = await sessionResponse.json();
  assert.equal(session.id, created.id);
  assert.equal(session.code, created.code);
  assert.equal(session.channelHash, '');
  assert.equal(session.shareUrl, `${baseUrl}/share/${created.id}`);
});

test('created sessions are persisted in the results file', async () => {
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  await new Promise((resolve) => setTimeout(resolve, 300));

  const stored = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  assert.equal(stored.version, 1);
  assert.ok(Array.isArray(stored.sessions));
  const session = stored.sessions.find((entry) => entry.id === created.id);
  assert.equal(session?.code, created.code);
  assert.equal(session?.status, 'waiting');
});

test('POST /api/verify-turnstile returns disabled when turnstile is off', async () => {
  const response = await fetch(`${baseUrl}/api/verify-turnstile`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token: 'dummy-token' }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: false,
    error: 'turnstile_not_enabled',
  });
});

test('fixture packet ingest matches a session and records observer receipts', async () => {
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const message = packetFixture.messageTemplate.replace('{code}', created.code);
  const envelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: packetFixture.sender,
    message,
    messageHash: packetFixture.messageHash,
    timestamp: packetFixture.timestamp,
    path: packetFixture.path,
  });

  for (const observerKey of packetFixture.observerKeys) {
    ingestMqttMessage(
      `meshcore/BOS/${observerKey}/packets`,
      Buffer.from(JSON.stringify(envelope)),
    );
  }

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);

  const session = await sessionResponse.json();
  assert.equal(session.messageHash, packetFixture.messageHash);
  assert.equal(session.sender, packetFixture.sender);
  assert.equal(session.messageBody, message);
  assert.equal(session.channelHash, '99');
  assert.equal(session.observedCount, 2);
  assert.equal(session.receipts.length, 2);
  assert.equal(session.receipts[0].messageHash, packetFixture.messageHash);
});

test('fixture packet ingest matches sessions for 3-byte path hashes', async () => {
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const message = `multibyte path ${created.code}`;
  const envelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Packet Tester',
    message,
    messageHash: 'AB12CD34EF56AB78',
    timestamp: 1760000000,
    path: ['3FA002', '860CCA', 'E0EED9'],
  });

  ingestMqttMessage(
    'meshcore/BOS/AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B/packets',
    Buffer.from(JSON.stringify(envelope)),
  );

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);

  const session = await sessionResponse.json();
  assert.equal(session.messageHash, 'AB12CD34EF56AB78');
  assert.equal(session.sender, 'Packet Tester');
  assert.equal(session.messageBody, message);
  assert.equal(session.repeaterCount, 3);
  assert.deepEqual(session.receipts[0].path.slice(0, 3), ['3FA002', '860CCA', 'E0EED9']);
  assert.equal(session.receipts[0].path.at(-1), 'AF07FC');
});

test('fixture packet ingest matches sessions for 2-byte path hashes', async () => {
  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const message = `two byte path ${created.code}`;
  const envelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Packet Tester',
    message,
    messageHash: '11223344AABBCCDD',
    timestamp: 1760000100,
    path: ['3FA0', '860C', 'E0EE'],
  });

  ingestMqttMessage(
    'meshcore/BOS/AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B/packets',
    Buffer.from(JSON.stringify(envelope)),
  );

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);

  const session = await sessionResponse.json();
  assert.equal(session.messageHash, '11223344AABBCCDD');
  assert.equal(session.sender, 'Packet Tester');
  assert.equal(session.messageBody, message);
  assert.equal(session.repeaterCount, 3);
  assert.deepEqual(session.receipts[0].path.slice(0, 3), ['3FA0', '860C', 'E0EE']);
  assert.equal(session.receipts[0].path.at(-1), 'AF07');
});

test('observer metadata learns and exposes saved coordinates from mqtt', async () => {
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';

  ingestMqttMessage(
    `meshcore/BOS/${observerKey}/status`,
    Buffer.from(JSON.stringify({
      name: 'Observer with Coordinates',
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

  assert.equal(observer?.name, 'Observer with Coordinates');
  assert.equal(observer?.lat, 42.3601);
  assert.equal(observer?.lon, -71.0589);
  assert.equal(observer?.hasLocation, true);
});

test('observer metadata does not rename other observers through origin_id or origin fields', async () => {
  const observerKey = '11223344556677889900AABBCCDDEEFF00112233445566778899AABBCCDDEEFF';
  const otherKey = 'FFEEDDCCBBAA0099887766554433221100FFEEDDCCBBAA009988776655443322';

  ingestMqttMessage(
    `meshcore/BOS/${otherKey}/status`,
    Buffer.from(JSON.stringify({
      name: 'Known Observer Name',
    })),
  );

  ingestMqttMessage(
    `meshcore/BOS/${observerKey}/status`,
    Buffer.from(JSON.stringify({
      origin_id: otherKey,
      origin: 'BUR-FOX-HILL',
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
  const otherObserver = payload.observerDirectory.find((entry) => entry.key === otherKey);

  assert.equal(observer?.name, null);
  assert.equal(observer?.lat, null);
  assert.equal(observer?.lon, null);
  assert.equal(otherObserver?.name, 'Known Observer Name');
});

test('observer metadata learns coordinates from decoded mesh packets without renaming the observer', async () => {
  const observerKey = '6FD3B0588203D942A89EFAF174717C7A7E75FCFED0DA41A2F90764B85BB7B860';

  ingestMqttMessage(
    `meshcore/BOS/${observerKey}/status`,
    Buffer.from(JSON.stringify({
      name: 'Saved Observer Name',
    })),
  );

  ingestMqttMessage(
    `meshcore/BOS/${observerKey}/packets`,
    Buffer.from('1101266fd3b0588203d942a89efaf174717c7a7e75fcfed0da41a2f90764b85bb7b860a461de694185c5508ff3e8ccb471cc5b9dac8409e92ad370c0887910bbb6205ad1d5529a87cfc33b912cc755896c212a446fb40f46ab551f55a9cd5c7f830afc2bdd400492e3088502450abcfb59432d576f726b2d5265706561746572'),
  );

  const response = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const observer = payload.observerDirectory.find((entry) => entry.key === observerKey);

  assert.equal(observer?.name, 'Saved Observer Name');
  assert.equal(observer?.lat, 42.272995);
  assert.equal(observer?.lon, -71.562683);
  assert.equal(observer?.hasLocation, true);
});

test('decoded mesh packet metadata does not attach other nodes to the mqtt observer topic', async () => {
  const observerKey = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

  ingestMqttMessage(
    `meshcore/BOS/${observerKey}/packets`,
    Buffer.from('1101266fd3b0588203d942a89efaf174717c7a7e75fcfed0da41a2f90764b85bb7b860a461de694185c5508ff3e8ccb471cc5b9dac8409e92ad370c0887910bbb6205ad1d5529a87cfc33b912cc755896c212a446fb40f46ab551f55a9cd5c7f830afc2bdd400492e3088502450abcfb59432d576f726b2d5265706561746572'),
  );

  const response = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const observer = payload.observerDirectory.find((entry) => entry.key === observerKey);

  assert.equal(observer?.name, null);
  assert.equal(observer?.lat, null);
  assert.equal(observer?.lon, null);
  assert.equal(observer?.hasLocation, false);
});

test('observer directory excludes observers older than the retention window', async () => {
  const observerKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  const realNow = Date.now;
  const baseNow = realNow();

  Date.now = () => baseNow;
  try {
    ingestMqttMessage(
      `meshcore/BOS/${observerKey}/status`,
      Buffer.from(JSON.stringify({
        name: 'Stale Observer',
        location: {
          latitude: 42.3601,
          longitude: -71.0589,
        },
      })),
    );
  } finally {
    Date.now = realNow;
  }

  Date.now = () => baseNow + 14401 * 1000;
  try {
    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const observer = payload.observerDirectory.find((entry) => entry.key === observerKey);

    assert.equal(observer, undefined);
  } finally {
    Date.now = realNow;
  }
});

test('same active message with a later hash alias does not reset receipts or uses', async () => {
  const firstObserverKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  const secondObserverKey = 'C689DF3FEB9A7A5EF05E9642C75ABB8C10DF13D974F196027AA7945BEA996FA4';

  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const message = `alias test ${created.code}`;
  const firstEnvelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Alias Tester',
    message,
    messageHash: '438DD45E5436A421',
    timestamp: 1762000000,
  });
  const aliasEnvelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Alias Tester',
    message,
    messageHash: '438dd45e5436a421-variant',
    timestamp: 1762000000,
  });

  ingestMqttMessage(
    `meshcore/BOS/${firstObserverKey}/packets`,
    Buffer.from(JSON.stringify(firstEnvelope)),
  );
  ingestMqttMessage(
    `meshcore/BOS/${secondObserverKey}/packets`,
    Buffer.from(JSON.stringify(aliasEnvelope)),
  );

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);

  const session = await sessionResponse.json();
  assert.equal(session.useCount, 1);
  assert.equal(session.status, 'active');
  assert.equal(session.messageHash, '438DD45E5436A421');
  assert.equal(session.observedCount, 2);
  assert.equal(session.receipts.length, 2);
});

test('session allow list limits scoring and receipts to selected observers', async () => {
  const selectedObserverKey = 'AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B';
  const excludedObserverKey = 'C689DF3FEB9A7A5EF05E9642C75ABB8C10DF13D974F196027AA7945BEA996FA4';

  ingestMqttMessage(
    `meshcore/BOS/${selectedObserverKey}/status`,
    Buffer.from(JSON.stringify({ name: 'Selected Observer' })),
  );
  ingestMqttMessage(
    `meshcore/BOS/${excludedObserverKey}/status`,
    Buffer.from(JSON.stringify({ name: 'Excluded Observer' })),
  );

  const createResponse = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      expectedObserverKeys: [selectedObserverKey],
    }),
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.allowlistEnabled, true);
  assert.equal(created.expectedObservers.length, 1);
  assert.equal(created.expectedObservers[0].key, selectedObserverKey);

  const message = `allow list ${created.code}`;
  const selectedEnvelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Allowlist Tester',
    message,
    messageHash: 'A1B2C3D4E5F60708',
    timestamp: 1761000000,
  });
  const excludedEnvelope = buildGroupTextEnvelope({
    secretHex: process.env.TEST_CHANNEL_SECRET,
    sender: 'Allowlist Tester',
    message,
    messageHash: 'A1B2C3D4E5F60708',
    timestamp: 1761000000,
  });

  ingestMqttMessage(
    `meshcore/BOS/${selectedObserverKey}/packets`,
    Buffer.from(JSON.stringify(selectedEnvelope)),
  );
  ingestMqttMessage(
    `meshcore/BOS/${excludedObserverKey}/packets`,
    Buffer.from(JSON.stringify(excludedEnvelope)),
  );

  const sessionResponse = await fetch(`${baseUrl}/api/sessions/${created.id}`);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.equal(session.observedCount, 1);
  assert.equal(session.expectedCount, 1);
  assert.equal(session.healthPercent, 100);
  assert.equal(session.receipts.length, 1);
  assert.equal(session.receipts[0].observerKey, selectedObserverKey);
});
