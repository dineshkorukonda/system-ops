import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function TroubleshootingView({ capabilities }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [diagResults, setDiagResults] = useState(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const handleCopy = (text, index) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const runQuickDiagnostics = async () => {
    setIsDiagnosing(true);
    const results = [];

    // 1. Health check
    try {
      const res = await fetch('/health');
      results.push({
        title: 'Core Server API',
        ok: res.ok,
        message: res.ok ? 'Server loopback is healthy (HTTP 200)' : `HTTP Error ${res.status}`,
        fix: 'Check if node server is running: sudo systemctl status system-ops.service',
      });
    } catch (e) {
      results.push({
        title: 'Core Server API',
        ok: false,
        message: e.message,
        fix: 'Start service: sudo systemctl restart system-ops.service',
      });
    }

    // 2. Services Snapshot
    try {
      const res = await fetch('/api/v2/services/snapshot');
      const data = res.ok ? await res.json() : null;
      results.push({
        title: 'Systemd Telemetry',
        ok: res.ok && data?.services,
        message: res.ok ? `${data?.activeCount || 0} active systemd units monitored` : `Failed (${res.status})`,
        fix: 'Ensure /etc/sudoers.d/system-ops has passwordless sudo for ops user',
      });
    } catch (e) {
      results.push({
        title: 'Systemd Telemetry',
        ok: false,
        message: e.message,
        fix: 'Check sudoers permissions in /etc/sudoers.d/system-ops',
      });
    }

    // 3. PM2 Fleet Discovery
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      const data = res.ok ? await res.json() : null;
      const usersWithPm2 = data?.users?.filter((u) => u.pm2Path && !u.error) || [];
      results.push({
        title: 'PM2 Fleet Auto-Discovery',
        ok: res.ok && !data?.error,
        message: res.ok
          ? `${data?.totalProcesses || 0} process(es) discovered across ${data?.users?.length || 0} user(s)`
          : `Discovery issue`,
        fix: 'Run: sudo bash /opt/system-ops/scripts/debug-pm2.sh and ensure ProtectHome=false',
      });
    } catch (e) {
      results.push({
        title: 'PM2 Fleet Auto-Discovery',
        ok: false,
        message: e.message,
        fix: 'Run: sudo bash /opt/system-ops/scripts/debug-pm2.sh',
      });
    }

    // 4. Traffic Analytics Log Access
    try {
      const res = await fetch('/api/v2/traffic/analytics');
      const data = res.ok ? await res.json() : null;
      results.push({
        title: 'Nginx Access Log Parser',
        ok: res.ok && !data?.error,
        message: res.ok
          ? `${data?.summary?.total_hits || 0} total hits parsed`
          : data?.error || 'Log file not readable',
        fix: 'Ensure /var/log/nginx/access.log is readable (sudo chmod 644 /var/log/nginx/access.log)',
      });
    } catch (e) {
      results.push({
        title: 'Nginx Access Log Parser',
        ok: false,
        message: e.message,
        fix: 'Check NGINX_LOG_PATH in /opt/system-ops/.env',
      });
    }

    // 5. Backups Directory
    try {
      const res = await fetch('/api/v2/backups/files');
      const data = res.ok ? await res.json() : null;
      results.push({
        title: 'PostgreSQL Backups Directory',
        ok: res.ok && !data?.error,
        message: res.ok ? `${data?.files?.length || 0} backup file(s) found` : data?.error || 'Access issue',
        fix: 'Set BACKUPS_DIR=/var/backups in /opt/system-ops/.env and chmod o+r',
      });
    } catch (e) {
      results.push({
        title: 'PostgreSQL Backups Directory',
        ok: false,
        message: e.message,
        fix: 'Verify BACKUPS_DIR in /opt/system-ops/.env',
      });
    }

    setDiagResults(results);
    setIsDiagnosing(false);
  };

  const guides = [
    {
      id: 'pm2-binary-not-found',
      category: 'pm2',
      title: "PM2 binary not found / 0 processes discovered",
      symptom: "[deploy] PM2 binary not found for 'deploy' or [root] PM2 binary not found",
      badge: 'COMMON',
      badgeVariant: 'warn',
      causes: [
        "Node/PM2 installed via custom Version Managers (NVM, Volta, fnm, asdf) in user's home directory.",
        "Systemd ProtectHome sandboxing blocking /home and /root directories.",
      ],
      solution: "Disable systemd ProtectHome and execute the PM2 diagnostic tool to auto-detect binary paths.",
      commands: [
        {
          label: "1. Run automated PM2 diagnostic scanner",
          cmd: "sudo bash /opt/system-ops/scripts/debug-pm2.sh",
        },
        {
          label: "2. Ensure ProtectHome is disabled in systemd service",
          cmd: "sudo sed -i 's/ProtectHome=true/ProtectHome=false/' /etc/systemd/system/system-ops.service\nsudo systemctl daemon-reload\nsudo systemctl restart system-ops.service",
        },
        {
          label: "3. (Optional) Explicitly pin PM2 paths in .env",
          cmd: 'echo "PM2_PATH_ROOT=$(which pm2)" >> /opt/system-ops/.env\necho "PM2_PATH_DEPLOY=/home/deploy/.nvm/versions/node/$(sudo -u deploy node -v 2>/dev/null || echo "current")/bin/pm2" >> /opt/system-ops/.env\nsudo systemctl restart system-ops.service',
        },
      ],
    },
    {
      id: 'sudo-password-required',
      category: 'systemd',
      title: "Sudo password required / Permission Denied",
      symptom: "Sudo password required for user 'deploy' or 'ops'",
      badge: 'PERMISSIONS',
      badgeVariant: 'err',
      causes: [
        "/etc/sudoers.d/system-ops configuration is missing or has incorrect file permissions (must be 0440).",
        "The ops service user is prompted for an interactive password.",
      ],
      solution: "Configure passwordless sudo for the ops user in /etc/sudoers.d/system-ops with strict 0440 permissions.",
      commands: [
        {
          label: "Create /etc/sudoers.d/system-ops",
          cmd: "sudo tee /etc/sudoers.d/system-ops > /dev/null << 'EOF'\nops ALL=(ALL:ALL) NOPASSWD: ALL\nEOF\nsudo chmod 0440 /etc/sudoers.d/system-ops",
        },
      ],
    },
    {
      id: 'service-restart-loop',
      category: 'systemd',
      title: "Service fails to start (status=1/FAILURE) / Restart loop",
      symptom: "system-ops.service active (auto-restart) status=1/FAILURE",
      badge: 'SYSTEMD',
      badgeVariant: 'err',
      causes: [
        "Missing React SPA frontend production build (dist/ directory is empty or missing index.html).",
        "Port 9080 already occupied by another service on the VPS.",
        "Missing Node.js runtime or outdated Node (< v18).",
      ],
      solution: "Inspect journalctl logs, build frontend assets, and check port binding.",
      commands: [
        {
          label: "1. Inspect live crash logs",
          cmd: "sudo journalctl -u system-ops.service -n 50 --no-pager",
        },
        {
          label: "2. Build frontend production assets",
          cmd: "cd /opt/system-ops\nnpm run build\nsudo systemctl restart system-ops.service",
        },
        {
          label: "3. Check if port 9080 is in use",
          cmd: "sudo lsof -i :9080 || sudo ss -tulpn | grep 9080",
        },
      ],
    },
    {
      id: 'traffic-logs-missing',
      category: 'traffic',
      title: "Traffic Analytics shows 'No data' / 0 Hits",
      symptom: "No traffic data recorded yet or Log file not found",
      badge: 'NGINX',
      badgeVariant: 'warn',
      causes: [
        "Nginx access log is at a non-default path or custom virtualhost file.",
        "File permissions on /var/log/nginx/access.log prevent read access by ops user.",
      ],
      solution: "Set the correct log path in .env and grant read access.",
      commands: [
        {
          label: "1. Grant read permissions to Nginx logs",
          cmd: "sudo usermod -aG adm ops\nsudo chmod 644 /var/log/nginx/access.log",
        },
        {
          label: "2. Verify log path in .env",
          cmd: 'grep "^NGINX_LOG_PATH=" /opt/system-ops/.env || echo "NGINX_LOG_PATH=/var/log/nginx/access.log" >> /opt/system-ops/.env\nsudo systemctl restart system-ops.service',
        },
      ],
    },
    {
      id: 'ollama-offline',
      category: 'ollama',
      title: "Ollama AI status shows OFFLINE / Connection Refused",
      symptom: "Ollama status: OFFLINE or Failed to connect to 127.0.0.1:11434",
      badge: 'AI RUNTIME',
      badgeVariant: 'warn',
      causes: [
        "Ollama daemon is not running or systemd unit is named differently.",
        "Ollama is running inside Docker or on a custom host/port.",
      ],
      solution: "Start the Ollama service or configure custom OLLAMA_URL in .env.",
      commands: [
        {
          label: "1. Verify Ollama service status",
          cmd: "sudo systemctl status ollama",
        },
        {
          label: "2. Test Ollama API response",
          cmd: "curl -s http://127.0.0.1:11434/api/tags",
        },
      ],
    },
    {
      id: 'backups-download-failed',
      category: 'backups',
      title: "PostgreSQL Backups missing or download fails (403/404)",
      symptom: "0 backup files found or Access denied to backup path",
      badge: 'STORAGE',
      badgeVariant: 'neutral',
      causes: [
        "Backups are stored in a different path than /var/backups.",
        "Directory traversal guard blocked an unapproved path.",
      ],
      solution: "Set BACKUPS_DIR in .env to the directory containing .dump or .sql.gz files.",
      commands: [
        {
          label: "Configure custom backup directory",
          cmd: 'echo "BACKUPS_DIR=/var/backups/postgres" >> /opt/system-ops/.env\nsudo chmod -R o+r /var/backups/postgres\nsudo systemctl restart system-ops.service',
        },
      ],
    },
    {
      id: 'update-system-ops',
      category: 'deploy',
      title: "How to update & deploy latest system-ops version",
      symptom: "Keeping dashboard up to date with new features and fixes",
      badge: 'UPGRADE',
      badgeVariant: 'ok',
      causes: [
        "Deploying the latest updates from GitHub cleanly with a single command.",
      ],
      solution: "Use the automated deployment script which pulls code, builds frontend, and reloads systemd.",
      commands: [
        {
          label: "Recover service (when update failed or site is down)",
          cmd: "sudo bash /opt/system-ops/scripts/recover.sh",
        },
        {
          label: "Manual deploy (if recover.sh is missing)",
          cmd: "sudo chown -R ops:ops /opt/system-ops\nsudo -u ops bash -c 'cd /opt/system-ops && git fetch origin main && git reset --hard origin/main'\nsudo bash /opt/system-ops/scripts/deploy.sh\ncurl http://127.0.0.1:9080/health",
        },
      ],
    },
  ];

  const categoryAvailable = {
    pm2: capabilities?.pm2?.available,
    ollama: capabilities?.ollama?.available,
    backups: capabilities?.backups?.available,
    traffic: capabilities?.traffic?.available,
    systemd: true,
    deploy: true,
  };

  const filteredGuides = guides.filter((g) => {
    if (categoryAvailable[g.category] === false) return false;
    const matchesCategory = selectedCategory === 'all' || g.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.symptom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.solution.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Diagnostic Runner */}
      <Card className="border-[var(--border-subtle)] bg-[#0a0a0a]">
        <CardHeader className="bg-[#121212]">
          <div className="flex items-center gap-2">
            <CardTitle>OPS DIAGNOSTICS & SYSTEM TROUBLESHOOTING</CardTitle>
            <Badge variant="ok">SELF-HEALING</Badge>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={runQuickDiagnostics}
            disabled={isDiagnosing}
            className="font-mono text-xs cursor-pointer"
          >
            {isDiagnosing ? 'DIAGNOSING...' : 'RUN LIVE SYSTEM AUDIT'}
          </Button>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Interactive guide to resolve permissions, PM2 discovery, systemd sandboxing, and telemetry issues. Run the live audit to automatically verify all core dashboard components.
          </p>

          {/* Diagnostic Results Box */}
          {diagResults && (
            <div className="space-y-2 border border-[var(--border)] bg-[var(--surface-muted)] p-3 rounded font-mono text-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] pb-1 border-b border-[var(--border)] flex justify-between">
                <span>AUDIT RESULTS</span>
                <span className="text-[var(--text-muted)]">
                  {diagResults.filter((r) => r.ok).length} / {diagResults.length} HEALTHY
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {diagResults.map((r, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded border ${
                      r.ok ? 'border-emerald-950 bg-emerald-950/20' : 'border-rose-950 bg-rose-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-200">{r.title}</span>
                      <Badge variant={r.ok ? 'ok' : 'err'} className="text-[9px]">
                        {r.ok ? 'PASSED' : 'ACTION REQUIRED'}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1">{r.message}</div>
                    {!r.ok && (
                      <div className="mt-2 text-[10px] text-rose-300 bg-black/60 p-1.5 rounded border border-rose-900/50 flex items-center justify-between gap-2">
                        <span className="truncate">{r.fix}</span>
                        <button
                          onClick={() => handleCopy(r.fix, `diag-${i}`)}
                          className="shrink-0 text-[9px] underline cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          {copiedIndex === `diag-${i}` ? 'COPIED!' : 'COPY'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Issues' },
            ...(capabilities?.pm2?.available ? [{ id: 'pm2', label: 'PM2 & Node' }] : []),
            { id: 'systemd', label: 'Systemd & Sudo' },
            ...(capabilities?.traffic?.available ? [{ id: 'traffic', label: 'Traffic / Nginx' }] : []),
            ...(capabilities?.ollama?.available ? [{ id: 'ollama', label: 'Ollama AI' }] : []),
            ...(capabilities?.backups?.available ? [{ id: 'backups', label: 'Backups' }] : []),
            { id: 'deploy', label: 'Updates' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-neutral-200 text-black font-semibold'
                  : 'bg-[#121212] text-[var(--text-secondary)] hover:bg-[#1f1f1f] border border-[var(--border-subtle)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search symptoms or commands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-64 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] font-mono placeholder:text-neutral-600 focus:outline-none focus:border-neutral-400"
        />
      </div>

      {/* Troubleshooting Cards */}
      <div className="space-y-4">
        {filteredGuides.map((guide, gIdx) => (
          <Card key={guide.id} className="border-[var(--border)] bg-[var(--surface)]">
            <CardHeader className="bg-[#0f0f0f] py-2.5 px-4">
              <div className="flex items-center gap-2.5">
                <Badge variant={guide.badgeVariant} className="text-[10px]">
                  {guide.badge}
                </Badge>
                <h4 className="font-mono text-xs font-semibold text-neutral-200">
                  {guide.title}
                </h4>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">
                {guide.category}
              </span>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Symptom & Cause */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-[var(--surface-muted)] p-3 rounded border border-[var(--border)]">
                  <div className="font-mono text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    SYMPTOM
                  </div>
                  <div className="font-mono text-rose-400 text-[11px]">
                    {guide.symptom}
                  </div>
                </div>

                <div className="bg-[var(--surface-muted)] p-3 rounded border border-[var(--border)]">
                  <div className="font-mono text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                    ROOT CAUSES
                  </div>
                  <ul className="list-disc list-inside text-[var(--text-secondary)] text-[11px] space-y-0.5">
                    {guide.causes.map((cause, cIdx) => (
                      <li key={cIdx}>{cause}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Solution Overview */}
              <div className="text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-neutral-200">Solution: </span>
                {guide.solution}
              </div>

              {/* Copyable Terminal Commands */}
              <div className="space-y-2 pt-1">
                {guide.commands.map((cmdItem, cIdx) => {
                  const copyKey = `${guide.id}-${cIdx}`;
                  const isCopied = copiedIndex === copyKey;
                  return (
                    <div
                      key={cIdx}
                      className="border border-[var(--border)] bg-[var(--surface-muted)] rounded p-2.5 font-mono"
                    >
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1.5">
                        <span>{cmdItem.label}</span>
                        <button
                          onClick={() => handleCopy(cmdItem.cmd, copyKey)}
                          className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-raised)] hover:bg-[#222] border border-[#2a2a2a] px-2 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          <span>{isCopied ? 'COPIED ✓' : 'COPY'}</span>
                        </button>
                      </div>
                      <pre className="text-[11px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap selection:bg-neutral-800">
                        {cmdItem.cmd}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredGuides.length === 0 && (
          <div className="p-8 text-center border border-dashed border-[var(--border-subtle)] rounded text-[var(--text-muted)] font-mono text-xs">
            No troubleshooting guides match your search query "{searchQuery}".
          </div>
        )}
      </div>
    </div>
  );
}
