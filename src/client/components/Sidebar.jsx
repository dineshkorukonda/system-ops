import React from 'react';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';

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
  // Build dynamic runtime items based on server capabilities
  const runtimeItems = [];

  // 1. Docker (only if available)
  if (capabilities?.docker?.available) {
    runtimeItems.push({
      id: 'docker',
      label: 'Docker Containers',
      tag: dockerData?.running !== undefined ? `${dockerData.running} RUN` : 'DOCKER',
      tagVariant: dockerData?.running > 0 ? 'ok' : 'neutral',
    });
  }

  // 2. PM2 (only if available / detected)
  if (capabilities?.pm2?.available) {
    runtimeItems.push({
      id: 'pm2',
      label: 'PM2 Fleet',
      tag: pm2Count !== undefined ? `${pm2Count} APPS` : 'PM2',
      tagVariant: pm2Count > 0 ? 'ok' : 'neutral',
    });
  }

  // 3. Systemd Services (always host supervisor)
  runtimeItems.push({
    id: 'services',
    label: 'Systemd Services',
    tag: servicesCount !== undefined ? `${servicesCount} UP` : 'SYSTEMD',
    tagVariant: 'ok',
  });

  // 4. Ollama AI (only if installed on host)
  if (capabilities?.ollama?.available) {
    runtimeItems.push({
      id: 'ollama',
      label: 'Ollama AI',
      tag: ollamaStatus || 'OLLAMA',
      tagVariant: ollamaStatus === 'ACTIVE' || ollamaStatus === 'ONLINE' ? 'ok' : 'err',
    });
  }

  const sections = [
    {
      title: 'OVERVIEW & CORE',
      items: [
        {
          id: 'system',
          label: 'System Health',
          tag: hostData?.uptime?.load1m ? `1m: ${hostData.uptime.load1m}` : 'LIVE',
          tagVariant: 'ok',
        },
        {
          id: 'processes',
          label: 'Process Monitor',
          tag: hostData?.processCount ? `${hostData.processCount} PROC` : 'PROC',
          tagVariant: 'neutral',
        },
      ],
    },
    {
      title: 'CONTAINERS & RUNTIMES',
      items: runtimeItems,
    },
    {
      title: 'STORAGE & TRAFFIC',
      items: [
        {
          id: 'backups',
          label: 'Backups & Dumps',
          tag: backupStatus || 'BACKUP',
          tagVariant: backupStatus === 'SUCCESS' ? 'ok' : backupStatus === 'FAILED' ? 'err' : 'warn',
        },
        {
          id: 'traffic',
          label: 'Traffic Analytics',
          tag: trafficHits !== undefined ? `${trafficHits} HITS` : 'GEO',
          tagVariant: 'neutral',
        },
      ],
    },
    {
      title: 'HELP & SYSTEM',
      items: [
        {
          id: 'settings',
          label: 'Settings',
          tag: updateAvailable ? 'UPDATE' : 'CONFIG',
          tagVariant: updateAvailable ? 'warn' : 'neutral',
        },
        {
          id: 'troubleshooting',
          label: 'Troubleshooting',
          tag: 'DIAG',
          tagVariant: 'neutral',
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#1f1f1f] bg-[#000000] transition-transform duration-200 ease-in-out md:translate-x-0 theme-card',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#1f1f1f] px-5 theme-header">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold tracking-tight text-white truncate max-w-[140px]">
              {siteName.toUpperCase()}
            </span>
            <span className="rounded bg-[#141414] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-neutral-400 border border-[#262626]">
              v2.0
            </span>
          </div>
        </div>

        {/* Sectionized Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1.5">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (window.innerWidth < 768) onClose();
                      }}
                      className={cn(
                        'w-full flex items-center justify-between rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                        isActive
                          ? 'bg-[#141414] text-white border border-[#262626] shadow-sm font-semibold'
                          : 'text-neutral-400 hover:bg-[#0d0d0d] hover:text-neutral-200'
                      )}
                    >
                      <span>{item.label}</span>
                      {item.tag && (
                        <Badge variant={isActive ? item.tagVariant : 'neutral'} className="text-[9px] px-1.5 py-0">
                          {item.tag}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Host Node Footer */}
        <div className="border-t border-[#1f1f1f] bg-[#050505] p-4 text-xs space-y-2 theme-header">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-500 font-mono">NODE</span>
            <span className="font-mono font-medium text-neutral-300">
              {hostData?.uptime?.hostname || 'ubuntu-vps'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-500 font-mono">UPTIME</span>
            <span className="font-mono text-neutral-300">
              {hostData?.uptime?.uptimeText || '--'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#141414]">
            <span className="text-neutral-500 font-mono">STATUS</span>
            <span className="font-mono text-emerald-400 text-[10px] uppercase font-semibold">
              SYSTEMD UNIFIED
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
