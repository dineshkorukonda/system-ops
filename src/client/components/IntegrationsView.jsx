import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

const GUIDES = [
  {
    id: 'docker',
    name: 'Docker',
    description: 'Monitor containers, networks, resource usage, and live logs.',
    capKey: 'docker',
    setupSteps: [
      'Install Docker: curl -fsSL https://get.docker.com | sh',
      'Add ops user: sudo usermod -aG docker ops',
      'Restart: sudo systemctl restart system-ops.service',
      'Verify: sudo bash /opt/system-ops/scripts/debug-docker.sh',
    ],
    envVars: ['DOCKER_USE_SUDO=true'],
  },
  {
    id: 'pm2',
    name: 'PM2 Fleet',
    description: 'Monitor Node.js apps managed by PM2 across system users.',
    capKey: 'pm2',
    setupSteps: [
      'Install PM2: npm install -g pm2',
      'Start apps: pm2 start app.js && pm2 save',
      'Set users in .env: PM2_USERS=root (only users with PM2)',
      'Configure /etc/system-ops/pm2-monitor.conf for cross-user monitoring (see docs/PM2-MONITORING.md).',
      'Verify: sudo bash /opt/system-ops/scripts/debug-pm2.sh',
    ],
    envVars: ['PM2_USERS=root', 'PM2_PATH_ROOT=/path/to/pm2'],
  },
  {
    id: 'ollama',
    name: 'Ollama AI',
    description: 'Monitor local LLM runtime, models, and inference health.',
    capKey: 'ollama',
    setupSteps: [
      'Install: curl -fsSL https://ollama.com/install.sh | sh',
      'Start: sudo systemctl enable --now ollama',
      'Pull model: ollama pull llama3.2',
      'Enable in .env: ENABLE_OLLAMA=true',
    ],
    envVars: ['ENABLE_OLLAMA=true', 'OLLAMA_URL=http://127.0.0.1:11434'],
  },
  {
    id: 'backups',
    name: 'Backups & Dumps',
    description: 'Track backup logs and downloadable dump files.',
    capKey: 'backups',
    setupSteps: [
      'Create dir: sudo mkdir -p /var/backups/postgres',
      'Set .env: BACKUPS_DIR=/var/backups/postgres',
      'Configure logs: LOG_SOURCES=pg-backup:file:/var/backups/postgres/logs/backup.log:200',
      'Grant access: sudo chmod -R o+r /var/backups/postgres',
    ],
    envVars: ['BACKUPS_DIR=/var/backups/postgres'],
  },
  {
    id: 'traffic',
    name: 'Traffic Analytics',
    description: 'GeoIP visitor map and per-domain traffic from Nginx logs.',
    capKey: 'traffic',
    setupSteps: [
      'Ensure Nginx is installed and logging access',
      'Grant log read: sudo usermod -aG adm ops',
      'Set .env: NGINX_LOG_PATH=/var/log/nginx/access.log',
      'Domains auto-discover from Nginx when TRACKED_DOMAINS is empty',
    ],
    envVars: ['NGINX_LOG_PATH=/var/log/nginx/access.log'],
  },
  {
    id: 'databases',
    name: 'Database Health',
    description: 'Monitor PostgreSQL, Redis, and MySQL listeners on standard ports.',
    capKey: 'databases',
    setupSteps: [
      'Ensure database services listen on localhost (5432, 6379, 3306)',
      'Optional custom ports: POSTGRES_PORT, REDIS_PORT, MYSQL_PORT in .env',
      'Install client tools for richer stats: postgresql-client, redis-tools, mysql-client',
    ],
    envVars: ['POSTGRES_PORT=5432', 'REDIS_PORT=6379', 'MYSQL_PORT=3306'],
  },
  {
    id: 'security',
    name: 'Security (UFW & Fail2ban)',
    description: 'Firewall rule summary and fail2ban jail status.',
    capKey: 'security',
    setupSteps: [
      'Install: sudo apt install ufw fail2ban',
      'Enable UFW: sudo ufw enable',
      'Grant passwordless sudo for ops user (see Troubleshooting)',
    ],
    envVars: [],
  },
  {
    id: 'certbot',
    name: 'Certbot / Let\'s Encrypt',
    description: 'Certificate inventory and auto-renew timer status.',
    capKey: 'certbot',
    setupSteps: [
      'Install: sudo apt install certbot python3-certbot-nginx',
      'Issue cert: sudo certbot --nginx -d yourdomain.com',
      'Enable timer: sudo systemctl enable --now certbot.timer',
      'TLS on System Health uses live HTTPS probes (works with Cloudflare too)',
    ],
    envVars: ['TLS_HOSTS=ops.example.com,app.example.com'],
  },
];

