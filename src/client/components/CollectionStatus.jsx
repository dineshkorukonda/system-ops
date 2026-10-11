import React, { useEffect, useState } from 'react';
import { Badge } from './ui/Badge';

function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  return now;
}

function isFresh(collection, now) {
  const successAt = Date.parse(collection?.lastSuccess || '');
  return collection?.fresh === true && Number.isFinite(successAt) &&
    now - successAt <= collection.staleAfterMs;
}

export function MonitoringStatus({ health }) {
  const now = useClock();
  const critical = Object.values(health?.collectors || {}).filter(col => col.enabled && col.critical);
  const ready = health?.ok === true && critical.length > 0 && critical.every(col => isFresh(col, now));
  return (
    <Badge variant={ready ? 'ok' : health ? 'warn' : 'neutral'} className="hidden lg:inline-flex">
      {ready ? 'MONITORING READY' : health ? 'MONITORING NOT READY' : 'CHECKING MONITORING'}
    </Badge>
  );
}

export function CollectionStatus({ collection }) {
  const now = useClock();
  const successAt = Date.parse(collection?.lastSuccess || '');
  const age = Number.isFinite(successAt) ? Math.max(0, Math.floor((now - successAt) / 1000)) : null;
  const status = collection?.status === 'healthy' && !isFresh(collection, now)
    ? 'stale' : collection?.status || 'collecting';
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 font-mono text-xs text-neutral-400">
      <Badge variant={status === 'healthy' ? 'ok' : 'warn'}>{status}</Badge>
      <span>{collection?.source || 'Waiting for first collection'}</span>
      <span>{age === null ? 'No successful sample yet' : `Last successful sample ${age}s ago`}</span>
      {collection?.lastError && <span className="text-amber-400">{collection.lastError}</span>}
    </div>
  );
}
