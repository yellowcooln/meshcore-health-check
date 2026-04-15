import { expect, test } from '@playwright/test';

test('dashboard loads and creates a session code', async ({ page }) => {
  await page.goto('/app');

  await expect(page).toHaveTitle(/Boston MeshCore Observer Coverage/i);
  await expect(page.getByText('Boston MeshCore Observer Coverage')).toBeVisible();
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
  expect(shareCalls[0].text).toMatch(/^Observer coverage for MHC-[0-9A-F]{6}$/);
  expect(shareCalls[0].url).toMatch(/^http:\/\/127\.0\.0\.1:3091\/share\/[0-9a-f-]+$/i);
});

test('changing the observer selection updates the target and regenerates the unused code', async ({ page }) => {
  await page.goto('/app');

  const sessionCode = page.locator('#session-code');
  await expect(sessionCode).toContainText('MHC-', { timeout: 10000 });
  const initialCode = await sessionCode.textContent();

  const observerOptions = page.locator('#observer-allowlist input[type="checkbox"]');
  await expect(observerOptions).toHaveCount(2);
  await observerOptions.nth(0).uncheck();

  await expect(page.locator('#expected-source')).toContainText('next code');
  await expect(page.locator('#expected-observers .observer-pill')).toHaveCount(1);
  await expect(sessionCode).not.toHaveText(initialCode || '', { timeout: 10000 });
  await expect(page.locator('#expected-source')).toContainText('Custom set');
});
