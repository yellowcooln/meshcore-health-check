import assert from 'node:assert/strict';
import test from 'node:test';
import * as proximity from '../public/nearest-observers.js';

const now = 1800000000000;
const observer = (n, extra = {}) => ({
  key: n.toString(16).padStart(64, '0'), lat: 42, lon: -71,
  isActive: true, lastPacketAt: now - 1000, ...extra,
});
const select = (observers, extra = {}) => proximity.nearestObservers({
  observers, origin: { lat: 42, lon: -71 }, radiusKm: 100,
  windowSeconds: 900, now, ...extra,
});

test('nearest selection exposes the browser-only ranking contract', () => {
  assert.equal(typeof proximity.nearestObservers, 'function');
});
test('ranks by haversine distance, includes radius boundary, caps at deterministic ten', () => {
  const rows = Array.from({ length: 12 }, (_, i) => observer(i + 1));
  assert.deepEqual(select(rows.reverse()).map((o) => o.key), rows.map((o) => o.key).sort().slice(0, 10));
  const ranked = select([observer(1, { lat: 42.1 }), observer(2)]);
  assert.equal(ranked[0].key, observer(2).key);
  assert.ok(ranked[1].distanceKm > 11 && ranked[1].distanceKm < 12);
  assert.equal(select([observer(1, { lat: 44 })]).length, 0);
  assert.equal(select([observer(1)], { radiusKm: 0 }).length, 1);
});
test('rejects inactive, stale, unknown, future and invalid activity', () => {
  const invalid = [
    { isActive: false }, { isActive: undefined }, { isActive: 'true' },
    { lastPacketAt: 0 }, { lastPacketAt: undefined }, { lastPacketAt: now + 1 },
    { lastPacketAt: now - 900001 }, { lastPacketAt: 'not-a-date' },
  ];
  assert.deepEqual(select(invalid.map((extra, i) => observer(i + 1, extra))), []);
  assert.equal(select([observer(1, { lastPacketAt: now - 900000 })]).length, 1);
  assert.deepEqual(select([observer(1)], { windowSeconds: undefined }), []);
});
test('rejects missing, malformed and sentinel coordinates, deduplicates keys', () => {
  const invalid = [{ lat: null }, { lon: '' }, { lat: true }, { lat: 91 },
    { lon: -181 }, { lat: NaN }, { lat: 0, lon: 0 }, { key: 'bad-key' }];
  assert.deepEqual(select(invalid.map((extra, i) => observer(i + 1, extra))), []);
  assert.equal(select([observer(1), observer(1)]).length, 1);
  assert.deepEqual(select([observer(1)], { origin: { lat: null, lon: -71 } }), []);
  assert.deepEqual(select([observer(1)], { radiusKm: -1 }), []);
});
test('handles the antimeridian and empty input', () => {
  assert.equal(select([observer(1, { lat: 1, lon: -179.9 })], {
    origin: { lat: 1, lon: 179.9 }, radiusKm: 30,
  }).length, 1);
  assert.deepEqual(select([]), []);
});
