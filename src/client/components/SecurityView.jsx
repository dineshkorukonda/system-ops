import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

function SummaryTile({ title, value, detail, variant = 'neutral' }) {
  return (
    <div className="rounded border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{title}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-white">{value}</span>
        <Badge variant={variant}>{variant === 'ok' ? 'OK' : variant === 'warn' ? 'CHECK' : '—'}</Badge>
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">{detail}</p>
    </div>
  );
}

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

function buildOverallSummary(ufw, fail2ban, certbotData, certs) {
  const issues = [];
  if (!ufw.active && ufw.available) issues.push('firewall is off');
  if (!ufw.available) issues.push('firewall not installed');
  if (!fail2ban.available) issues.push('login attack blocker not installed');

  if (issues.length === 0) {
    return {
      headline: 'Your server security basics look good',
      detail: 'Firewall and login protection are active. Review open ports and blocked IPs below.',
      variant: 'ok',
    };
  }

  return {
    headline: `${issues.length} item${issues.length === 1 ? '' : 's'} need attention`,
    detail: issues.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(' · '),
    variant: 'warn',
  };
}

export function SecurityView({ securityData, certbotData }) {
  const ufw = securityData?.ufw || {};
  const fail2ban = securityData?.fail2ban || {};
  const certs = certbotData?.certificates || [];
  const parsedRules = ufw.parsedRules || [];
  const overall = buildOverallSummary(ufw, fail2ban, certbotData, certs);
  const needsSetup = !ufw.available || !ufw.active || !fail2ban.available;

  const firewallDetail = ufw.summary
    || (ufw.available ? 'Firewall package found on this server.' : 'Install UFW to control which ports are open to the internet.');

  const fail2banDetail = fail2ban.summary
    || (fail2ban.available ? 'Fail2ban is installed.' : 'Fail2ban automatically blocks IPs that keep failing SSH login.');

  const sslDetail = certs.length > 0
    ? `${certs.length} SSL certificate${certs.length === 1 ? '' : 's'} managed on this server.`
    : certbotData?.installed
      ? 'Certbot is ready but no certificates here — OK if Cloudflare or another proxy handles HTTPS.'
      : 'No SSL certificates on this host.';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security at a glance</CardTitle>
          <Badge variant={overall.variant}>{overall.variant === 'ok' ? 'PROTECTED' : 'REVIEW'}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-base font-semibold text-white">{overall.headline}</div>
            <p className="text-sm text-neutral-400 mt-1 leading-relaxed">{overall.detail}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryTile
              title="Firewall (UFW)"
              value={ufw.active ? 'On' : ufw.available ? 'Off' : 'Missing'}
              detail={firewallDetail}
              variant={ufw.active ? 'ok' : 'warn'}
            />
            <SummaryTile
              title="Login attack blocker"
              value={fail2ban.available ? `${fail2ban.totalBanned || 0} blocked` : 'Missing'}
              detail={fail2banDetail}
              variant={fail2ban.available ? 'ok' : 'warn'}
            />
            <SummaryTile
              title="Website SSL"
              value={certs.length > 0 ? `${certs.length} cert${certs.length === 1 ? '' : 's'}` : certbotData?.installed ? 'None yet' : 'N/A'}
              detail={sslDetail}
              variant={certs.length > 0 ? 'ok' : 'neutral'}
            />
          </div>
        </CardContent>
      </Card>

      {needsSetup && (
        <Card>
          <CardHeader>
            <CardTitle>Quick setup</CardTitle>
            <Badge variant="warn">ACTION</Badge>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-xs">
            {!ufw.available && (
              <SetupSteps title="Install firewall" steps={['sudo apt install ufw', 'sudo ufw allow OpenSSH', 'sudo ufw enable']} />
            )}
            {ufw.available && !ufw.active && (
              <SetupSteps
                title="Turn on the firewall"
                steps={['sudo ufw allow OpenSSH', 'sudo ufw enable', 'sudo ufw status']}
              />
            )}
            {!fail2ban.available && (
              <SetupSteps
                title="Block brute-force SSH login attempts"
                steps={['sudo apt install fail2ban', 'sudo systemctl enable --now fail2ban']}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Firewall — what can reach this server?</CardTitle>
          <Badge variant={ufw.active ? 'ok' : 'warn'}>{ufw.active ? 'ON' : 'OFF'}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-neutral-400 text-xs leading-relaxed">
            The firewall decides which internet traffic is allowed in. When it is <strong className="text-neutral-200">ON</strong>,
            unknown incoming connections are blocked unless a port is listed below.
          </p>
          {ufw.incomingPolicy === 'block-by-default' && (
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300/90">
              Default rule: block strangers from connecting — only the ports below are open.
            </div>
          )}
          {parsedRules.filter((r) => r.port).length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>What it is for</TableHeader>
                  <TableHeader>Port</TableHeader>
                  <TableHeader>Access</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {parsedRules.filter((r) => r.port).map((rule, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{rule.label}</TableCell>
                    <TableCell className="font-mono text-xs text-neutral-400">{rule.port}</TableCell>
                    <TableCell>
                      <Badge variant={rule.allowed ? 'ok' : 'err'}>{rule.allowed ? 'Open' : 'Blocked'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : ufw.available ? (
            <div className="text-neutral-500 text-xs font-mono">No allow rules parsed — check sudo ufw status on the server.</div>
          ) : (
            <div className="text-neutral-500 text-xs">UFW not installed.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login attacks — who got blocked?</CardTitle>
          <Badge variant={fail2ban.totalBanned > 0 ? 'warn' : 'ok'}>
            {fail2ban.totalBanned || 0} IP{(fail2ban.totalBanned || 0) === 1 ? '' : 's'} blocked now
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-neutral-400 text-xs leading-relaxed">
            Fail2ban watches SSH login failures. If someone tries wrong passwords too many times,
            their IP address is temporarily banned. This is normal on any public VPS.
          </p>
          {!fail2ban.available ? (
            <div className="text-neutral-500 text-xs">Not installed — run: sudo apt install fail2ban</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                <div className="rounded bg-[#0a0a0a] border border-[#1a1a1a] p-3">
                  <div className="text-neutral-500 text-[10px] uppercase">Blocked now</div>
                  <div className="text-xl font-bold text-white mt-1">{fail2ban.totalBanned || 0}</div>
                </div>
                <div className="rounded bg-[#0a0a0a] border border-[#1a1a1a] p-3">
                  <div className="text-neutral-500 text-[10px] uppercase">Failed attempts</div>
                  <div className="text-xl font-bold text-white mt-1">{fail2ban.totalFailed || 0}</div>
                </div>
                <div className="rounded bg-[#0a0a0a] border border-[#1a1a1a] p-3">
                  <div className="text-neutral-500 text-[10px] uppercase">Monitors</div>
                  <div className="text-sm font-semibold text-white mt-1">SSH logins</div>
                </div>
                <div className="rounded bg-[#0a0a0a] border border-[#1a1a1a] p-3">
                  <div className="text-neutral-500 text-[10px] uppercase">Active jails</div>
                  <div className="text-xl font-bold text-white mt-1">{fail2ban.jailCount || 0}</div>
                </div>
              </div>
              {(fail2ban.bannedIps || []).length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Blocked IP addresses</div>
                  <div className="flex flex-wrap gap-2">
                    {fail2ban.bannedIps.map((ip) => (
                      <span key={ip} className="font-mono text-[11px] px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        {ip}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-neutral-500 text-xs">No IPs blocked right now — your server is not under active attack.</div>
              )}
              {(fail2ban.jails || []).length > 0 && (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Protection</TableHeader>
                      <TableHeader>Blocked</TableHeader>
                      <TableHeader>Recent failures</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fail2ban.jails.map((jail) => (
                      <TableRow key={jail.name}>
                        <TableCell>{jail.label || jail.name}</TableCell>
                        <TableCell>{jail.currentlyBanned}</TableCell>
                        <TableCell>{jail.currentlyFailed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {(certbotData?.installed || certs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Website SSL certificates</CardTitle>
            <Badge variant={certs.length > 0 ? 'ok' : 'neutral'}>
              {certbotData?.timerActive ? 'Auto-renew on' : 'Auto-renew off'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-neutral-400 text-xs leading-relaxed">
              SSL certificates encrypt traffic to your websites (the padlock in the browser).
              Only matters if this server handles HTTPS directly — skip if you use Cloudflare or another proxy.
            </p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Site name</TableHeader>
                  <TableHeader>Domains</TableHeader>
                  <TableHeader>Expires</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {certs.length === 0 ? (
                  <TableEmpty colSpan={4}>
                    No certificates on this server. Run: sudo certbot --nginx -d yourdomain.com
                  </TableEmpty>
                ) : (
                  certs.map((cert) => (
                    <TableRow key={cert.name}>
                      <TableCell className="font-medium">{cert.name}</TableCell>
                      <TableCell className="text-xs text-neutral-500">{(cert.domains || []).join(', ')}</TableCell>
                      <TableCell>{cert.formattedExpiry || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={cert.valid ? (cert.daysRemaining <= 14 ? 'warn' : 'ok') : 'err'}>
                          {cert.daysRemaining !== null ? `${cert.daysRemaining} days left` : 'Unknown'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
