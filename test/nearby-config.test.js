import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const unit of ['mi', 'km']) {
  test(`nearby default configuration accepts supported values in ${unit}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./server.js');"], {
      env: { ...process.env, MESH_HEALTH_DISABLE_RUNTIME: 'true', DISTANCE_UNIT: unit, NEARBY_DEFAULT_RADIUS: '5' }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
for (const value of ['4', '201', '7', 'garbage']) {
  test(`invalid nearby default ${value} fails startup clearly`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./server.js');"], {
      env: { ...process.env, MESH_HEALTH_DISABLE_RUNTIME: 'true', NEARBY_DEFAULT_RADIUS: value }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NEARBY_DEFAULT_RADIUS must be one of/);
  });
}
