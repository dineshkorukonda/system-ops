import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Sparkline } from '../components/ui/Sparkline';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Separator } from '../components/ui/Separator';
import { cn } from '../lib/utils';

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
    { label: 'System health', tab: 'system', color: 'text-primary' },
    { label: 'Processes', tab: 'processes', color: 'text-info' },
    capabilities?.docker?.available && { label: 'Docker', tab: 'docker', color: 'text-info' },
    capabilities?.services?.available !== false && { label: 'Services', tab: 'services', color: 'text-success' },
    capabilities?.traffic?.available && { label: 'Traffic', tab: 'traffic', color: 'text-warning' },
    { label: 'Settings', tab: 'settings', color: 'text-muted-foreground' },
  ].filter(Boolean);

  const loadTone = load1 >= 2 ? 'text-destructive' : load1 >= 1 ? 'text-warning' : 'text-success';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{upt.hostname || 'Server'}</h2>
          <p className="text-muted-foreground mt-1">
            Uptime {upt.uptimeText || '—'} · Load{' '}
            <span className={cn('font-medium', loadTone)}>{load1.toFixed(2)}</span>
          </p>
        </div>
        {pending > 0 && (
          <Badge variant="warn">{pending} OS updates pending</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary">CPU load (1m)</CardDescription>
            <CardTitle className={cn('text-3xl font-semibold tabular-nums', loadTone)}>
              {load1.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline data={cpuHistory} color="primary" />
          </CardContent>
        </Card>

        <Card className="border-info/20 bg-info/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-info">Memory</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums text-info">
              {memPct}%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{mem.formattedUsed} / {mem.formattedTotal}</p>
            <ProgressBar value={memPct} />
            <Sparkline data={ramHistory} color="primary" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>At a glance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {capabilities?.docker?.available && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Docker</span>
                <Badge variant="blue">{dockerData?.running ?? '—'} running</Badge>
              </div>
            )}
            {capabilities?.pm2?.available && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">PM2</span>
                <Badge variant="secondary">{pm2Count ?? '—'} apps</Badge>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Services</span>
              <Badge variant="ok">{servicesData?.activeCount ?? '—'} active</Badge>
            </div>
            {capabilities?.traffic?.available && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Traffic</span>
                <span className="font-medium text-warning">{trafficData?.summary?.total_hits ?? '—'} hits</span>
              </div>
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
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-primary/10 hover:border-primary/30 transition-colors text-left"
              >
                <span className={s.color}>{s.label}</span>
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
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => onNavigate('services')}>
              View all
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {(systemData.services || []).slice(0, 5).map((s, i) => {
              const isActive = s.activeState === 'active';
              return (
                <div key={i}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between px-6 py-3 text-sm">
                    <span className="font-medium">{s.fullUnit}</span>
                    <Badge variant={isActive ? 'ok' : 'err'}>
                      {s.activeState || 'unknown'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
