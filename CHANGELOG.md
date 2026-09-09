# Changelog

All notable changes to system-ops are documented here.

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
