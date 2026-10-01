import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');

test('radio console is an app-only stylesheet layered after shared styles', () => {
  const app = read('index.html');
  assert.ok(app.indexOf('href="/radio-console.css"') > app.indexOf('href="/styles.css"'));
  assert.match(app, /class="noc-body radio-console"/);
  for (const page of ['share.html', 'landing.html', 'privacy.html']) {
    assert.doesNotMatch(read(page), /radio-console\.css/);
  }
  assert.doesNotMatch(app, /field-utility\.css/);
});

test('radio console retains the scoring SVG and all primary task hooks', () => {
  const app = read('index.html');
  for (const id of ['session-code', 'copy-session-code', 'new-session-button', 'share-session',
    'health-label', 'health-percent', 'observed-count', 'observer-map', 'observer-customization',
    'session-instructions', 'session-details', 'hero-title', 'hero-eyebrow', 'external-link']) {
    assert.equal(app.split(`id="${id}"`).length - 1, 1, `${id} must remain unique`);
  }
  assert.match(app, /class="score-ring__fill" cx="60" cy="60" r="50"/);
  assert.match(app, /class="score-selection-note"/);
});
