const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/site', timeout: 30000, workers: 1,
  reporter: [['list'], ['html', {outputFolder:'artifacts/site-report',open:'never'}]],
  use: {baseURL:'http://127.0.0.1:4175',screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {}},
  webServer: {command:'node scripts/serve-site.mjs',env:{SITE_PORT:'4175'},url:'http://127.0.0.1:4175',reuseExistingServer:false},
});
