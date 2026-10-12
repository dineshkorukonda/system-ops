const fs = require('fs');
const path = require('path');
const os = require('os');
const { integrationDefaults, validateIntegrations } = require('../core/integrationConfig');

const DATA_DIR = process.env.SYSTEM_OPS_DATA_DIR
  ? path.resolve(process.env.SYSTEM_OPS_DATA_DIR)
  : path.join(__dirname, '../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULTS = {
  siteName: 'system-ops',
  siteSubtitle: 'Operations Console',
  syncNameWithHostname: false,
  pageTitleTemplate: '{siteName} | {hostname}',
  autoUpdateEnabled: false,
  integrations: {},
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));
const MAX_NAME_LENGTH = 64;
const MAX_SUBTITLE_LENGTH = 128;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getEnvDefaults() {
  const defaults = { ...DEFAULTS, integrations: integrationDefaults() };
  if (process.env.SITE_NAME) {
    defaults.siteName = process.env.SITE_NAME.trim();
  }
  if (process.env.SITE_SUBTITLE) {
    defaults.siteSubtitle = process.env.SITE_SUBTITLE.trim();
  }
  return defaults;
}

function readRawSettings() {
  const durable = require('./durableStore').getDurableStore().setting('settings');
  if (durable) return durable;
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const imported = JSON.parse(raw);
    require('./durableStore').getDurableStore().saveSetting('settings', imported);
    return imported;
  } catch {
    return {};
  }
}

function resolveSiteName(settings) {
  if (settings.syncNameWithHostname) {
    return os.hostname();
  }
  return settings.siteName || DEFAULTS.siteName;
}

function buildPageTitle(settings, extras = {}) {
  const siteName = resolveSiteName(settings);
  const hostname = extras.hostname || os.hostname();
  const tabTitle = extras.tabTitle || hostname;
  const template = settings.pageTitleTemplate || DEFAULTS.pageTitleTemplate;

  return template
    .replace(/\{siteName\}/g, siteName)
    .replace(/\{hostname\}/g, hostname)
    .replace(/\{tabTitle\}/g, tabTitle);
}

function getSettings() {
  const raw = readRawSettings();
  const merged = { ...getEnvDefaults(), ...raw,
    integrations: { ...integrationDefaults(), ...(raw.integrations || {}) } };

  return {
    ...merged,
    resolvedSiteName: resolveSiteName(merged),
    pageTitle: buildPageTitle(merged),
    hostname: os.hostname(),
  };
}

function getPublicBranding() {
  const settings = getSettings();
  return {
    siteName: settings.resolvedSiteName,
    siteSubtitle: settings.siteSubtitle,
    pageTitle: settings.pageTitle,
    hostname: settings.hostname,
  };
}

function validateSettings(input) {
  const errors = [];
  if (input.integrations !== undefined && !validateIntegrations(input.integrations)) {
    errors.push('integrations must contain known integration names with boolean values');
  }

  if (input.siteName !== undefined) {
    const name = String(input.siteName).trim();
    if (!name) errors.push('siteName cannot be empty');
    if (name.length > MAX_NAME_LENGTH) errors.push(`siteName must be at most ${MAX_NAME_LENGTH} characters`);
  }

  if (input.siteSubtitle !== undefined) {
    const subtitle = String(input.siteSubtitle).trim();
    if (!subtitle) errors.push('siteSubtitle cannot be empty');
    if (subtitle.length > MAX_SUBTITLE_LENGTH) {
      errors.push(`siteSubtitle must be at most ${MAX_SUBTITLE_LENGTH} characters`);
    }
  }

  if (input.pageTitleTemplate !== undefined) {
    const template = String(input.pageTitleTemplate).trim();
    if (!template.includes('{siteName}')) {
      errors.push('pageTitleTemplate must include {siteName}');
    }
  }

  return errors;
}

function updateSettings(partial) {
  const errors = validateSettings(partial);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const current = { ...getEnvDefaults(), ...readRawSettings() };
  const next = { ...current };

  for (const [key, value] of Object.entries(partial)) {
    if (!ALLOWED_KEYS.has(key)) continue;

    if (key === 'integrations') {
      next.integrations = { ...integrationDefaults(), ...current.integrations, ...value };
    } else if (key === 'syncNameWithHostname' || key === 'autoUpdateEnabled') {
      next[key] = Boolean(value);
    } else if (typeof value === 'string') {
      next[key] = value.trim();
    }
  }

  ensureDataDir();
  if (!require('./durableStore').getDurableStore().saveSetting('settings', next)) {
    return { success: false, errors: ['Settings could not be persisted. Check persistence diagnostics and disk access.'] };
  }
  const tmpFile = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpFile, SETTINGS_FILE);

  return { success: true, settings: getSettings() };
}

module.exports = {
  getSettings,
  getPublicBranding,
  updateSettings,
  buildPageTitle,
  resolveSiteName,
  SETTINGS_FILE,
  DATA_DIR,
};
