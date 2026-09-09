require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { requireAuth, handleLogin, handleLogout, generateSessionToken } = require('./middleware/auth');
const { apiLimiter, chatTestLimiter, logTailLimiter } = require('./middleware/rateLimiter');
const { getJournalLogs } = require('./services/systemService');
const { runQuickChatTest } = require('./services/ollamaService');
const { getSettings, getPublicBranding, updateSettings } = require('./services/settingsService');
const { getVersionInfo, getUpdateStatus, startUpdate } = require('./services/updateService');

// Core Architecture Modules
const { stateStore } = require('./core/stateStore');
const { collectorManager } = require('./core/collectorManager');
const { registerAllCollectors } = require('./core/scheduler');

// On-demand collectors & tail handlers (interactive operations)
const { getServiceLogs } = require('./collectors/services');
const { getPm2Logs } = require('./collectors/pm2');
const { getLogSourcesList, getLogSourceTail } = require('./collectors/logSources');
const { getBackupFilePath, listBackupFiles } = require('./collectors/backupFiles');
const { sampleProcesses } = require('./collectors/processCollector');
const { getSystemSnapshot } = require('./collectors/system');
const { getServicesSnapshot } = require('./collectors/services');
const { getPm2Snapshot } = require('./collectors/pm2');
const { getCapabilities } = require('./collectors/capabilities');
const { getDockerSnapshot, getDockerLogs } = require('./collectors/docker');
const { parseTrafficAnalytics } = require('./collectors/trafficAnalytics');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 9080;
const HOST = process.env.HOST || '127.0.0.1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_SERVICE = process.env.OLLAMA_SERVICE_NAME || 'ollama';

// Determine static assets directory (dist for React SPA, fallback to public)
const distDir = path.join(__dirname, '../dist');
const publicDir = path.join(__dirname, '../public');
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;

// Global Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security headers middleware
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

/**
 * SERVE STATIC ASSETS (CSS, JS, Bundled React SPA)
 */
app.use(express.static(staticDir, { index: false }));

/**
 * Public Health Endpoints (Leak-free per security spec)
 */
app.get('/health', (req, res) => {
  return res.status(200).json({ ok: true });
});

app.get('/api/health', (req, res) => {
  return res.status(200).json({ ok: true });
});

/**
 * Authentication Endpoints
 */
app.post('/api/login', handleLogin);
app.post('/api/logout', handleLogout);

// Public branding (no auth — used on login page)
app.get('/api/v2/settings/branding', (req, res) => {
  return res.json(getPublicBranding());
});

app.get('/api/auth/status', (req, res) => {
  const appPassword = process.env.APP_PASSWORD || 'admin-password-change-me';
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-session-key-12345';
  const expectedToken = generateSessionToken(appPassword, sessionSecret);
  const sessionCookie = req.cookies ? req.cookies.system_ops_session : null;

  if (sessionCookie && sessionCookie === expectedToken) {
    return res.json({ authenticated: true });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && (authHeader.includes(appPassword) || authHeader.includes(expectedToken))) {
    return res.json({ authenticated: true });
  }

  return res.json({ authenticated: false });
});

// Login Page Route
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

/**
 * Protected API Endpoints (Requires Auth & Rate Limiting)
 * All endpoints read shared cached stateStore by default (Zero direct system discovery overhead).
 */
app.use('/api', apiLimiter, requireAuth);

/**
 * Internal Ops Diagnostics (Self-Monitoring for System-Ops itself)
 */
app.get('/api/v2/ops/diagnostics', (req, res) => {
  return res.json(stateStore.getDiagnostics());
});

/**
 * Explicit Rescan Endpoint (Manual refresh allowed without polling multiplying overhead)
 */
app.post('/api/v2/discovery/rescan', async (req, res) => {
  try {
    const { target } = req.body || {};
    const result = await collectorManager.rescan(target || null);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ error: 'Rescan failed', details: err.message });
  }
});

/**
 * Ollama Legacy & v2 Endpoints (Served from Cached StateStore)
 */
app.get('/api/status', async (req, res) => {
  const cached = stateStore.get('ollama.status');
  if (cached) {
    return res.json(cached);
  }
  // Fallback if background collector hasn't completed initial tick
  try {
    const data = await collectorManager.runCollector('ollama');
    return res.json(data?.data?.status || {});
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch status', details: error.message });
  }
});

