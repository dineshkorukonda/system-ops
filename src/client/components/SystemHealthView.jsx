import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { ProgressBar } from './ui/ProgressBar';
import { Icon } from './ui/Icon';
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
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'CPU UTILIZATION', value: cpuPct === null ? '--' : `${cpuPct}%`, detail: `${upt.cpus || '--'} cores / load ${upt.load1m ?? '--'}`, icon: 'processes', percent: cpuPct ?? 0, status: cpuPct === null ? 'Awaiting sample' : cpuPct > 85 ? 'High usage' : 'Normal', warning: cpuPct > 85 },
          { label: 'RAM USAGE', value: mem.formattedUsed || '--', detail: `${memPct ?? '--'}% of ${mem.formattedTotal || '--'}`, icon: 'services', percent: memPct, status: memPct === null ? 'Awaiting sample' : memPct > 85 ? 'High usage' : 'Allocated', warning: memPct > 85 },
          { label: 'DISK USAGE', value: disk[0]?.formattedUsed || '--', detail: `of ${disk[0]?.formattedTotal || '--'}`, icon: 'disk', percent: disk[0]?.percent || 0, status: Number.isFinite(disk[0]?.percent) ? `${disk[0].percent}% capacity` : 'Awaiting data', warning: disk[0]?.percent > 70 },
          { label: 'SYSTEM UPTIME', value: upt.uptimeText || '--', detail: upt.hostname || 'Server telemetry', icon: 'uptime', percent: upt.uptimeText ? 100 : 0, status: upt.uptimeText ? 'Live' : 'Awaiting sample' },
        ].map((metric) => <Card key={metric.label} className="ops-telemetry" style={{ '--meter': `${Math.max(0, Math.min(Number(metric.percent) || 0, 100))}%`, '--meter-color': metric.warning ? 'var(--warning)' : 'var(--accent)' }}>
          <CardContent>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-mono tracking-widest text-[var(--text-muted)] mb-2">{metric.label}</p><p className="text-[22px] font-bold tracking-tight leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{metric.value}</p></div><div className="ops-metric-icon shrink-0"><Icon name={metric.icon} /></div></div>
            <div className="flex items-center justify-between gap-2 mt-4 text-[10px] font-mono"><span className="text-[var(--text-muted)]">{metric.detail}</span><span className={metric.warning ? 'text-amber-400' : 'text-[var(--accent)]'}>{metric.status}</span></div>
          </CardContent>
        </Card>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>CPU Utilization Trends</CardTitle><p className="text-[11px] text-[var(--text-muted)] font-mono mt-1.5">Real-time utilization across {upt.cpus || '--'} CPU cores</p></div><Badge variant="ok">Live Feed</Badge></CardHeader>
          <CardContent><div className="min-h-28 flex items-center"><Sparkline data={cpuHistory} width={700} height={120} strokeColor="var(--accent)" /></div><div className="flex justify-between border-t border-[var(--border-color)] pt-3 mt-2 text-[10px] font-mono text-[var(--text-muted)]"><span>Previous {cpuHistory.length} samples</span><span>Now</span></div></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Memory Allocation</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><div className="flex justify-between text-xs font-mono"><span className="text-[var(--text-secondary)]">RAM</span><span className="text-[var(--accent)]">{memPct ?? '--'}%</span></div><ProgressBar value={memPct} variant="auto" /><p className="text-[10px] font-mono text-[var(--text-muted)]">{mem.formattedUsed || '--'} / {mem.formattedTotal || '--'}</p></div><div className="space-y-2"><div className="flex justify-between text-xs font-mono"><span className="text-[var(--text-secondary)]">SWAP</span><span className="text-[var(--accent)]">{swapPct ?? '--'}%</span></div><ProgressBar value={swapPct} variant="auto" /><p className="text-[10px] font-mono text-[var(--text-muted)]">{swap.formattedUsed || '--'} / {swap.formattedTotal || '--'}</p></div><div className="border-t border-[var(--border-color)] pt-4 font-mono text-[10px] text-[var(--text-muted)]">Resource usage from the latest server snapshot.</div></CardContent></Card>
      </div>

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