export function IntegrationsView({ capabilities, onNavigate, onChanged }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [enabled, setEnabled] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v2/settings', { signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error('Unable to load integration settings');
      setEnabled((await res.json()).integrations || {});
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, []);
  const toggle = async name => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations: { [name]: !enabled[name] } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.join(', ') || 'Unable to save integration');
      setEnabled(data.settings.integrations);
      await onChanged?.();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const installed = GUIDES.filter((g) => capabilities?.[g.capKey]?.available);
  const notInstalled = GUIDES.filter((g) => !capabilities?.[g.capKey]?.available);

  return (
    <div className="space-y-6 max-w-4xl">
      <Card><CardHeader><CardTitle>Background monitoring</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">Enable the integrations you use. Monitoring continues when the dashboard is closed.</p>
          {error && <p role="alert" className="text-[var(--error)]">{error}</p>}
          {Object.entries(enabled).map(([name, checked]) => <label key={name} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={checked} disabled={saving} onChange={() => toggle(name)} />
            <span>{name === 'osUpdates' ? 'OS updates' : name}</span>
          </label>)}
        </CardContent>
      </Card>
      <div className="font-mono text-xs text-[var(--text-secondary)] leading-relaxed">
        Features are auto-detected on this VPS. Only installed integrations appear in the sidebar.
        Use the guides below to set up anything missing.
      </div>

      {installed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active on This Server</CardTitle>
            <Badge variant="ok">{installed.length} DETECTED</Badge>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            {installed.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-2 border-b border-[var(--border-color)] last:border-0">
                <div>
                  <span className="text-[var(--text-primary)] font-semibold">{g.name}</span>
                  <span className="text-[var(--text-muted)] ml-2">— detected</span>
                </div>
                {onNavigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate(g.id)}
                    className="font-mono text-[10px] h-7"
                  >
                    OPEN
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {notInstalled.length > 0 && (
        <div className="space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono">
            Available to Set Up
          </div>
          {notInstalled.map((guide, gIdx) => (
            <Card key={guide.id}>
              <CardHeader>
                <CardTitle>{guide.name}</CardTitle>
                <Badge variant="neutral">NOT DETECTED</Badge>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-xs">
                <p className="text-[var(--text-secondary)]">{guide.description}</p>

                <div>
                  <div className="text-[10px] uppercase text-[var(--text-muted)] mb-2">Setup Steps</div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[var(--text-secondary)]">
                    {guide.setupSteps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>

                {guide.envVars.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-[var(--text-muted)] mb-2">.env Configuration</div>
                    <div className="rounded border border-[var(--border-color)] bg-[var(--surface-muted)] p-3 space-y-1">
                      {guide.envVars.map((line, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <code className="text-[var(--success)]/90 text-xs">{line}</code>
                          <button
                            onClick={() => handleCopy(line, `${gIdx}-${i}`)}
                            className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
                          >
                            {copiedIdx === `${gIdx}-${i}` ? 'COPIED' : 'COPY'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notInstalled.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center font-mono text-xs text-[var(--text-secondary)]">
            All supported integrations are active on this server.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
