import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

export function SecurityView({ securityData, certbotData }) {
  const ufw = securityData?.ufw || {};
  const fail2ban = securityData?.fail2ban || {};
  const certs = certbotData?.certificates || [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        Host firewall and intrusion-prevention status, plus Certbot-managed certificate inventory when installed.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>UFW Firewall</CardTitle>
            <Badge variant={ufw.active ? 'ok' : ufw.available ? 'warn' : 'neutral'}>
              {ufw.available ? (ufw.active ? 'Active' : 'Inactive') : 'Not installed'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ufw.available ? (
              <>
                {ufw.defaultPolicy && <div className="text-[var(--text-secondary)]">{ufw.defaultPolicy}</div>}
                <div className="text-[var(--text-muted)]">{ufw.ruleCount || 0} rule(s) loaded</div>
                {(ufw.rules || []).slice(0, 6).map((rule, i) => (
                  <div key={i} className="font-mono text-[11px] text-[var(--text-secondary)]">{rule}</div>
                ))}
              </>
            ) : (
              <div className="ops-empty text-sm">UFW not detected on this host.</div>
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
          <CardContent>
            {(fail2ban.jails || []).length === 0 ? (
              <div className="ops-empty text-sm">No fail2ban jails reported.</div>
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

      {certbotData?.installed && (
        <Card>
          <CardHeader>
            <CardTitle>Certbot certificates</CardTitle>
            <Badge variant={certbotData.timerActive ? 'ok' : 'warn'}>
              {certbotData.timerActive ? 'Auto-renew timer active' : 'Timer inactive'}
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
                <TableEmpty colSpan={4}>No certificates returned by certbot.</TableEmpty>
              ) : (
                certs.map((cert) => (
                  <TableRow key={cert.name}>
                    <TableCell className="font-medium">{cert.name}</TableCell>
                    <TableCell className="text-xs text-[var(--text-muted)]">{(cert.domains || []).join(', ')}</TableCell>
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
          <CardContent className="pt-0">
            <div className="text-[11px] text-[var(--text-muted)]">
              Dry-run renewal: <code className="text-[var(--accent)]">{certbotData.renewHint}</code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
