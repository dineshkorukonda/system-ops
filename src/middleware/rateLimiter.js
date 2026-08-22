const rateLimit = require('express-rate-limit');

// Standard API Rate Limiter (Generous limit for single-admin real-time dashboard)
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 3000, // 3000 requests per 15 min (~200 req/min)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded for dashboard API. Please wait a few moments before retrying.'
  }
});

// Rate Limiter for Chat Probe Test to avoid Ollama CPU spikes
const chatTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CHAT_TEST_RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Quick chat probe test rate limit exceeded. CPU protection active.'
  }
});

// Rate Limiter for Log Endpoints (PM2 & Backup log tails)
const logTailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOG_TAIL_RATE_LIMIT_MAX, 10) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Log tail rate limit exceeded. Please wait before retrying.'
  }
});

module.exports = {
  apiLimiter,
  chatTestLimiter,
  logTailLimiter
};
