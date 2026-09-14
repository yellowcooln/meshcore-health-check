import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refineLocation } from '../public/location-refinement.js';

function fixture() {
  let success, failure, deadline, result, cleared = 0, timers = 0;
  const cancel = refineLocation({
    geolocation: { watchPosition(ok, fail, options) { success = ok; failure = fail; assert.equal(options.maximumAge, 0); assert.equal(options.enableHighAccuracy, true); return 7; }, clearWatch(id) { assert.equal(id, 7); cleared++; } },
    setTimer(fn, ms) { assert.equal(ms, 12000); deadline = fn; timers++; return 8; },
    clearTimer(id) { assert.equal(id, 8); timers--; },
    complete(value) { result = value; },
  });
  return { fix(accuracy, latitude = 42) { success({ coords: { latitude, longitude: -71, accuracy } }); }, error() { failure({ code: 3 }); }, end() { deadline(); }, cancel, get result() { return result; }, get cleared() { return cleared; }, get timers() { return timers; } };
}
test('retains most accurate fix and completes early on a good fix', () => {
  const f = fixture(); f.fix(50000); f.fix(2000); f.fix(40000); assert.equal(f.result, undefined); f.fix(25);
  assert.equal(f.result.fix.accuracy, 25); assert.equal(f.cleared, 1); assert.equal(f.timers, 0);
  f.fix(1); assert.equal(f.result.fix.accuracy, 25);
});
test('constant coarse fix waits for deadline and remains explicitly approximate', () => {
  const f = fixture(); f.fix(50000); f.fix(50000); assert.equal(f.result, undefined); f.end();
  assert.equal(f.result.approximate, true); assert.equal(f.result.fix.accuracy, 50000); assert.equal(f.cleared, 1); assert.equal(f.timers, 0);
});
test('timeout keeps best available fix', () => { const f = fixture(); f.fix(3000); f.fix(50000); f.error(); assert.equal(f.result.fix.accuracy, 3000); assert.equal(f.result.approximate, true); });
test('timeout without a fix returns error and clears resources', () => { const f = fixture(); f.end(); assert.equal(f.result.error.code, 3); assert.equal(f.cleared, 1); assert.equal(f.timers, 0); });
test('cancellation ignores late callbacks and clears resources', () => { const f = fixture(); f.fix(50000); f.cancel(); f.fix(25); f.error(); f.end(); assert.equal(f.result, undefined); assert.equal(f.cleared, 1); assert.equal(f.timers, 0); });
