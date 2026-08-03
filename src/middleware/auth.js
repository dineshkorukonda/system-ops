const crypto = require('crypto');

// Generate a deterministic session token based on password + secret
function generateSessionToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(password).digest('hex');
}

/**
 * Express middleware to verify user authentication.
 * Checks Cookie session, Bearer header, or Basic Auth header.
 */
function requireAuth(req, res, next) {
  const appPassword = process.env.APP_PASSWORD || 'admin-password-change-me';
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-session-key-12345';
  const expectedToken = generateSessionToken(appPassword, sessionSecret);

  // 1. Check Session Cookie
  const sessionCookie = req.cookies ? req.cookies.system_ops_session : null;
  if (sessionCookie && sessionCookie === expectedToken) {
    return next();
  }

  // 2. Check Authorization header (Bearer or Basic)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token === appPassword || token === expectedToken) {
        return next();
      }
    } else if (authHeader.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
        const [username, password] = credentials.split(':');
        if (password === appPassword || password === expectedToken) {
          return next();
        }
      } catch (e) {
        // Invalid basic header format
      }
    }
  }

  // If requesting API endpoint, return 401 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Please log in.'
    });
  }

  // Otherwise redirect to login page
  return res.redirect('/login.html');
}

/**
 * Log in handler to validate password and set session cookie
 */
function handleLogin(req, res) {
  const { password } = req.body || {};
  const appPassword = process.env.APP_PASSWORD || 'admin-password-change-me';
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-session-key-12345';

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== appPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateSessionToken(appPassword, sessionSecret);

  // Set HTTP-Only session cookie
  res.cookie('system_ops_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.json({ success: true, message: 'Authenticated successfully' });
}

/**
 * Log out handler to clear session cookie
 */
function handleLogout(req, res) {
  res.clearCookie('system_ops_session');
  return res.json({ success: true, message: 'Logged out successfully' });
}

module.exports = {
  requireAuth,
  handleLogin,
  handleLogout,
  generateSessionToken
};
