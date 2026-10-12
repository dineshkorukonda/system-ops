import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { ProgressBar } from './ui/ProgressBar';
import { CollectionStatus } from './CollectionStatus';

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

  const cpuPct = Number.isFinite(upt.cpuPercent) ? upt.cpuPercent : null;
  const memPct = Number.isFinite(mem.usagePercent) ? mem.usagePercent : null;
  const swapPct = Number.isFinite(swap.usagePercent) ? swap.usagePercent : null;

  return (
    <div className="space-y-6">
      <CollectionStatus collection={systemData?.collection} />
      {osUpdatesData?.available && osUpdatesData.pendingCount > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-sm font-medium text-[var(--text-primary)]">
                {osUpdatesData.pendingCount} package update{osUpdatesData.pendingCount === 1 ? '' : 's'} pending
              </div>
              <div className="font-mono text-xs text-[var(--text-muted)] mt-1">
                {osUpdatesData.securityHint ? 'Includes security updates' : 'Run apt upgrade when convenient'}
              </div>
            </div>
            <Badge variant={osUpdatesData.securityHint ? 'warn' : 'neutral'}>
              {osUpdatesData.securityHint ? 'Security' : 'Maintenance'}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* ─── Hero Telemetry Cards with Real-Time Sparklines ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU utilization is distinct from load average. */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                CPU Utilization
              </span>
              <Badge variant={cpuPct === null ? 'neutral' : cpuPct > 85 ? 'warn' : 'ok'}>
                {cpuPct === null ? 'NOT SAMPLED' : cpuPct > 85 ? 'HIGH' : 'NORMAL'}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {cpuPct === null ? '--' : `${cpuPct}%`}
              </div>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {upt.cpus ? `${upt.cpus} Cores · load ${upt.load1m ?? '--'}` : '--'}
              </span>
            </div>
            <div className="pt-2">
              <Sparkline data={cpuHistory} strokeColor="#10b981" />
            </div>
          </CardContent>
        </Card>

        {/* RAM Usage Card */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                RAM Utilization
              </span>
              <Badge variant={memPct === null ? 'neutral' : memPct > 85 ? 'err' : memPct > 65 ? 'warn' : 'ok'}>
                {memPct === null ? '--' : `${memPct}%`}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {mem.formattedUsed || '--'}
              </div>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                of {mem.formattedTotal || '--'}
              </span>
            </div>
            <div className="pt-2">
              <Sparkline data={ramHistory} strokeColor="#3b82f6" />
            </div>
          </CardContent>
        </Card>

        {/* Swap Usage Card */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                Swap Utilization
              </span>
              <Badge variant={swapPct > 50 ? 'err' : swapPct > 20 ? 'warn' : 'neutral'}>
                {swapPct === null ? '--' : `${swapPct}%`}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {swap.formattedUsed || '--'}
              </div>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                of {swap.formattedTotal || '--'}
              </span>
            </div>
            <div className="pt-2">
              <Sparkline data={swapHistory} strokeColor="#8b5cf6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Grid: Host Overview, Memory Progress, Services, Disks ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Host Uptime & Load Averages */}
        <Card>
          <CardHeader>
            <CardTitle>Host Uptime &amp; Load Averages</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 font-mono text-xs">
            <div className="flex justify-between py-1.5 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">SYSTEM UPTIME</span>
              <span className="font-semibold text-[var(--text-secondary)]">{upt.uptimeText || '--'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">CPU CORES</span>
              <span>{upt.cpus || '--'} Cores</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-[var(--text-muted)]">LOAD (1m / 5m / 15m)</span>
              <span>
                <strong className="text-[var(--success)]">{upt.load1m || '--'}</strong>{' / '}
                <span>{upt.load5m || '--'}</span>{' / '}
                <span>{upt.load15m || '--'}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Memory & Swap Active Meters */}
        <Card>
          <CardHeader>
            <CardTitle>Memory &amp; Swap Consumption</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4 font-mono text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">RAM ACTIVE</span>
                <span>{mem.formattedUsed || '0 B'} / {mem.formattedTotal || '0 B'} ({memPct}%)</span>
              </div>
              <ProgressBar value={memPct} variant="auto" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">SWAP ACTIVE</span>
                <span>{swap.formattedUsed || '0 B'} / {swap.formattedTotal || '0 B'} ({swapPct}%)</span>
              </div>
              <ProgressBar value={swapPct} variant="warn" />
            </div>
          </CardContent>
        </Card>

        {/* Key Systemd Services */}
        <Card>
          <CardHeader>
            <CardTitle>Systemd Services</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">Memory</th>
                  <th className="px-4 py-2.5">PID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-[var(--text-muted)]">
                      No systemd services monitored.
                    </td>
                  </tr>
                ) : (
                  services.map((s, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-4 py-2 font-medium">{s.fullUnit}</td>
                      <td className="px-4 py-2">
                        <Badge variant={s.isActive ? 'ok' : 'err'}>
                          {(s.activeState || 'UNKNOWN').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{s.formattedMemory || '--'}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{s.pid || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Disk Usage Mounts */}
        <Card>
          <CardHeader>
            <CardTitle>Storage Partitions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4 font-mono text-xs">
            {disk.length === 0 ? (
              <div className="text-center text-[var(--text-muted)]">No disk mounts configured.</div>
            ) : (
              disk.map((d, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{d.path} {d.mountPoint && `(${d.mountPoint})`}</span>
                    <span className="text-[var(--text-secondary)]">
                      {d.formattedUsed || 'N/A'} / {d.formattedTotal || 'N/A'} ({d.percent}%)
                    </span>
                  </div>
                  <ProgressBar value={d.percent} variant="auto" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Loopback Listening Ports */}
        <Card>
          <CardHeader>
            <CardTitle>Listening Loopback Ports</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-4 py-2.5">Service</th>
                  <th className="px-4 py-2.5">Socket</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {ports.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-[var(--text-muted)]">
                      Checking ports...
                    </td>
                  </tr>
                ) : (
                  ports.map((p, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{p.host}:{p.port}</td>
                      <td className="px-4 py-2">
                        <Badge variant={p.listening ? 'ok' : 'err'}>
                          {p.listening ? 'BOUND' : 'UNBOUND'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* TLS Certificates Expiry */}
        <Card>
          <CardHeader>
            <CardTitle>TLS Certificate Expiry</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
                <tr>
                  <th className="px-4 py-2.5">Hostname / Cert</th>
                  <th className="px-4 py-2.5">Valid Until</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {tls.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-[var(--text-muted)]">
                      Checking certificates...
                    </td>
                  </tr>
                ) : (
                  tls.map((t, idx) => (
                    <tr key={idx} className="hover:bg-[var(--card-bg)]">
                      <td className="px-4 py-2 font-medium">{t.target}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{t.formattedValidTo || 'N/A'}</td>
                      <td className="px-4 py-2">
                        <Badge variant={t.valid ? 'ok' : 'err'}>
                          {t.statusText || (t.valid ? 'VALID' : 'EXPIRED')}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
