import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { ProgressBar } from './ui/ProgressBar';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

export function SystemHealthView({
  systemData,
  osUpdatesData,
  cpuHistory = [],
  ramHistory = [],
  swapHistory = [],
}) {
  const upt = systemData?.uptime || {};
  const mem = systemData?.memory || {};
  const swap = systemData?.swap || {};
  const services = systemData?.services || [];
  const disk = systemData?.disk || [];
  const ports = systemData?.ports || [];
  const tls = systemData?.tls || [];

  const load1 = parseFloat(upt.load1m) || 0;
  const memPct = mem.usagePercent || 0;
  const swapPct = swap.usagePercent || 0;
  const cpuHigh = load1 > (upt.cpus || 4);

  return (
    <div className="space-y-6">
      {osUpdatesData?.available && osUpdatesData.pendingCount > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {osUpdatesData.pendingCount} package update{osUpdatesData.pendingCount === 1 ? '' : 's'} pending
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                {osUpdatesData.securityHint ? 'Includes security updates' : 'Run apt upgrade when convenient'}
              </div>
            </div>
            <Badge variant={osUpdatesData.securityHint ? 'warn' : 'neutral'}>
              {osUpdatesData.securityHint ? 'Security' : 'Maintenance'}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="ops-label">CPU load (1m)</span>
              <Badge variant={cpuHigh ? 'warn' : 'ok'}>{cpuHigh ? 'High' : 'Normal'}</Badge>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="ops-metric">{load1.toFixed(2)}</div>
              <span className="text-xs text-[var(--text-muted)] pb-1">
                {upt.cpus ? `${upt.cpus} cores` : '—'}
              </span>
            </div>
            <Sparkline data={cpuHistory} strokeColor="#22c55e" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="ops-label">Memory</span>
              <Badge variant={memPct > 85 ? 'err' : memPct > 65 ? 'warn' : 'ok'}>{memPct}%</Badge>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="ops-metric">{mem.formattedUsed || '0 B'}</div>
              <span className="text-xs text-[var(--text-muted)] pb-1">of {mem.formattedTotal || '0 B'}</span>
            </div>
            <Sparkline data={ramHistory} strokeColor="#3b82f6" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="ops-label">Swap</span>
              <Badge variant={swapPct > 50 ? 'err' : swapPct > 20 ? 'warn' : 'neutral'}>{swapPct}%</Badge>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="ops-metric">{swap.formattedUsed || '0 B'}</div>
              <span className="text-xs text-[var(--text-muted)] pb-1">of {swap.formattedTotal || '0 B'}</span>
            </div>
            <Sparkline data={swapHistory} strokeColor="#8b5cf6" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Host overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <div className="ops-divider-row">
              <span className="ops-row-label">Uptime</span>
              <span className="ops-row-value">{upt.uptimeText || '—'}</span>
            </div>
            <div className="ops-divider-row">
              <span className="ops-row-label">CPU cores</span>
              <span className="ops-row-value">{upt.cpus || '—'}</span>
            </div>
            <div className="ops-divider-row">
              <span className="ops-row-label">Load (1m / 5m / 15m)</span>
              <span className="ops-row-value">
                <span className="text-[var(--success)]">{upt.load1m || '—'}</span>
                {' / '}{upt.load5m || '—'}{' / '}{upt.load15m || '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memory & swap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="ops-row-label">RAM</span>
                <span className="ops-row-value">
                  {mem.formattedUsed || '0 B'} / {mem.formattedTotal || '0 B'} ({memPct}%)
                </span>
              </div>
              <ProgressBar value={memPct} variant="auto" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="ops-row-label">Swap</span>
                <span className="ops-row-value">
                  {swap.formattedUsed || '0 B'} / {swap.formattedTotal || '0 B'} ({swapPct}%)
                </span>
              </div>
              <ProgressBar value={swapPct} variant="warn" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Systemd services</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Unit</TableHeader>
                <TableHeader>State</TableHeader>
                <TableHeader>Memory</TableHeader>
                <TableHeader>PID</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {services.length === 0 ? (
                <TableEmpty colSpan={4}>No services configured for monitoring.</TableEmpty>
              ) : (
                services.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-[var(--text-primary)]">{s.fullUnit}</TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? 'ok' : 'err'}>{s.activeState || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell>{s.formattedMemory || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{s.pid || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {disk.length === 0 ? (
              <div className="ops-empty py-6">No disk mounts configured.</div>
            ) : (
              disk.map((d, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between text-xs gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {d.path}{d.mountPoint ? ` (${d.mountPoint})` : ''}
                    </span>
                    <span className="text-[var(--text-muted)] shrink-0">
                      {d.formattedUsed || 'N/A'} / {d.formattedTotal || 'N/A'} ({d.percent}%)
                    </span>
                  </div>
                  <ProgressBar value={d.percent} variant="auto" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Listening ports</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Service</TableHeader>
                <TableHeader>Address</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {ports.length === 0 ? (
                <TableEmpty colSpan={3}>Checking ports…</TableEmpty>
              ) : (
                ports.map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-[var(--text-primary)]">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.host}:{p.port}</TableCell>
                    <TableCell>
                      <Badge variant={p.listening ? 'ok' : 'err'}>
                        {p.listening ? 'Listening' : 'Not bound'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TLS certificates</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Hostname</TableHeader>
                <TableHeader>Expires</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {tls.length === 0 ? (
                <TableEmpty colSpan={3}>No domains configured — set TLS_HOSTS or nginx server_name</TableEmpty>
              ) : (
                tls.map((t, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="font-medium text-[var(--text-primary)]">{t.target}</div>
                      {t.issuer && (
                        <div className="text-[10px] text-[var(--text-muted)]">{t.issuer}</div>
                      )}
                      {t.source && (
                        <div className="text-[10px] text-[var(--text-muted)]">via {t.source}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.formattedValidTo || '—'}
                      {t.daysRemaining != null && t.valid && (
                        <div className="text-[10px] text-[var(--text-muted)]">{t.daysRemaining} days left</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.valid ? (t.daysRemaining <= 14 ? 'warn' : 'ok') : 'err'} className="max-w-[200px] truncate">
                        {t.valid ? 'Valid' : (t.statusText || 'Issue detected')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
