# Support

System Ops is community maintained. Support is best effort; there is no guaranteed response time or commercial SLA.

- **Setup, usage, and troubleshooting:** start with the [documentation](../docs/README.md) and [troubleshooting guide](../docs/getting-started/TROUBLESHOOTING.md), then ask in [GitHub Discussions](https://github.com/dineshkorukonda/system-ops/discussions).
- **Reproducible defects:** use the [bug report form](https://github.com/dineshkorukonda/system-ops/issues/new?template=bug_report.yml).
- **Feature proposals:** use the [feature request form](https://github.com/dineshkorukonda/system-ops/issues/new?template=feature_request.yml).
- **Security vulnerabilities:** follow [SECURITY.md](SECURITY.md); keep exploit details out of public issues.
- **Conduct concerns:** follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Include the commit/version, installation method, OS, Node version, affected integration, reproduction steps, and sanitized diagnostics. Remove passwords, session cookies, webhook tokens, private IPs/domains, visitor IPs, and backup contents. Do not attach your `.env` or monitoring database.

Native Ubuntu/systemd is the primary host-monitoring deployment. Docker has narrower host visibility; see [installation](../docs/getting-started/INSTALLATION.md). The project does not provide incident response, operate your VPS, or guarantee backup recoverability. Test restores and keep an independent recovery path for your own deployment.