app.get('/api/models', async (req, res) => {
  const cached = stateStore.get('ollama.models');
  if (cached) {
    return res.json(cached);
  }
  return res.json({ apiOk: false, latencyMs: 0, models: [], cliOutput: '' });
});

app.get('/api/logs', async (req, res) => {
  try {
    const defaultLines = parseInt(process.env.DEFAULT_LOG_LINES, 10) || 100;
    const requestedLines = parseInt(req.query.lines, 10) || defaultLines;
    const logData = await getJournalLogs(OLLAMA_SERVICE, requestedLines);
    return res.json(logData);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to retrieve service logs',
      details: error.message
    });
  }
});

app.post('/api/test-chat', chatTestLimiter, async (req, res) => {
  if (process.env.ENABLE_CHAT_TEST === 'false') {
    return res.status(403).json({
      error: 'Disabled',
      message: 'Quick chat test is disabled by configuration.'
    });
  }

  const { model, prompt } = req.body || {};
  const testPrompt = prompt || 'OK';

  try {
    const result = await runQuickChatTest(OLLAMA_URL, model, testPrompt);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Chat test execution failed',
      details: error.message
    });
  }
});

/**
 * Services API Endpoints (Native Systemd Supervision)
 */
app.get('/api/v2/services/snapshot', async (req, res) => {
  const cached = stateStore.get('services');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await getServicesSnapshot();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch services snapshot', details: error.message });
  }
});

app.get('/api/v2/services/logs', logTailLimiter, async (req, res) => {
  try {
    const { unit, lines } = req.query;
    const data = await getServiceLogs(unit, lines);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch service logs', details: error.message });
  }
});

/**
 * PM2 Fleet Endpoints
 */
app.get('/api/v2/pm2/snapshot', async (req, res) => {
  const cached = stateStore.get('pm2');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await getPm2Snapshot();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch PM2 snapshot', details: error.message });
  }
});

app.get('/api/v2/pm2/logs', logTailLimiter, async (req, res) => {
  try {
    const { user, app: appName, lines } = req.query;
    const data = await getPm2Logs(user, appName, lines);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch PM2 logs', details: error.message });
  }
});

/**
 * Docker Containers Endpoints
 */
app.get('/api/v2/docker/snapshot', async (req, res) => {
  const cached = stateStore.get('docker');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await getDockerSnapshot();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch Docker snapshot', details: error.message });
  }
});

app.get('/api/v2/docker/logs', logTailLimiter, async (req, res) => {
  try {
    const { id, lines } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Container ID required' });
    }
    const data = await getDockerLogs(id, lines);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch container logs', details: error.message });
  }
});

/**
 * System Telemetry & Process Monitoring Endpoints
 */
app.get('/api/v2/system/capabilities', async (req, res) => {
  const cached = stateStore.get('capabilities');
  if (cached) {
    return res.json(cached);
  }
  try {
    const caps = await getCapabilities();
    stateStore.set('capabilities', caps);
    return res.json(caps);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to detect system capabilities', details: error.message });
  }
});

app.get('/api/v2/system/snapshot', async (req, res) => {
  const cached = stateStore.get('system');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await getSystemSnapshot();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch system snapshot', details: error.message });
  }
});

app.get('/api/v2/system/processes', async (req, res) => {
  const { limit, sort } = req.query;
  const limitNum = parseInt(limit, 10) || 50;
  const sortBy = sort === 'mem' ? 'mem' : 'cpu';

  const cached = stateStore.get('processes');
  if (cached && cached.processes) {
    let procs = [...cached.processes];
    if (sortBy === 'mem') {
      procs.sort((a, b) => b.rssBytes - a.rssBytes);
    } else {
      procs.sort((a, b) => b.cpuPercent - a.cpuPercent);
    }
    return res.json({
      sortBy,
      limit: limitNum,
      total: cached.total || procs.length,
      processes: procs.slice(0, limitNum)
    });
  }

  try {
    const data = await sampleProcesses({ limit: limitNum, sortBy });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch system processes', details: error.message });
  }
});

/**
 * Log Sources
 */
