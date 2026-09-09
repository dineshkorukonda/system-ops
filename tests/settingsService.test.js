const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, '../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function backupSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    return fs.readFileSync(SETTINGS_FILE, 'utf8');
  }
  return null;
}

function restoreSettings(backup) {
  if (backup) {
    fs.writeFileSync(SETTINGS_FILE, backup, 'utf8');
  } else if (fs.existsSync(SETTINGS_FILE)) {
    fs.unlinkSync(SETTINGS_FILE);
  }
}

test('getSettings returns defaults when no settings file exists', () => {
  const backup = backupSettings();
  if (fs.existsSync(SETTINGS_FILE)) fs.unlinkSync(SETTINGS_FILE);

  delete require.cache[require.resolve('../src/services/settingsService')];
  const { getSettings } = require('../src/services/settingsService');
  const settings = getSettings();

  assert.strictEqual(settings.siteName, 'system-ops');
  assert.strictEqual(settings.siteSubtitle, 'Operations Console');
  assert.strictEqual(settings.syncNameWithHostname, false);
  assert.ok(settings.resolvedSiteName);
  assert.ok(settings.pageTitle);

  restoreSettings(backup);
});

test('updateSettings persists and validates siteName', () => {
  const backup = backupSettings();

  delete require.cache[require.resolve('../src/services/settingsService')];
  const { updateSettings, getSettings } = require('../src/services/settingsService');

  const result = updateSettings({
    siteName: 'My VPS Ops',
    siteSubtitle: 'Production Console',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.settings.siteName, 'My VPS Ops');
  assert.strictEqual(result.settings.resolvedSiteName, 'My VPS Ops');

  const reloaded = getSettings();
  assert.strictEqual(reloaded.siteName, 'My VPS Ops');

  restoreSettings(backup);
});

test('syncNameWithHostname resolves site name from hostname', () => {
  const backup = backupSettings();

  delete require.cache[require.resolve('../src/services/settingsService')];
  const { updateSettings } = require('../src/services/settingsService');

  const result = updateSettings({
    siteName: 'ignored',
    syncNameWithHostname: true,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.settings.resolvedSiteName, os.hostname());

  restoreSettings(backup);
});

test('updateSettings rejects empty siteName', () => {
  const backup = backupSettings();

  delete require.cache[require.resolve('../src/services/settingsService')];
  const { updateSettings } = require('../src/services/settingsService');

  const result = updateSettings({ siteName: '   ' });
  assert.strictEqual(result.success, false);
  assert.ok(result.errors.length > 0);

  restoreSettings(backup);
});

test('buildPageTitle substitutes template variables', () => {
  delete require.cache[require.resolve('../src/services/settingsService')];
  const { buildPageTitle } = require('../src/services/settingsService');

  const title = buildPageTitle(
    { siteName: 'Ops', pageTitleTemplate: '{siteName} | {tabTitle}' },
    { tabTitle: 'System Health', hostname: 'prod-01' }
  );
  assert.strictEqual(title, 'Ops | System Health');
});
