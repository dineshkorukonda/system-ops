import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SystemHealthView } from './components/SystemHealthView';
import { ProcessMonitorView } from './components/ProcessMonitorView';
import { Pm2FleetView } from './components/Pm2FleetView';
import { OllamaView } from './components/OllamaView';
import { BackupsView } from './components/BackupsView';
import { TrafficAnalyticsView } from './components/TrafficAnalyticsView';
import { LoginView } from './components/LoginView';

const MAX_HISTORY = 20;

export function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  // Active view — SYSTEM HEALTH is MAIN / DEFAULT
  const [activeTab, setActiveTab] = useState('system');

  // Monochrome Theme: 'dark' (pure #000000) or 'light' (pure #ffffff)
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');

  // Controls & auto-refresh
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Telemetry rolling buffers
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  const [swapHistory, setSwapHistory] = useState([]);

  // Telemetry snapshots
  const [systemData, setSystemData] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [processSort, setProcessSort] = useState('cpu');
  const [pm2Data, setPm2Data] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaLogs, setOllamaLogs] = useState('');
  const [ollamaLogLines, setOllamaLogLines] = useState('100');
  const [backupSources, setBackupSources] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [trafficData, setTrafficData] = useState(null);

  // Theme synchronization with DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('ops_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.authenticated === true);
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    setIsAuthenticated(false);
  };

  // Push rolling metrics
  const pushMetric = (setter, val) => {
    setter((prev) => {
      const next = [...prev, val];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  };

  // ── Telemetry Fetchers ──
  const fetchSystemSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/system/snapshot');
      if (res.status === 401) { setIsAuthenticated(false); return; }
      if (res.ok) {
        const data = await res.json();
        setSystemData(data);
        if (data.uptime?.load1m) pushMetric(setCpuHistory, parseFloat(data.uptime.load1m) || 0);
        if (data.memory?.usagePercent) pushMetric(setRamHistory, data.memory.usagePercent);
        if (data.swap?.usagePercent) pushMetric(setSwapHistory, data.swap.usagePercent);
      }
    } catch (e) {}
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/system/processes?sort=${processSort}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes || []);
      }
    } catch (e) {}
  }, [processSort]);

  const fetchPm2Snapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      if (res.ok) {
        const data = await res.json();
        setPm2Data(data);
      }
    } catch (e) {}
  }, []);

  const fetchOllamaData = useCallback(async () => {
    try {
      const [statusRes, modelsRes, logsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/models'),
        fetch(`/api/logs?lines=${ollamaLogLines}`),
      ]);
      if (statusRes.ok) setOllamaStatus(await statusRes.json());
      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        setOllamaModels(mData.models || []);
      }
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setOllamaLogs(lData.logs || '');
      }
    } catch (e) {}
  }, [ollamaLogLines]);

  const fetchBackupData = useCallback(async () => {
    try {
      const [sourcesRes, filesRes] = await Promise.all([
        fetch('/api/v2/logs/sources'),
        fetch('/api/v2/backups/files'),
      ]);
      if (sourcesRes.ok) {
        const sData = await sourcesRes.json();
        setBackupSources(sData.sources || []);
      }
      if (filesRes.ok) {
        const fData = await filesRes.json();
        setBackupFiles(fData.files || []);
      }
    } catch (e) {}
  }, []);

  const fetchTrafficData = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/traffic/analytics');
      if (res.ok) {
        const data = await res.json();
        setTrafficData(data);
      }
    } catch (e) {}
  }, []);

  // Synchronize all data
  const syncAllData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    await Promise.allSettled([
      fetchSystemSnapshot(),
      fetchProcesses(),
      fetchPm2Snapshot(),
      fetchOllamaData(),
      fetchBackupData(),
      fetchTrafficData(),
    ]);
    setLastUpdated(new Date());
    setIsSyncing(false);
  }, [
    isAuthenticated,
    fetchSystemSnapshot,
    fetchProcesses,
    fetchPm2Snapshot,
    fetchOllamaData,
    fetchBackupData,
    fetchTrafficData,
  ]);

  // Initial sync & timer polling
  useEffect(() => {
    if (isAuthenticated) {
      syncAllData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || refreshInterval === 0) return;
    const timer = setInterval(() => {
      syncAllData();
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshInterval, syncAllData]);

  // Loading state during auth check
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-mono text-xs text-neutral-500 theme-bg">
        INITIALIZING SYSTEM-OPS...
      </div>
    );
  }

  // Render Login View if unauthenticated
  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  // Compute summary values for sidebar
  let totalPm2 = 0;
  (pm2Data?.users || []).forEach((u) => {
    totalPm2 += (u.processes || []).length;
  });

  const tabTitles = {
    system: 'System Health',
    processes: 'Process Monitor',
    pm2: 'PM2 Fleet',
    ollama: 'Ollama AI',
    backups: 'Backups & Recovery',
    traffic: 'Traffic Analytics',
  };

  return (
    <div className="flex min-h-screen bg-[#000000] text-white theme-bg">
      {/* Persistent Sectionized Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hostData={{
          uptime: systemData?.uptime,
          processCount: processes.length,
        }}
        pm2Count={totalPm2}
        ollamaStatus={ollamaStatus?.systemd?.isActive ? 'ONLINE' : 'STOPPED'}
        backupStatus={backupSources.length > 0 ? 'SUCCESS' : 'IDLE'}
        trafficHits={trafficData?.summary?.total_hits || 0}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col md:pl-64 min-w-0">
        <TopBar
          activeTabTitle={tabTitles[activeTab] || 'Console'}
          lastUpdated={lastUpdated}
          isSyncing={isSyncing}
          onSync={syncAllData}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={handleLogout}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'system' && (
            <SystemHealthView
              systemData={systemData}
              cpuHistory={cpuHistory}
              ramHistory={ramHistory}
              swapHistory={swapHistory}
            />
          )}

          {activeTab === 'processes' && (
            <ProcessMonitorView
              processes={processes}
              sort={processSort}
              setSort={setProcessSort}
              onRefresh={fetchProcesses}
            />
          )}

          {activeTab === 'pm2' && (
            <Pm2FleetView pm2Data={pm2Data} onRefresh={fetchPm2Snapshot} />
          )}

          {activeTab === 'ollama' && (
            <OllamaView
              statusData={ollamaStatus}
              models={ollamaModels}
              logs={ollamaLogs}
              logLines={ollamaLogLines}
              setLogLines={setOllamaLogLines}
              onRefreshLogs={fetchOllamaData}
            />
          )}

          {activeTab === 'backups' && (
            <BackupsView
              sources={backupSources}
              files={backupFiles}
              onRefreshFiles={fetchBackupData}
            />
          )}

          {activeTab === 'traffic' && (
            <TrafficAnalyticsView trafficData={trafficData} />
          )}
        </main>
      </div>
    </div>
  );
}
