const crypto = require('node:crypto');
const COOKIE = 'system_ops_session';
function equal(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(left).digest(), crypto.createHash('sha256').update(right).digest());
}
class SessionStore {
  constructor({ now = Date.now, ttlMs = 8 * 60 * 60 * 1000, maxSessions = 128 } = {}) {
    this.now = now; this.ttlMs = ttlMs; this.maxSessions = maxSessions; this.sessions = new Map();
  }
  key(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
  prune() { for (const [key, session] of this.sessions) if (session.expiresAt <= this.now()) this.sessions.delete(key); }
  create(identity) {
    this.prune();
    while (this.sessions.size >= this.maxSessions) this.sessions.delete(this.sessions.keys().next().value);
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(this.key(token), { identity, expiresAt: this.now() + this.ttlMs });
    return token;
  }
  valid(token, identity) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    this.prune();
    const session = this.sessions.get(this.key(token));
    return !!session && equal(session.identity, identity);
  }
  revoke(token) { if (typeof token === 'string') this.sessions.delete(this.key(token)); }
}
const sessions = new SessionStore();
const password = () => process.env.APP_PASSWORD || 'admin-password-change-me';
const identity = () => crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret-session-key-12345').update(password()).digest('hex');
const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', path: '/', secure: req.secure === true || process.env.COOKIE_SECURE === 'true' });
function isAuthenticated(req) {
  if (sessions.valid(req.cookies?.[COOKIE], identity())) return true;
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return false;
  const bearer = /^Bearer ([^\s]+)$/i.exec(header);
  if (bearer) return equal(bearer[1], password()) || sessions.valid(bearer[1], identity());
  const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!basic) return false;
  const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator >= 0 && equal(decoded.slice(separator + 1), password());
}
function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  if ([req.originalUrl, req.baseUrl, req.path].some(value => value?.startsWith('/api') || /^\/metrics(?:\?|$)/.test(value || ''))) return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required. Please log in.' });
  return res.redirect('/login.html');
}
function handleLogin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (typeof req.body?.password !== 'string' || !req.body.password) return res.status(400).json({ error: 'Password required' });
  if (!equal(req.body.password, password())) return res.status(401).json({ error: 'Invalid password' });
  sessions.revoke(req.cookies?.[COOKIE]);
  const token = sessions.create(identity());
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: sessions.ttlMs });
  return res.json({ success: true, message: 'Authenticated successfully' });
}
function handleLogout(req, res) {
  sessions.revoke(req.cookies?.[COOKIE]);
  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers?.authorization || '');
  if (bearer) sessions.revoke(bearer[1]);
  res.setHeader('Cache-Control', 'no-store');
  res.clearCookie(COOKIE, cookieOptions(req));
  return res.json({ success: true, message: 'Logged out successfully' });
}
module.exports = { requireAuth, handleLogin, handleLogout, isAuthenticated, SessionStore };
