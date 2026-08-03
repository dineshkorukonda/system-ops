require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { requireAuth, handleLogin, handleLogout, generateSessionToken } = require('./middleware/auth');
const { apiLimiter, chatTestLimiter } = require('./middleware/rateLimiter');
const { getServiceStatus, checkPortListener, getJournalLogs, getHostMetrics } = require('./services/systemService');
const { checkApiHealth, runQuickChatTest, getCliModelList } = require('./services/ollamaService');

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 9080;
const HOST = process.env.HOST || '127.0.0.1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_SERVICE = process.env.OLLAMA_SERVICE_NAME || 'ollama';

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
 * SERVE PUBLIC STATIC ASSETS (CSS, JS, Images, Login Page)
 * Critical Fix: Do NOT require auth for css/js/static files so login.html and index.html can load stylesheets cleanly!
 */
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

/**
 * Public Health Endpoint (Leak-free per security spec)
 */
app.get('/health', (req, res) => {
  return res.status(200).json({ ok: true });
});

/**
 * Authentication Endpoints
 */
app.post('/api/login', handleLogin);
app.post('/api/logout', handleLogout);

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
 */
app.use('/api', apiLimiter, requireAuth);

app.get('/api/status', async (req, res) => {
  try {
    const [systemd, listener, ollamaApi, hostMetrics] = await Promise.all([
      getServiceStatus(OLLAMA_SERVICE),
      checkPortListener(11434, '127.0.0.1'),
      checkApiHealth(OLLAMA_URL),
      Promise.resolve(getHostMetrics())
    ]);

    return res.json({
      timestamp: new Date().toISOString(),
      systemd,
      listener,
      ollamaApi,
      hostMetrics
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch status',
      details: error.message
    });
  }
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

app.get('/api/models', async (req, res) => {
  try {
    const [apiHealth, cliList] = await Promise.all([
      checkApiHealth(OLLAMA_URL),
      getCliModelList()
    ]);

    return res.json({
      apiOk: apiHealth.ok,
      latencyMs: apiHealth.latencyMs,
      models: apiHealth.models || [],
      cliOutput: cliList.output || ''
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch models list',
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
 * Future v2 Stubs
 */
app.get('/api/v2/pm2/status', (req, res) => {
  return res.status(501).json({
    status: 'coming_soon',
    version: 'v2',
    target: ['cte-backend-dev', 'cte-backend'],
    message: 'PM2 process monitoring is reserved for v2 ops release.'
  });
});

/**
 * Root Dashboard SPA (Protected)
 */
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback for SPA routing
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server bound strictly to loopback IP
app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`  System Ops Mini-Site v1.0.0 is running!`);
  console.log(`  Listening on: http://${HOST}:${PORT}`);
  console.log(`  Health Check: http://${HOST}:${PORT}/health`);
  console.log(`  Target Ollama: ${OLLAMA_URL}`);
  console.log(`=======================================================`);
});
