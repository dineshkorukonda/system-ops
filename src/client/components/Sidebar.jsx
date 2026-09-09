import React from 'react';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import { NAV_ICONS } from './ui/Icons';

export function Sidebar({
  activeTab,
  setActiveTab,
  siteName = 'system-ops',
  updateAvailable = false,
  hostData,
  capabilities,
  dockerData,
  pm2Count,
  servicesCount,
  ollamaStatus,
  backupStatus,
  trafficHits,
  isOpen,
  onClose,
}) {
  const runtimeItems = [];

  if (capabilities?.docker?.available) {
    runtimeItems.push({
      id: 'docker',
      label: 'Docker',
      tag: dockerData?.running !== undefined ? `${dockerData.running} running` : null,
      tagVariant: dockerData?.running > 0 ? 'ok' : 'neutral',
    });
  }

  if (capabilities?.pm2?.available) {
    runtimeItems.push({
      id: 'pm2',
      label: 'PM2 Fleet',
      tag: pm2Count !== undefined ? `${pm2Count} apps` : null,
      tagVariant: pm2Count > 0 ? 'ok' : 'neutral',
    });
  }

  if (capabilities?.systemd?.available !== false) {
    runtimeItems.push({
      id: 'services',
      label: 'Services',
      tag: servicesCount !== undefined ? `${servicesCount} active` : null,
      tagVariant: 'ok',
    });
  }

  if (capabilities?.ollama?.available) {
    runtimeItems.push({
      id: 'ollama',
      label: 'Ollama',
      tag: ollamaStatus === 'ONLINE' || ollamaStatus === 'ACTIVE' ? 'Online' : 'Stopped',
      tagVariant: ollamaStatus === 'ACTIVE' || ollamaStatus === 'ONLINE' ? 'ok' : 'err',
    });
  }

  const storageItems = [];

  if (capabilities?.backups?.available) {
    storageItems.push({
      id: 'backups',
      label: 'Backups',
      tag: backupStatus === 'SUCCESS' ? 'Ready' : backupStatus === 'FAILED' ? 'Failed' : null,
      tagVariant: backupStatus === 'SUCCESS' ? 'ok' : backupStatus === 'FAILED' ? 'err' : 'warn',
    });
  }

  if (capabilities?.traffic?.available) {
    storageItems.push({
      id: 'traffic',
      label: 'Traffic',
      tag: trafficHits !== undefined ? `${trafficHits} hits` : null,
      tagVariant: 'neutral',
    });
  }

  const sections = [
    {
      title: 'Overview',
      items: [
        {
          id: 'system',
          label: 'System Health',
          tag: hostData?.uptime?.load1m ? `Load ${hostData.uptime.load1m}` : null,
          tagVariant: 'ok',
        },
        {
          id: 'processes',
          label: 'Processes',
          tag: hostData?.processCount ? `${hostData.processCount}` : null,
          tagVariant: 'neutral',
        },
      ],
    },
    ...(runtimeItems.length > 0 ? [{ title: 'Infrastructure', items: runtimeItems }] : []),
    ...(storageItems.length > 0 ? [{ title: 'Data', items: storageItems }] : []),
    {
      title: 'System',
      items: [
        { id: 'integrations', label: 'Integrations', tag: null, tagVariant: 'neutral' },
        {
          id: 'settings',
          label: 'Settings',
          tag: updateAvailable ? 'Update' : null,
          tagVariant: updateAvailable ? 'warn' : 'neutral',
        },
        { id: 'troubleshooting', label: 'Help', tag: null, tagVariant: 'neutral' },
      ],
    },
  ];

  const renderNavItem = (item) => {
    const isActive = activeTab === item.id;
    const Icon = NAV_ICONS[item.id];
    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          if (window.innerWidth < 768) onClose();
        }}
        className={cn('ops-nav-item', isActive && 'ops-nav-item-active')}
      >
        {Icon && <Icon />}
        <span className="flex-1 truncate">{item.label}</span>
        {item.tag && (
          <Badge variant={item.tagVariant} className="text-[10px] px-1.5">
            {item.tag}
          </Badge>
        )}
      </button>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'ops-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-200 ease-in-out md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
            <IconActivity className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{siteName}</div>
            <div className="truncate text-xs text-[var(--text-muted)]">Operations Console</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              <div className="ops-section-title px-3 mb-2">{section.title}</div>
              <div className="space-y-0.5">
                {section.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Host</span>
            <span className="font-medium text-[var(--text-secondary)] truncate ml-2">
              {hostData?.uptime?.hostname || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Uptime</span>
            <span className="font-medium text-[var(--text-secondary)]">
              {hostData?.uptime?.uptimeText || '—'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function IconActivity({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
