import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Sparkline } from '../components/ui/Sparkline';
import { Separator } from '../components/ui/Separator';

export function HomeView({
  systemData,
  capabilities,
  dockerData,
  pm2Count,
  servicesData,
  trafficData,
  osUpdatesData,
  cpuHistory,
  ramHistory,
  onNavigate,
}) {
  const upt = systemData?.uptime || {};
  const mem = systemData?.memory || {};
  const load1 = parseFloat(upt.load1m) || 0;
  const memPct = mem.usagePercent || 0;
  const pending = osUpdatesData?.pendingCount || 0;

  const shortcuts = [
    { label: 'System health', tab: 'system' },
    { label: 'Processes', tab: 'processes' },
    capabilities?.docker?.available && { label: 'Docker', tab: 'docker' },
    capabilities?.services?.available !== false && { label: 'Services', tab: 'services' },
    capabilities?.traffic?.available && { label: 'Traffic', tab: 'traffic' },
    { label: 'Settings', tab: 'settings' },
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{upt.hostname || 'Server'}</h2>
        <p className="text-muted-foreground mt-1">
          Uptime {upt.uptimeText || '—'} · Load {load1.toFixed(2)}
          {pending > 0 && ` · ${pending} OS updates pending`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CPU load (1m)</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">{load1.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline data={cpuHistory} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Memory</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">{memPct}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">{mem.formattedUsed} / {mem.formattedTotal}</p>
            <Sparkline data={ramHistory} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>At a glance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {capabilities?.docker?.available && (
              <div className="flex justify-between"><span className="text-muted-foreground">Docker</span><span>{dockerData?.running ?? '—'} running</span></div>
            )}
            {capabilities?.pm2?.available && (
              <div className="flex justify-between"><span className="text-muted-foreground">PM2</span><span>{pm2Count ?? '—'} apps</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Services</span><span>{servicesData?.activeCount ?? '—'} active</span></div>
            {capabilities?.traffic?.available && (
              <div className="flex justify-between"><span className="text-muted-foreground">Traffic</span><span>{trafficData?.summary?.total_hits ?? '—'} hits</span></div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick navigation</CardTitle>
          <CardDescription>Jump to any section</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {shortcuts.map((s) => (
              <button
                key={s.tab}
                type="button"
                onClick={() => onNavigate(s.tab)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors text-left"
              >
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {(systemData?.services || []).length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Services</CardTitle>
              <CardDescription>Monitored systemd units</CardDescription>
            </div>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => onNavigate('services')}>
              View all
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {(systemData.services || []).slice(0, 5).map((s, i) => (
              <div key={i}>
                {i > 0 && <Separator />}
                <div className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="font-medium">{s.fullUnit}</span>
                  <span className="text-muted-foreground">{s.activeState || 'unknown'}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
