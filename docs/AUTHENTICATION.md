# Authentication

Browser logins create independent random sessions. Only hashes are kept in a bounded in-memory store (128 sessions, eight-hour absolute expiry). Logging out revokes the current session, including copied cookies. Restarting the server invalidates every browser session. Changing APP_PASSWORD or SESSION_SECRET also invalidates existing sessions. Re-login replaces the current session.

Cookies are HttpOnly, SameSite=Strict, Path=/ and Secure when the request uses TLS. With a TLS-terminating reverse proxy set TRUST_PROXY to the actual trusted proxy address/subnet (for example `loopback` for local nginx). Do not expose the app behind a proxy address you do not control. COOKIE_SECURE=true forces Secure cookies when the whole deployment uses HTTPS. HTTP-only local development works without it.

Login is limited to 15 attempts per source IP in 15 minutes. API callers may use exact `Bearer APP_PASSWORD` or Basic credentials with APP_PASSWORD as the password; browser session tokens also work with Bearer. Static API passwords do not expire and logout cannot revoke the password; rotate APP_PASSWORD to revoke API access. Auth status uses the same validator as protected routes. The old deterministic HMAC token is no longer accepted.
