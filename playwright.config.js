import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/smoke',
  timeout: 30000,
  fullyParallel: true,
  use: {
    browserName: 'chromium',
    headless: true,
  },
  projects: [
    {
      name: 'dashboard',
      testMatch: /dashboard\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:3091',
      },
    },
    {
      name: 'landing',
      testMatch: /landing\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:3092',
      },
    },
  ],
  webServer: [
    {
      command: 'PORT=3091 MESH_HEALTH_DISABLE_RUNTIME=true TURNSTILE_ENABLED=false APP_TITLE=\"Boston MeshCore Observer Coverage\" APP_EYEBROW=\"Boston MeshCore Observer Coverage\" OBSERVERS_FILE=./test/fixtures/observer-smoke.json KNOWN_OBSERVERS=AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B,01F0E86393494B0BE83E3D93BD528456DE39F389B9DCF802BC90B21F66EA88A6 node ./scripts/start-test-server.js',
      url: 'http://127.0.0.1:3091/api/bootstrap',
      reuseExistingServer: false,
    },
    {
      command: 'PORT=3092 MESH_HEALTH_DISABLE_RUNTIME=true TURNSTILE_ENABLED=true APP_TITLE=\"Boston MeshCore Observer Coverage\" APP_EYEBROW=\"Boston MeshCore Observer Coverage\" TURNSTILE_SITE_KEY=test-site-key TURNSTILE_SECRET_KEY=test-secret OBSERVERS_FILE=./test/fixtures/observer-smoke.json KNOWN_OBSERVERS=AF07FC2005E04D08DDA921E64985E62201BF974AE0B0E35084B804229ED11A2B,01F0E86393494B0BE83E3D93BD528456DE39F389B9DCF802BC90B21F66EA88A6 node ./scripts/start-test-server.js',
      url: 'http://127.0.0.1:3092/api/bootstrap',
      reuseExistingServer: false,
    },
  ],
});