app.get('/api/v2/logs/sources', (req, res) => {
  try {
    const sources = getLogSourcesList();
    return res.json({ sources });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch log sources list', details: error.message });
  }
});

app.get('/api/v2/logs/tail', logTailLimiter, async (req, res) => {
  try {
    const { id, lines } = req.query;
    const data = await getLogSourceTail(id, lines);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch log source tail', details: error.message });
  }
});

/**
 * Backups Endpoints
 */
app.get('/api/v2/backups/files', async (req, res) => {
  const cached = stateStore.get('backups');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await listBackupFiles();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list backup files', details: error.message });
  }
});

app.get('/api/v2/backups/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const targetPath = getBackupFilePath(filename);
    return res.download(targetPath, filename);
  } catch (error) {
    const statusCode = error.message.includes('Access denied') ? 403 : error.message.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.get('/api/v2/backups/download', (req, res) => {
  try {
    const filename = req.query.filename;
    const targetPath = getBackupFilePath(filename);
    return res.download(targetPath, filename);
  } catch (error) {
    const statusCode = error.message.includes('Access denied') ? 403 : error.message.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

/**
 * Traffic & Geographic Analytics Endpoints (v2 & legacy)
 */
app.get('/api/v2/traffic/analytics', async (req, res) => {
  const cached = stateStore.get('traffic');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await parseTrafficAnalytics();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to parse traffic analytics', details: error.message });
  }
});

app.get('/api/traffic-analytics', async (req, res) => {
  const cached = stateStore.get('traffic');
  if (cached) {
    return res.json(cached);
  }
  try {
    const data = await parseTrafficAnalytics();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to parse traffic analytics', details: error.message });
  }
});

/**
 * Settings & Branding
 */
app.get('/api/v2/settings', (req, res) => {
  return res.json(getSettings());
});

app.put('/api/v2/settings', async (req, res) => {
  const result = updateSettings(req.body || {});
  if (!result.success) {
    return res.status(400).json(result);
  }

  // Toggle auto-update timer when setting changes
  const autoUpdateScript = path.join(__dirname, '../scripts/setup-auto-update.sh');
  if (req.body?.autoUpdateEnabled !== undefined && fs.existsSync(autoUpdateScript)) {
    const flag = req.body.autoUpdateEnabled ? '--enable' : '--disable';
    const { spawn } = require('child_process');
    spawn('sudo', ['bash', autoUpdateScript, flag], { detached: true, stdio: 'ignore' }).unref();
  }

  return res.json(result);
});

/**
 * System Version & Updates
 */
app.get('/api/v2/system/version', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const info = await getVersionInfo(forceRefresh);
    return res.json(info);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to check version', details: error.message });
  }
});

app.get('/api/v2/system/update/status', (req, res) => {
  return res.json(getUpdateStatus());
});

app.post('/api/v2/system/update', (req, res) => {
  const appPassword = process.env.APP_PASSWORD || 'admin-password-change-me';
  const { password } = req.body || {};

  if (!password || password !== appPassword) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const result = startUpdate();
  if (!result.success) {
    return res.status(409).json(result);
  }
  return res.json({ success: true, pid: result.pid });
});

/**
 * Root Dashboard SPA
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Initialize Collectors & Start Server bound strictly to loopback IP
registerAllCollectors();

// Only start background collectors when server is launched directly
if (process.env.NODE_ENV !== 'test') {
  collectorManager.startAll().catch(err => {
    console.error('[CollectorManager] Failed to start collectors:', err);
  });
}

const server = app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`  System Ops Mini-Site v2.1.0 (Async Collector Engine)`);
  console.log(`  Listening on: http://${HOST}:${PORT}`);
  console.log(`  Health Check: http://${HOST}:${PORT}/health`);
  console.log(`  Diagnostics:  http://${HOST}:${PORT}/api/v2/ops/diagnostics`);
  console.log(`  Target Ollama: ${OLLAMA_URL}`);

  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD === 'admin-password-change-me') {
    console.warn(`\n[SECURITY WARNING] Using default APP_PASSWORD. Set APP_PASSWORD in .env!`);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-session-key-12345') {
    console.warn(`[SECURITY WARNING] Using default SESSION_SECRET. Set SESSION_SECRET in .env!`);
  }
  console.log(`=======================================================`);
});

module.exports = { app, server };
