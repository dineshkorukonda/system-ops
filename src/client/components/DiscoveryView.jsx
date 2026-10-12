import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
const SOURCES = [
  ['pm2','PM2 applications','apps','pm2'], ['docker','Docker','apps','docker'],
  ['systemd','System services','apps','services'], ['ollama','Ollama','apps','ollama'],
  ['tls','SSL certificates','network','tls'], ['traffic','Web traffic','network','traffic'],
  ['security','Firewall & security','network','security'], ['databases','Databases','storage','databases'],
  ['backups','Backups','storage','backups'], ['certbot','Certificate renewal','network','certbot'],
  ['osUpdates','OS updates','host','osUpdates'],
];
export function DiscoveryView({ capabilities, onNavigate, onChanged, hiddenViews, setHiddenViews, health }) {
  const [filter,setFilter] = useState('all'), [showMissing,setShowMissing] = useState(false);
  const [busy,setBusy] = useState(null), [error,setError] = useState(null);
  const detected = SOURCES.filter(([key]) => capabilities?.[key]?.available);
  const configured = SOURCES.filter(([key]) => capabilities?.[key]?.configured && !capabilities[key].available);
  const sources = (showMissing ? SOURCES : [...detected,...configured]).filter(([, ,category]) => filter === 'all' || filter === category);
  const request = async (route,body,key) => {
    setBusy(key); setError(null);
    try {
      const res = await fetch(route,{ method: route.includes('settings') ? 'PUT' : 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.join(', ') || data.error || 'Unable to update sources');
      await onChanged();
    } catch(err) { setError(err.message); } finally { setBusy(null); }
  };
  return <div className="discovery-view">
    <div className="page-intro"><div><div className="eyebrow">YOUR SERVER</div><h1>A clearer view of what’s running.</h1><p>Start with detected sources. Choose what to monitor and keep your workspace focused.</p></div><Button variant="secondary" disabled={!!busy} onClick={() => request('/api/v2/discovery/rescan',{target:'capabilities'},'rescan')}>{busy === 'rescan' ? 'Scanning…' : 'Rescan server'}</Button></div>
    <div className="summary-grid">
      <div><span>Detected sources</span><strong>{capabilities ? detected.length : '—'}</strong><small>Evidence from this server</small></div>
      <div><span>Monitoring enabled</span><strong>{capabilities ? SOURCES.filter(([key]) => capabilities[key]?.enabled && key !== 'tls').length : '—'}</strong><small>Optional background collectors</small></div>
      <div><span>Needs attention</span><strong>{capabilities ? SOURCES.filter(([key]) => capabilities[key]?.error).length : '—'}</strong><small>Access or collection errors</small></div>
      <div><span>Host monitoring</span><strong className="summary-word">{health?.ok ? 'Ready' : 'Checking'}</strong><small>Collection readiness, not service uptime</small></div>
    </div>
    {error && <p role="alert" className="error-message">{error}</p>}
    <section className="source-section"><div className="section-heading"><div><h2>Sources & integrations</h2><p>Detection is separate from health. Nothing is enabled automatically.</p></div><label className="missing-toggle"><input type="checkbox" checked={showMissing} onChange={event => setShowMissing(event.target.checked)} />Show undetected sources</label></div>
      <div className="filter-row" aria-label="Source categories">{[['all','All sources'],['apps','Applications'],['network','Network'],['storage','Storage'],['host','Host']].map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {!capabilities ? <div role="status" className="empty-state">Discovering server sources…</div> : !sources.length ? <div className="empty-state"><h3>No sources detected in this category</h3><p>Check access permissions or show undetected sources to configure one.</p></div> : <div className="source-grid">{sources.map(([key,label,,view]) => {
        const cap = capabilities[key] || {}, destination = ['certbot','osUpdates'].includes(view) ? 'integrations' : view;
        return <article className="source-card" key={key} aria-label={label}>
          <div className="source-card-heading"><span className="source-symbol" aria-hidden="true">{label.slice(0,2)}</span><Badge variant={cap.error ? 'warn' : cap.status === 'monitoring' ? 'ok' : 'neutral'}>{cap.status || 'not detected'}</Badge></div>
          <h3>{label}</h3><p>{cap.available ? 'Detected on this server' : cap.configured ? 'Configured, awaiting evidence' : 'No evidence found'}</p>
          {cap.count != null && <p>{cap.count} items in last snapshot</p>}
          <ul className="source-evidence">{(cap.evidence || []).slice(0,3).map(item => <li key={item.target}>{item.target}{!item.readable && ' · Access denied'}</li>)}</ul>
          {cap.error && <p className="error-message">{cap.error}</p>}
          {cap.hint && <details><summary>Detection help</summary><p>{cap.hint}</p></details>}
          <div className="source-actions"><Button variant="secondary" onClick={() => onNavigate(destination)}>View details</Button>{key !== 'tls' && <Button disabled={!!busy} variant={cap.enabled ? 'outline' : 'default'} onClick={() => request('/api/v2/settings',{integrations:{[view]:!cap.enabled}},view)}>{busy === view ? 'Saving…' : cap.enabled ? 'Disable monitoring' : 'Enable monitoring'}</Button>}</div>
          {!['certbot','osUpdates'].includes(view) && <label className="visibility-choice"><input type="checkbox" checked={!hiddenViews.includes(view)} onChange={() => setHiddenViews(hiddenViews.includes(view) ? hiddenViews.filter(id => id !== view) : [...hiddenViews,view])} />Show in navigation</label>}
        </article>;
      })}</div>}
    </section>
    <div className="setup-note"><strong>Missing something you expected?</strong><span>Private PM2 homes, Docker sockets and web logs may need read access. Discovery does not install software or start services.</span><button onClick={() => onNavigate('integrations')}>Open setup guides →</button></div>
  </div>;
}
