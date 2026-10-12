import React from 'react';
import { Icon } from './ui/Icon';
import { CATEGORIES, visibleViews } from '../lib/navigation.mjs';
export function Sidebar({ activeTab, setActiveTab, siteName, capabilities, hiddenViews, isOpen, onClose }) {
  const active = CATEGORIES.find(category => category.views.includes(activeTab));
  return <>
    {isOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`app-sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#discovery"><span className="brand-symbol"><Icon name="system" /></span><span>{siteName}<small>Server workspace</small></span></a>
      <div className="nav-label">WORKSPACE</div>
      <nav>{CATEGORIES.map((category,index) => {
        const views = visibleViews(category,capabilities,hiddenViews);
        const countLabel = `${views.length} ${views.length === 1 ? 'view' : 'views'}`;
        return <button key={category.id} disabled={!views.length} aria-current={active?.id === category.id ? 'page' : undefined} onClick={() => { setActiveTab(views[0] || 'discovery'); onClose(); }}><span className="nav-icon" aria-hidden="true"><Icon name={['system','processes','docker','traffic','databases','settings'][index]} /></span>{category.label}<span className="nav-count" aria-label={countLabel} title="Number of available views, not running applications">{countLabel}</span></button>;
      })}</nav>
      <div className="sidebar-bottom"><span className="status-dot" />Local server<br /><small>Detected and configured sources only.</small></div>
    </aside>
  </>;
}
