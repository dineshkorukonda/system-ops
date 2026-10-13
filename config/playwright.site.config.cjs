const { defineConfig } = require('@playwright/test');
const path = require('node:path');
module.exports = defineConfig({
  testDir: '../tests/site', outputDir:'../test-results', timeout: 30000, workers: 1,
  reporter: [['list'], ['html', {outputFolder:path.resolve(__dirname,'../artifacts/site-report'),open:'never'}]],
  use: {baseURL:'http://127.0.0.1:4175',screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {}},
  webServer: {command:'node scripts/serve-site.mjs',cwd:path.resolve(__dirname,'..'),env:{SITE_PORT:'4175'},url:'http://127.0.0.1:4175',reuseExistingServer:false},
});
