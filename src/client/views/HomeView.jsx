import React from 'react';
import { Sparkline } from '../components/ui/Sparkline';
import { cn } from '../lib/utils';

function StatusDot({ status }) {
  const cls =
    status === 'ok' ? 'status-dot-ok' : status === 'warn' ? 'status-dot-warn' : status === 'err' ? 'status-dot-err' : 'status-dot-off';
  return <span className={cn('status-dot', cls)} />;
}

export function HomeView({
  systemData,
  capabilities,
  dockerData,
  pm2Count,
  servicesData,
  trafficData,
  securityData,
  monixData,
  osUpdatesData,
  cpuHistory,
  ramHistory,
  onNavigate,
}) {
  const upt = systemData?.uptime || {};
  const mem = systemData?.memory || {};
  const load1 = parseFloat(upt.load1m) || 0;
  const memPct = mem.usagePercent || 0;
  const failedServices = (systemData?.services || []).filter((s) => !s.isActive).length;
  const pendingUpdates = osUpdatesData?.pendingCount || 0;

  const tiles = [];

  if (capabilities?.docker?.available) {
    tiles.push({
      id: 'workloads',
      sub: 'docker',
      title: 'Docker',
      value: dockerData?.running ?? '—',
      suffix: 'running',
      status: dockerData?.daemonReachable ? 'ok' : 'err',
    });
  }
  if (capabilities?.pm2?.available) {
    tiles.push({
      id: 'workloads',
      sub: 'pm2',
      title: 'PM2',
      value: pm2Count ?? '—',
      suffix: 'apps',
      status: pm2Count > 0 ? 'ok' : 'off',
    });
  }
  if (capabilities?.systemd?.available !== false) {
    tiles.push({
      id: 'workloads',
      sub: 'services',
      title: 'Services',
      value: servicesData?.activeCount ?? '—',
      suffix: 'active',
      status: failedServices > 0 ? 'warn' : 'ok',
    });
  }
  if (capabilities?.traffic?.available) {
    tiles.push({
      id: 'traffic',
      title: 'Traffic',
      value: trafficData?.summary?.total_hits ?? '—',
      suffix: 'hits',
      status: 'ok',
    });
  }
  if (capabilities?.security?.available || capabilities?.certbot?.available) {
    const banned = securityData?.fail2ban?.totalBanned ?? 0;
    tiles.push({
      id: 'security',
      title: 'Security',
      value: banned,
      suffix: 'banned IPs',
      status: banned > 0 ? 'warn' : 'ok',
    });
  }
  if (capabilities?.monix?.configured) {
    tiles.push({
      id: 'monix',
      title: 'Monix',
      value: monixData?.downCount ?? 0,
      suffix: 'down',
      status: (monixData?.downCount || 0) > 0 ? 'err' : 'ok',
    });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {upt.hostname || 'Server'}
        </h1>
        <p className="text-[var(--fg-muted)] text-sm md:text-base">
          Uptime {upt.uptimeText || '—'} · Load {load1.toFixed(2)} · {upt.cpus || '?'} cores
          {pendingUpdates > 0 && (
            <span className="text-[var(--caution)]"> · {pendingUpdates} OS updates pending</span>
          )}
        </p>
      </header>

      <div className="bento">
        <div className="bento-span-4 panel p-5 space-y-4">
          <div className="stat-label">CPU load</div>
          <div className="stat-value">{load1.toFixed(2)}</div>
          <Sparkline data={cpuHistory} strokeColor="var(--fg-muted)" height={48} />
        </div>
        <div className="bento-span-4 panel p-5 space-y-4">
          <div className="stat-label">Memory</div>
          <div className="stat-value">{memPct}%</div>
          <div className="text-sm text-[var(--fg-muted)]">{mem.formattedUsed} of {mem.formattedTotal}</div>
          <Sparkline data={ramHistory} strokeColor="var(--fg-faint)" height={48} />
        </div>
        <div className="bento-span-4 panel p-5 flex flex-col justify-between">
          <div className="stat-label">Quick actions</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" className="tile-link !p-3 text-sm" onClick={() => onNavigate('host')}>
              Host metrics
            </button>
            <button type="button" className="tile-link !p-3 text-sm" onClick={() => onNavigate('host', 'processes')}>
              Processes
            </button>
            <button type="button" className="tile-link !p-3 text-sm" onClick={() => onNavigate('workloads', 'services')}>
              Service logs
            </button>
            <button type="button" className="tile-link !p-3 text-sm" onClick={() => onNavigate('integrations')}>
              Setup guides
            </button>
          </div>
        </div>

        {tiles.length > 0 && (
          <div className="bento-span-12">
            <h2 className="text-sm font-medium text-[var(--fg-muted)] mb-3">Infrastructure</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <button
                  key={tile.title}
                  type="button"
                  className="tile-link flex items-start justify-between gap-3"
                  onClick={() => onNavigate(tile.id, tile.sub)}
                >
                  <div>
                    <div className="text-sm text-[var(--fg-muted)]">{tile.title}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-tight">{tile.value}</span>
                      <span className="text-sm text-[var(--fg-faint)]">{tile.suffix}</span>
                    </div>
                  </div>
                  <StatusDot status={tile.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {(systemData?.services || []).length > 0 && (
          <div className="bento-span-12 panel overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)] flex justify-between items-center">
              <h2 className="font-medium">Monitored services</h2>
              <button
                type="button"
                className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => onNavigate('workloads', 'services')}
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {(systemData.services || []).slice(0, 6).map((s, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusDot status={s.isActive ? 'ok' : 'err'} />
                    <span className="truncate font-medium">{s.fullUnit}</span>
                  </div>
                  <span className="text-[var(--fg-muted)] shrink-0 ml-2">{s.formattedMemory || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
