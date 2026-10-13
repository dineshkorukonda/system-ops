const { defineConfig } = require('@playwright/test');
const path = require('node:path');
module.exports = defineConfig({
  testDir: '../tests/ui', outputDir: '../test-results', timeout: 30000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder:path.resolve(__dirname,'../playwright-report') }]],
  use: { baseURL: 'http://127.0.0.1:19086', viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {} },
  webServer: { command: 'node scripts/ui-fixture.js', cwd:path.resolve(__dirname,'..'), url: 'http://127.0.0.1:19086/health', reuseExistingServer: false },
});
