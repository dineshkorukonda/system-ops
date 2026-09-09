import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

const ENGINE_LABELS = {
  postgresql: 'PostgreSQL',
  redis: 'Redis',
  mysql: 'MySQL / MariaDB',
};

export function DatabasesView({ databaseData }) {
  const engines = databaseData?.engines || {};
  const rows = Object.values(engines).filter((e) => e.available);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        Local database engines detected on this host via port probes and CLI health checks.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(engines).map(([key, engine]) => (
          <Card key={key}>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="ops-label">{ENGINE_LABELS[key] || key}</span>
                <Badge variant={engine.available ? (engine.responding !== false && engine.acceptingConnections !== false ? 'ok' : 'warn') : 'neutral'}>
                  {engine.available ? 'Detected' : 'Not found'}
                </Badge>
              </div>
              {engine.available ? (
                <>
                  <div className="text-sm text-[var(--text-primary)]">Port {engine.port}</div>
                  <div className="text-xs text-[var(--text-muted)]">{engine.statusText || 'Listening'}</div>
                  {engine.version && <div className="text-[10px] text-[var(--text-muted)] truncate">{engine.version}</div>}
                  {engine.usedMemoryHuman && (
                    <div className="text-xs text-[var(--text-secondary)]">Memory: {engine.usedMemoryHuman}</div>
                  )}
                  {engine.connectedClients !== null && engine.connectedClients !== undefined && (
                    <div className="text-xs text-[var(--text-secondary)]">Clients: {engine.connectedClients}</div>
                  )}
                </>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">No listener on port {engine.port}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Engine summary</CardTitle>
          <Badge variant="neutral">{rows.length} active</Badge>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Engine</TableHeader>
              <TableHeader>Port</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={3}>No database engines detected on standard ports.</TableEmpty>
            ) : (
              rows.map((engine) => (
                <TableRow key={engine.engine}>
                  <TableCell className="font-medium">{ENGINE_LABELS[engine.engine] || engine.engine}</TableCell>
                  <TableCell className="font-mono text-xs">{engine.port}</TableCell>
                  <TableCell>{engine.statusText || 'OK'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
