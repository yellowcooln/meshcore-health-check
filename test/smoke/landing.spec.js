import { expect, test } from '@playwright/test';

test('privacy stays public while Turnstile protects the dashboard', async ({ page, request }) => {
  const response = await request.get('/app', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
});

test('turnstile landing page renders when verification is required', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.turnstile={render(){},reset(){}};',
    });
  });

  await page.goto('/');

  await expect(page).toHaveTitle(/Verification/i);
  await expect(page.getByText('Human Verification')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MeshCore Observer Coverage' })).toBeVisible();
  await expect(page.getByText(/Complete the Turnstile challenge/i)).toBeVisible();
  await expect(page.locator('#landing-status')).toContainText('Waiting for verification', { timeout: 10000 });
});
