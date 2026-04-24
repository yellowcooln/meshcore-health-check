import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, '..');

test('default persistent file paths resolve under data/', async () => {
  const original = {
    MESH_HEALTH_DISABLE_RUNTIME: process.env.MESH_HEALTH_DISABLE_RUNTIME,
    OBSERVERS_FILE: process.env.OBSERVERS_FILE,
    RESULTS_FILE: process.env.RESULTS_FILE,
  };

  process.env.MESH_HEALTH_DISABLE_RUNTIME = 'true';
  process.env.OBSERVERS_FILE = '';
  process.env.RESULTS_FILE = '';

  try {
    const module = await import(
      `${pathToFileURL(path.join(REPO_DIR, 'server.js')).href}?test=${Date.now()}`
    );

    assert.equal(
      module.OBSERVERS_FILE_PATH,
      path.join(REPO_DIR, 'data', 'observer.json'),
    );
    assert.equal(
      module.RESULTS_FILE_PATH,
      path.join(REPO_DIR, 'data', 'session-results.json'),
    );
  } finally {
    if (original.MESH_HEALTH_DISABLE_RUNTIME === undefined) {
      delete process.env.MESH_HEALTH_DISABLE_RUNTIME;
    } else {
      process.env.MESH_HEALTH_DISABLE_RUNTIME = original.MESH_HEALTH_DISABLE_RUNTIME;
    }
    if (original.OBSERVERS_FILE === undefined) {
      delete process.env.OBSERVERS_FILE;
    } else {
      process.env.OBSERVERS_FILE = original.OBSERVERS_FILE;
    }
    if (original.RESULTS_FILE === undefined) {
      delete process.env.RESULTS_FILE;
    } else {
      process.env.RESULTS_FILE = original.RESULTS_FILE;
    }
  }
});
