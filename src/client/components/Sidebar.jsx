import React from 'react';
import { CATEGORIES, visibleViews } from '../lib/navigation.mjs';
export function Sidebar({ activeTab, setActiveTab, siteName, capabilities, hiddenViews, isOpen, onClose }) {
  const active = CATEGORIES.find(category => category.views.includes(activeTab));
  return <>
    {isOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`app-sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#discovery"><span className="brand-symbol">s</span><span>{siteName}<small>Server workspace</small></span></a>
      <div className="nav-label">WORKSPACE</div>
      <nav>{CATEGORIES.map((category,index) => {
        const views = visibleViews(category,capabilities,hiddenViews);
        return <button key={category.id} disabled={!views.length} aria-current={active?.id === category.id ? 'page' : undefined} onClick={() => { setActiveTab(views[0] || 'discovery'); onClose(); }}><span className="nav-icon" aria-hidden="true">{['◉','▤','▦','◎','▣','⚙'][index]}</span>{category.label}<span className="nav-count">{views.length}</span></button>;
      })}</nav>
      <div className="sidebar-bottom"><span className="status-dot" />Local server<br /><small>Detected and configured sources only.</small></div>
    </aside>
  </>;
}
