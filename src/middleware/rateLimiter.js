const rateLimit = require('express-rate-limit');

// Standard API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded for dashboard API. Please wait a few minutes before retrying.'
  }
});

// Strict Rate Limiter for Chat Probe Test to avoid CPU spikes
const chatTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.CHAT_TEST_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Quick chat probe test rate limit exceeded (max 10 tests / 15 min). CPU protection active.'
  }
});

// Rate Limiter for Log Endpoints (v2 PM2 & Backup log tails)
const logTailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.LOG_TAIL_RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Log tail rate limit exceeded (max 30 requests / 15 min). Please wait before retrying.'
  }
});

module.exports = {
  apiLimiter,
  chatTestLimiter,
  logTailLimiter
};
