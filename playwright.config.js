const { defineConfig, devices } = require('@playwright/test');

/* Drives the real app: Playwright boots ./bin/www on a test port first.
   Uses the Chrome already installed on the machine rather than downloading
   a browser, so `npm test` works without `playwright install`. */
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    }
  ],

  webServer: {
    command: 'node ./bin/www',
    env: { PORT: '3100' },
    url: 'http://127.0.0.1:3100/',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  }
});
