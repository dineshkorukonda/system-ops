import React from 'react';
import { SystemHealthView } from '../components/SystemHealthView';
import { ProcessMonitorView } from '../components/ProcessMonitorView';

export function HostView({
  subPage,
  systemData,
  osUpdatesData,
  cpuHistory,
  ramHistory,
  swapHistory,
  processes,
  processSort,
  setProcessSort,
  onRefreshProcesses,
}) {
  if (subPage === 'processes') {
    return (
      <ProcessMonitorView
        processes={processes}
        sort={processSort}
        setSort={setProcessSort}
        onRefresh={onRefreshProcesses}
      />
    );
  }

  return (
    <SystemHealthView
      systemData={systemData}
      osUpdatesData={osUpdatesData}
      cpuHistory={cpuHistory}
      ramHistory={ramHistory}
      swapHistory={swapHistory}
    />
  );
}
