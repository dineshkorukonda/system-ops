const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/ui', timeout: 30000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:19086', viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {} },
  webServer: { command: 'node scripts/ui-fixture.js', url: 'http://127.0.0.1:19086/health', reuseExistingServer: false },
});
