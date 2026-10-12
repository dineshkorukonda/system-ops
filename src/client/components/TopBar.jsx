import React from 'react';
import { Button } from './ui/Button';
import { MonitoringStatus } from './CollectionStatus';
export function TopBar({activeTabTitle,lastUpdated,monitoringHealth,isSyncing,onSync,refreshInterval,setRefreshInterval,theme,toggleTheme,onLogout,onOpenMobileMenu}) {
  return <header className="app-topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={onOpenMobileMenu}>☰</button><span className="breadcrumb">Workspace <span>/</span> <strong>{activeTabTitle}</strong></span></div>
    <div className="topbar-actions"><MonitoringStatus health={monitoringHealth}/><span className="last-updated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Awaiting sample'}</span>
      <select aria-label="Refresh interval" value={refreshInterval} onChange={event => setRefreshInterval(Number(event.target.value))}><option value="10">10s</option><option value="30">30s</option><option value="60">60s</option><option value="0">Off</option></select>
      <Button variant="secondary" disabled={isSyncing} onClick={onSync}>{isSyncing ? 'Refreshing…' : 'Refresh'}</Button>
      <Button variant="outline" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>{theme === 'dark' ? 'Light' : 'Dark'}</Button><Button variant="ghost" onClick={onLogout}>Log out</Button>
    </div></header>;
}
