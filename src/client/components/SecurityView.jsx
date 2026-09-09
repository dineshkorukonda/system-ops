import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

function SetupSteps({ title, steps }) {
  return (
    <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">{title}</div>
      <ol className="list-decimal list-inside space-y-1 font-mono text-[11px] text-neutral-300 leading-relaxed">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export function SecurityView({ securityData, certbotData }) {
  const ufw = securityData?.ufw || {};
  const fail2ban = securityData?.fail2ban || {};
  const certs = certbotData?.certificates || [];
  const needsAttention = !ufw.active || !fail2ban.available || (certbotData?.installed && certs.length === 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400 leading-relaxed font-mono text-xs">
        Monitor firewall, intrusion prevention, and TLS certificates. Items shown here even when not fully
        configured — use the setup steps below or open <strong className="text-neutral-200">Integrations</strong> for full guides.
      </p>

      {needsAttention && (
        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <Badge variant="warn">ACTION NEEDED</Badge>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-xs">
            {!ufw.active && (
              <SetupSteps
                title={ufw.available ? 'Enable UFW firewall' : 'Install UFW'}
                steps={
                  ufw.available
                    ? [
                        'Review rules: sudo ufw status verbose',
                        'Allow SSH before enabling: sudo ufw allow OpenSSH',
                        'Enable: sudo ufw enable',
                      ]
                    : ['Install: sudo apt install ufw', 'Allow SSH, then: sudo ufw enable']
                }
              />
            )}
            {!fail2ban.available && (
              <SetupSteps
                title="Install Fail2ban"
                steps={[
                  'Install: sudo apt install fail2ban',
                  'Enable: sudo systemctl enable --now fail2ban',
                  'Check jails: sudo fail2ban-client status',
                ]}
              />
            )}
            {certbotData?.installed && certs.length === 0 && (
              <SetupSteps
                title="Issue Let's Encrypt certificates"
                steps={[
                  'Issue cert: sudo certbot --nginx -d yourdomain.com',
                  'Or run: sudo bash /opt/system-ops/scripts/setup-domain.sh',
                  'Timer is active — certificates will appear here once issued',
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>UFW Firewall</CardTitle>
            <Badge variant={ufw.active ? 'ok' : ufw.available ? 'warn' : 'neutral'}>
              {ufw.available ? (ufw.active ? 'Active' : 'Inactive') : 'Not installed'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono text-xs">
            {ufw.available ? (
              <>
                {ufw.defaultPolicy && <div className="text-neutral-300">{ufw.defaultPolicy}</div>}
                <div className="text-neutral-500">{ufw.ruleCount || 0} rule(s) loaded</div>
                {!ufw.active && (
                  <div className="text-amber-400/90 text-[11px] pt-1">
                    Installed but not enabled — traffic is not filtered yet.
                  </div>
                )}
                {(ufw.rules || []).slice(0, 6).map((rule, i) => (
                  <div key={i} className="text-[11px] text-neutral-400">{rule}</div>
                ))}
              </>
            ) : (
              <div className="text-neutral-500">UFW not detected. Install via apt to monitor firewall status here.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fail2ban</CardTitle>
            <Badge variant={fail2ban.active ? 'ok' : fail2ban.available ? 'warn' : 'neutral'}>
              {fail2ban.available ? `${fail2ban.jailCount || 0} jails` : 'Not installed'}
            </Badge>
          </CardHeader>
          <CardContent className="font-mono text-xs">
            {(fail2ban.jails || []).length === 0 ? (
              <div className="text-neutral-500 space-y-1">
                <div>No fail2ban jails reported.</div>
                {!fail2ban.available && (
                  <div className="text-amber-400/90 text-[11px]">
                    Install fail2ban to track banned IPs and brute-force protection.
                  </div>
                )}
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Jail</TableHeader>
                    <TableHeader>Banned</TableHeader>
                    <TableHeader>Failed</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fail2ban.jails.map((jail) => (
                    <TableRow key={jail.name}>
                      <TableCell>{jail.name}</TableCell>
                      <TableCell>{jail.currentlyBanned}</TableCell>
                      <TableCell>{jail.currentlyFailed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {(certbotData?.installed || certs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Certbot certificates</CardTitle>
            <Badge variant={certbotData?.timerActive ? 'ok' : 'warn'}>
              {certbotData?.timerActive ? 'Auto-renew timer active' : 'Timer inactive'}
            </Badge>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Domains</TableHeader>
                <TableHeader>Expires</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {certs.length === 0 ? (
                <TableEmpty colSpan={4}>
                  No certificates yet — certbot is installed but no certs have been issued on this host.
                </TableEmpty>
              ) : (
                certs.map((cert) => (
                  <TableRow key={cert.name}>
                    <TableCell className="font-medium">{cert.name}</TableCell>
                    <TableCell className="text-xs text-neutral-500">{(cert.domains || []).join(', ')}</TableCell>
                    <TableCell>{cert.formattedExpiry || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={cert.valid ? (cert.daysRemaining <= 14 ? 'warn' : 'ok') : 'err'}>
                        {cert.daysRemaining !== null ? `${cert.daysRemaining}d` : 'Unknown'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {certbotData?.renewHint && (
            <CardContent className="pt-0">
              <div className="text-[11px] text-neutral-500 font-mono">
                Dry-run renewal: <code className="text-emerald-400/90">{certbotData.renewHint}</code>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
