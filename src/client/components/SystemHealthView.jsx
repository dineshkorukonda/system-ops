import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkline } from './ui/Sparkline';
import { ProgressBar } from './ui/ProgressBar';

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

  return (
    <div className="space-y-6">
      {osUpdatesData?.available && osUpdatesData.pendingCount > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-sm font-medium text-white">
                {osUpdatesData.pendingCount} package update{osUpdatesData.pendingCount === 1 ? '' : 's'} pending
              </div>
              <div className="font-mono text-xs text-neutral-500 mt-1">
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
        {/* CPU Load Card */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                CPU Load (1m)
              </span>
              <Badge variant={load1 > (upt.cpus || 4) ? 'warn' : 'ok'}>
                {load1 > (upt.cpus || 4) ? 'HIGH LOAD' : 'NORMAL'}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-white">
                {load1.toFixed(2)}
              </div>
              <span className="font-mono text-xs text-neutral-500">
                {upt.cpus ? `${upt.cpus} Cores` : '--'}
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
              <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                RAM Utilization
              </span>
              <Badge variant={memPct > 85 ? 'err' : memPct > 65 ? 'warn' : 'ok'}>
                {memPct}%
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-white">
                {mem.formattedUsed || '0 B'}
              </div>
              <span className="font-mono text-xs text-neutral-500">
                of {mem.formattedTotal || '0 B'}
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
              <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                Swap Utilization
              </span>
              <Badge variant={swapPct > 50 ? 'err' : swapPct > 20 ? 'warn' : 'neutral'}>
                {swapPct}%
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-2xl font-bold tracking-tight text-white">
                {swap.formattedUsed || '0 B'}
              </div>
              <span className="font-mono text-xs text-neutral-500">
                of {swap.formattedTotal || '0 B'}
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
            <div className="flex justify-between py-1.5 border-b border-[#141414]">
              <span className="text-neutral-500">SYSTEM UPTIME</span>
              <span className="font-semibold text-neutral-200">{upt.uptimeText || '--'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#141414]">
              <span className="text-neutral-500">CPU CORES</span>
              <span>{upt.cpus || '--'} Cores</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-neutral-500">LOAD (1m / 5m / 15m)</span>
              <span>
                <strong className="text-emerald-400">{upt.load1m || '--'}</strong>{' / '}
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
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">RAM ACTIVE</span>
                <span>{mem.formattedUsed || '0 B'} / {mem.formattedTotal || '0 B'} ({memPct}%)</span>
              </div>
              <ProgressBar value={memPct} variant="auto" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-400">SWAP ACTIVE</span>
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
              <thead className="border-b border-[#1a1a1a] bg-[#0c0c0c] text-[10px] uppercase text-neutral-500 theme-header">
                <tr>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">State</th>
                  <th className="px-4 py-2.5">Memory</th>
                  <th className="px-4 py-2.5">PID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-neutral-500">
                      No systemd services monitored.
                    </td>
                  </tr>
                ) : (
                  services.map((s, idx) => (
                    <tr key={idx} className="hover:bg-[#0d0d0d]">
                      <td className="px-4 py-2 font-medium">{s.fullUnit}</td>
                      <td className="px-4 py-2">
                        <Badge variant={s.isActive ? 'ok' : 'err'}>
                          {(s.activeState || 'UNKNOWN').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-neutral-400">{s.formattedMemory || '--'}</td>
                      <td className="px-4 py-2 text-neutral-400">{s.pid || '--'}</td>
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
              <div className="text-center text-neutral-500">No disk mounts configured.</div>
            ) : (
              disk.map((d, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold">{d.path} {d.mountPoint && `(${d.mountPoint})`}</span>
                    <span className="text-neutral-400">
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
              <thead className="border-b border-[#1a1a1a] bg-[#0c0c0c] text-[10px] uppercase text-neutral-500 theme-header">
                <tr>
                  <th className="px-4 py-2.5">Service</th>
                  <th className="px-4 py-2.5">Socket</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {ports.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-neutral-500">
                      Checking ports...
                    </td>
                  </tr>
                ) : (
                  ports.map((p, idx) => (
                    <tr key={idx} className="hover:bg-[#0d0d0d]">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-neutral-400">{p.host}:{p.port}</td>
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
              <thead className="border-b border-[#1a1a1a] bg-[#0c0c0c] text-[10px] uppercase text-neutral-500 theme-header">
                <tr>
                  <th className="px-4 py-2.5">Hostname / Cert</th>
                  <th className="px-4 py-2.5">Valid Until</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {tls.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-neutral-500">
                      Checking certificates...
                    </td>
                  </tr>
                ) : (
                  tls.map((t, idx) => (
                    <tr key={idx} className="hover:bg-[#0d0d0d]">
                      <td className="px-4 py-2 font-medium">{t.target}</td>
                      <td className="px-4 py-2 text-neutral-400">{t.formattedValidTo || 'N/A'}</td>
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
