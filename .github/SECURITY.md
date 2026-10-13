# Security policy

## Supported versions

Security fixes target the current `main` branch and the latest published release when one exists. Older commits/releases do not have a separate backport commitment. There are no published stable tags at the time this policy was introduced; an npm package version alone is not a supported release tag.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/dineshkorukonda/system-ops/security/advisories/new). Include affected revisions, deployment method, impact, and a minimal reproduction with dummy credentials. Do not file a public exploit report or upload production secrets. If GitHub reporting is unavailable, contact [@dineshkorukonda](https://github.com/dineshkorukonda) through a private contact channel listed on their profile, asking for a secure reporting channel without sending exploit details publicly.

Reports are handled on a best-effort basis with no guaranteed response time. The maintainer will coordinate a fix and disclosure with the reporter where possible. Credit is optional and agreed with the reporter.

## Deployment boundary

The console uses a shared administrator password; it is not a multi-tenant service. Keep the default loopback binding and use HTTPS through a trusted reverse proxy. Set unique `APP_PASSWORD` and `SESSION_SECRET` values. Only configure `TRUST_PROXY` for proxies you control. Browser sessions expire and are revoked on restart; API passwords require rotation. See [authentication](../docs/operations/AUTHENTICATION.md).

Host monitoring requires access to selected logs and commands. Docker socket access carries elevated host privileges. Review sudoers changes before installation and do not grant arbitrary passwordless shells to the service account. Keep backups of persistent data before updates; future schema changes may restrict rollback. GitHub Actions do not deploy to your production host.
