import React from 'react';
import { cn } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Separator } from '../components/ui/Separator';
import { NAV_ICONS } from '../components/ui/Icons';

function NavItem({ item, isActive, onClick }) {
  const Icon = NAV_ICONS[item.id];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary border-l-2 border-primary -ml-px pl-[11px]'
          : 'text-sidebar-muted hover:bg-muted hover:text-foreground border-l-2 border-transparent -ml-px pl-[11px]'
      )}
    >
      {Icon && (
        <Icon className={cn(
          'h-4 w-4 shrink-0',
          isActive ? 'text-primary' : 'opacity-60 group-hover:opacity-100'
        )} />
      )}
      <span className="flex-1 truncate text-left">{item.label}</span>
      {item.badge && (
        <Badge variant={item.badgeVariant || 'muted'} className="ml-auto text-[10px]">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}

export function AppSidebar({
  siteName,
  activeTab,
  setActiveTab,
  capabilities,
  sidebarMeta,
  updateAvailable,
  isOpen,
  onClose,
}) {
  const m = sidebarMeta || {};

  const overview = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'system', label: 'System Health', badge: m.load ? `Load ${m.load}` : null },
    { id: 'processes', label: 'Processes', badge: m.processCount ? String(m.processCount) : null },
  ];

  const infrastructure = [
    capabilities?.docker?.available && {
      id: 'docker',
      label: 'Docker',
      badge: m.dockerRunning !== undefined ? `${m.dockerRunning} run` : null,
    },
    capabilities?.pm2?.available && {
      id: 'pm2',
      label: 'PM2',
      badge: m.pm2Count !== undefined ? `${m.pm2Count} apps` : null,
    },
    capabilities?.systemd?.available !== false && {
      id: 'services',
      label: 'Services',
      badge: m.servicesActive !== undefined ? `${m.servicesActive} up` : null,
    },
    capabilities?.ollama?.available && {
      id: 'ollama',
      label: 'Ollama',
      badge: m.ollamaOnline ? 'Online' : 'Off',
    },
  ].filter(Boolean);

  const observability = [
    capabilities?.traffic?.available && {
      id: 'traffic',
      label: 'Traffic',
      badge: m.trafficHits !== undefined ? String(m.trafficHits) : null,
    },
    (capabilities?.security?.available || capabilities?.certbot?.available) && {
      id: 'security',
      label: 'Security',
      badge: m.securityBanned ? String(m.securityBanned) : null,
    },
    capabilities?.monix?.configured && {
      id: 'monix',
      label: 'Monix',
      badge: m.monixDown ? `${m.monixDown} down` : null,
    },
  ].filter(Boolean);

  const data = [
    capabilities?.backups?.available && { id: 'backups', label: 'Backups' },
    capabilities?.databases?.available && {
      id: 'databases',
      label: 'Databases',
      badge: m.dbCount !== undefined ? String(m.dbCount) : null,
    },
  ].filter(Boolean);

  const system = [
    { id: 'integrations', label: 'Integrations' },
    { id: 'settings', label: 'Settings', badge: updateAvailable ? 'Update' : null },
    { id: 'troubleshooting', label: 'Help' },
  ];

  const sections = [
    { title: 'Overview', items: overview },
    ...(infrastructure.length ? [{ title: 'Infrastructure', items: infrastructure }] : []),
    ...(observability.length ? [{ title: 'Observability', items: observability }] : []),
    ...(data.length ? [{ title: 'Data', items: data }] : []),
    { title: 'System', items: system },
  ];

  const pick = (id) => {
    setActiveTab(id);
    if (window.innerWidth < 768) onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-sm">
            {siteName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{siteName}</p>
            <p className="truncate text-xs text-sidebar-muted">Operations Console</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isActive={activeTab === item.id}
                    onClick={() => pick(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-lg border border-sidebar-border bg-primary/5 p-3 text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Host</span>
              <span className="font-medium truncate">{m.hostname || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Uptime</span>
              <span className="font-medium">{m.uptime || '—'}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
