import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

export function MonixView({ monixData }) {
  const sites = monixData?.sites || [];
  const baseUrl = monixData?.baseUrl;

  if (!monixData?.configured) {
    return (
      <Card>
        <CardContent className="ops-empty">
          Connect Monix uptime monitoring by setting MONIX_URL and MONIX_STATUS_SLUGS in .env
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
          External uptime, response time, and certificate telemetry from your Monix instance.
          Checks run every 5 minutes on Monix — this dashboard mirrors the latest status.
        </p>
        {baseUrl && (
          <a
            href={baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-lg border border-[var(--border-subtle)] px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
          >
            Open Monix
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="ops-label">Sites</div><div className="ops-metric">{monixData.siteCount || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="ops-label">Down</div><div className="ops-metric text-red-400">{monixData.downCount || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="ops-label">Cert warnings</div><div className="ops-metric text-amber-400">{monixData.degradedCount || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="ops-label">Source</div><div className="text-xs text-[var(--text-muted)] mt-2 truncate">{baseUrl?.replace(/^https?:\/\//, '')}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitored endpoints</CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Site</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Response</TableHeader>
              <TableHeader>24h uptime</TableHeader>
              <TableHeader>TLS</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sites.length === 0 ? (
              <TableEmpty colSpan={6}>
                {monixData.hint || 'No Monix status pages matched. Check MONIX_STATUS_SLUGS.'}
              </TableEmpty>
            ) : (
              sites.map((site) => (
                <TableRow key={site.slug}>
                  <TableCell>
                    <div className="font-medium text-[var(--text-primary)]">{site.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{site.url}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={site.status === 'up' ? 'ok' : site.status === 'down' ? 'err' : 'neutral'}>
                      {site.status || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {site.responseTimeMs != null ? `${site.responseTimeMs}ms` : '—'}
                    {site.statusCode ? ` · ${site.statusCode}` : ''}
                  </TableCell>
                  <TableCell>{site.uptime24h != null ? `${site.uptime24h}%` : '—'}</TableCell>
                  <TableCell>
                    {site.certDaysRemaining != null ? (
                      <Badge variant={site.certWarning ? 'warn' : 'ok'}>{site.certDaysRemaining}d</Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {site.statusPageUrl && (
                      <a href={site.statusPageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline">
                        Status
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
