# Changelog

All notable changes to system-ops are documented here.

## [Unreleased]

### Added
- Contributor, support, security, conduct, and governance policies; issue forms, PR template, review routing, and agent instructions.
- Public documentation generated from maintained Markdown, searchable navigation, and a refreshed marketing site.
- Documentation/link validation and release preparation guidance.
- Disposable Ubuntu/systemd release fixture covering the installer, account permissions, background updater, and recovery.
- Static-host configuration and grouped documentation/configuration directories.

### Changed
- Group community policies under `.github/`, documentation by purpose under `docs/`, and build/test/type configuration under `config/`; preserve public documentation URLs.
- Standardized maintainer/package metadata and Node 24 version files.
- Replaced unverified installer/marketing memory promises with reproducible measurement guidance.
- Use the MIT-licensed UA Parser v1 line; dependency automation excludes its AGPL v2 line.

### Fixed
- Recovery now uses staged validation instead of resetting the checkout or clearing Git stashes.
- Re-running the installer delegates to staged updates; local installs clone committed source instead of copying secrets or worktree pointers.
- Synthetic benchmark logs rotate at a bounded byte limit during long runs.
- Long workload requests remain authenticated beyond browser-session expiry.

### Project decisions
- Maintainer waived the 24-hour acceptance gate and requested closure of the remaining reliability tracker. No long-running or production availability result is claimed.

## [2.1.0] - 2026-09-09

### Added
- GitHub Actions CI (tests + production build)
- Docker multi-stage image build with baked `dist/` assets
- `.env.docker.example` for container deployments
- Expanded README with features, Docker, and development setup
- Settings page update completion banner (success / failure)
- Marketing site (`web/`) updated for Tier 1 host integrations

### Changed
- Stop tracking built `dist/` in git — deploy and Docker build produce assets locally
- Narrow default sudoers rules (journalctl, tail, ufw, fail2ban, docker, systemctl, certbot, deploy/recover scripts)
- Installer no longer sets `BACKUPS_DIR` by default — configure when backups are ready
- `docker-compose.yml` env vars aligned with `APP_PASSWORD` and current `.env.example`

### Fixed
- Docker image previously served without a Vite build (blank dashboard)
- Stale `AUTH_PASSWORD` / `BACKUP_LOG_PATH` names in Docker compose

## [2.0.0] - 2026

- React SPA dashboard, Go metrics sidecar, in-dashboard self-updates
- Security (UFW + fail2ban), databases, certbot, OS updates collectors
- PM2 fleet, Docker containers, traffic analytics, PostgreSQL backups
