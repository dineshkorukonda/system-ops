import React, { useState } from 'react';
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
      'Set binary path: PM2_PATH_ROOT=/usr/bin/pm2',
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
];

export function IntegrationsView({ capabilities, onNavigate }) {
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const installed = GUIDES.filter((g) => capabilities?.[g.capKey]?.available);
  const notInstalled = GUIDES.filter((g) => !capabilities?.[g.capKey]?.available);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="font-mono text-xs text-neutral-400 leading-relaxed">
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
              <div key={g.id} className="flex items-center justify-between py-2 border-b border-[#141414] last:border-0">
                <div>
                  <span className="text-white font-semibold">{g.name}</span>
                  <span className="text-neutral-500 ml-2">— detected</span>
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
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 font-mono">
            Available to Set Up
          </div>
          {notInstalled.map((guide, gIdx) => (
            <Card key={guide.id}>
              <CardHeader>
                <CardTitle>{guide.name}</CardTitle>
                <Badge variant="neutral">NOT DETECTED</Badge>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-xs">
                <p className="text-neutral-400">{guide.description}</p>

                <div>
                  <div className="text-[10px] uppercase text-neutral-500 mb-2">Setup Steps</div>
                  <ol className="list-decimal list-inside space-y-1.5 text-neutral-300">
                    {guide.setupSteps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>

                {guide.envVars.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-neutral-500 mb-2">.env Configuration</div>
                    <div className="rounded border border-[#1a1a1a] bg-[#050505] p-3 space-y-1">
                      {guide.envVars.map((line, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <code className="text-emerald-400/90 text-[11px]">{line}</code>
                          <button
                            onClick={() => handleCopy(line, `${gIdx}-${i}`)}
                            className="text-[9px] text-neutral-500 hover:text-white shrink-0 cursor-pointer"
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
          <CardContent className="p-6 text-center font-mono text-xs text-neutral-400">
            All supported integrations are active on this server.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
