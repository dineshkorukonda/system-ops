import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { MonitoringStatus } from './CollectionStatus';

export function TopBar({ activeTabTitle, lastUpdated, monitoringHealth, isSyncing, onSync, refreshInterval, setRefreshInterval, theme, toggleTheme, onLogout, onOpenMobileMenu, onNavigate, availableTabs = {} }) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const matches = Object.entries(availableTabs).filter(([, title]) => title.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const dismiss = (e) => { if (!searchRef.current?.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const navigate = (id) => { onNavigate(id); setSearchOpen(false); setQuery(''); };
  return (
    <header className="app-topbar">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onOpenMobileMenu} aria-label="Open navigation" className="md:hidden p-1.5 rounded border border-[var(--border-color)]"><Icon name="menu" className="h-4 w-4" /></button>
        <span className="text-[11px] text-[var(--text-muted)] hidden xl:inline">Workspace /</span>
        <span className="text-[13px] font-medium truncate">{activeTabTitle}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="hidden xl:block"><MonitoringStatus health={monitoringHealth} /></div>
        <div ref={searchRef} className="relative hidden lg:block">
          <Icon name="search" className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input aria-label="Search modules" aria-controls={searchOpen ? "module-search-results" : undefined} placeholder="Search modules..." value={query} onFocus={() => setSearchOpen(true)} onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }} onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); if (e.key === 'Enter' && matches.length) { e.preventDefault(); navigate(matches[0][0]); } }} className="theme-input w-44 border h-[30px] pl-7 pr-2 text-xs" />
          {searchOpen && <div id="module-search-results" className="ops-search-results" aria-label="Module search results">{matches.length ? matches.map(([id, title]) => <button key={id} onClick={() => navigate(id)}><Icon name={id} className="h-4 w-4" /><span>{title}</span></button>) : <p className="p-2 text-xs text-[var(--text-muted)]">No modules found.</p>}</div>}
        </div>
        <Button variant="outline" size="icon" onClick={() => navigate('discovery')} className="hidden sm:inline-flex" aria-label="Module library" title="Module library"><Icon name="integrations" className="h-4 w-4" /></Button>
        <select aria-label="Refresh interval" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} className="theme-input h-[30px] border px-1.5 text-[11px]"><option value="10">10s</option><option value="30">30s</option><option value="60">60s</option><option value="0">Off</option></select>
        <Button variant="secondary" size="icon" onClick={onSync} disabled={isSyncing} aria-label="Refresh telemetry" title={lastUpdated ? `Last sync ${lastUpdated.toLocaleTimeString()}` : 'Refresh telemetry'}><Icon name="refresh" className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /></Button>
        <Button variant="outline" size="sm" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? 'Light' : 'Dark'}</Button>
        <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Log out">Logout</Button>
      </div>
    </header>
  );
}
