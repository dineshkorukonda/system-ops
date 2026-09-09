# system-ops

Lightweight self-hosted operations console for a single Ubuntu VPS. Under 35MB RAM.

**Docs, features, and setup:** [system-ops.dineshkorukonda.online](https://system-ops.dineshkorukonda.online/)

---

## Install

```bash
curl -sSL https://raw.githubusercontent.com/dineshkorukonda/system-ops/main/scripts/install.sh | bash
```

## Update

```bash
sudo bash /opt/system-ops/scripts/deploy.sh
```

If the dashboard update fails or the site is down:

```bash
sudo bash /opt/system-ops/scripts/recover.sh
```

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

MIT © 2026 Dinesh Korukonda
