import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export function SettingsView({ onBrandingChange }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    siteName: '',
    siteSubtitle: '',
    syncNameWithHostname: false,
    autoUpdateEnabled: false,
  });
  const [versionInfo, setVersionInfo] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updatePassword, setUpdatePassword] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissedResultAt, setDismissedResultAt] = useState(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setForm({
          siteName: data.siteName || '',
          siteSubtitle: data.siteSubtitle || '',
          syncNameWithHostname: data.syncNameWithHostname || false,
          autoUpdateEnabled: data.autoUpdateEnabled || false,
        });
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  const loadVersionInfo = useCallback(async (force = false) => {
    setIsCheckingVersion(true);
    try {
      const res = await fetch(`/api/v2/system/version${force ? '?refresh=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setVersionInfo(data);
      }
    } catch (e) {
      console.error('Failed to check version', e);
    } finally {
      setIsCheckingVersion(false);
    }
  }, []);

  const loadUpdateStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/system/update/status');
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(data);
        if (!data.running && (data.phase === 'success' || data.phase === 'failed')) {
          setUpdateInProgress(false);
        }
        return data;
      }
    } catch (e) {
      // Expected while the service restarts mid-update
      if (updateInProgress) {
        setUpdateStatus((prev) => ({
          ...prev,
          running: true,
          phase: 'running',
          message: 'Service is restarting… waiting for it to come back online.',
        }));
      } else {
        console.error('Failed to load update status', e);
      }
    }
    return null;
  }, [updateInProgress]);

  useEffect(() => {
    loadSettings();
    loadVersionInfo();
    loadUpdateStatus();
  }, [loadSettings, loadVersionInfo, loadUpdateStatus]);

  useEffect(() => {
    if (!updateStatus?.running && !updateInProgress) return undefined;
    const interval = setInterval(loadUpdateStatus, 2000);
    return () => clearInterval(interval);
  }, [updateStatus?.running, updateInProgress, loadUpdateStatus]);

  const showUpdateResult = updateStatus
    && !updateStatus.running
    && !updateInProgress
    && (updateStatus.phase === 'success' || updateStatus.phase === 'failed')
    && updateStatus.finishedAt !== dismissedResultAt;

  useEffect(() => {
    if (
      updateStatus?.phase === 'success'
      && versionInfo
      && !versionInfo.updateAvailable
      && updateStatus.finishedAt
    ) {
      setDismissedResultAt(updateStatus.finishedAt);
    }
  }, [updateStatus, versionInfo]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/v2/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        setSaveMessage('Settings saved');
        if (onBrandingChange) onBrandingChange(data.settings);
      } else {
        setSaveMessage(data.errors?.join(', ') || data.error || 'Failed to save');
      }
    } catch (e) {
      setSaveMessage('Connection error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleStartUpdate = async () => {
    setUpdateError('');
    setIsUpdating(true);
    try {
      const res = await fetch('/api/v2/system/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: updatePassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowUpdateModal(false);
        setUpdatePassword('');
        setUpdateInProgress(true);
        setDismissedResultAt(null);
        await loadUpdateStatus();
      } else {
        setUpdateError(data.error || 'Update failed to start');
      }
    } catch (e) {
      setUpdateError('Connection error');
    } finally {
      setIsUpdating(false);
    }
  };

  const previewName = form.syncNameWithHostname
    ? (settings?.hostname || 'hostname')
    : (form.siteName || 'system-ops');

  const previewTitle = `${previewName} | ${settings?.hostname || 'hostname'}`;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <label className="text-[var(--text-secondary)] block">Site Name</label>
            <input
              type="text"
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              disabled={form.syncNameWithHostname}
              maxLength={64}
              className="w-full h-9 rounded ops-input border px-3 text-sm text-[var(--text-primary)] outline-none focus:border-neutral-500 disabled:opacity-50 ops-input"
              placeholder="system-ops"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[var(--text-secondary)] block">Subtitle</label>
            <input
              type="text"
              value={form.siteSubtitle}
              onChange={(e) => setForm({ ...form, siteSubtitle: e.target.value })}
              maxLength={128}
              className="w-full h-9 rounded ops-input border px-3 text-sm text-[var(--text-primary)] outline-none focus:border-neutral-500 ops-input"
              placeholder="Operations Console"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.syncNameWithHostname}
              onChange={(e) => setForm({ ...form, syncNameWithHostname: e.target.checked })}
              className="rounded border-[var(--border-subtle)]"
            />
            <span className="text-[var(--text-secondary)]">Sync site name with hostname</span>
          </label>

          <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-1">
            <div className="ops-label">Preview</div>
            <div className="text-[var(--text-primary)] font-semibold">{previewName}</div>
            <div className="text-[var(--text-secondary)]">{form.siteSubtitle}</div>
            <div className="text-[var(--text-muted)] text-[10px] pt-1">Tab: {previewTitle}</div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
            {saveMessage && (
              <span className={`text-[11px] ${saveMessage.includes('saved') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          {versionInfo?.checkError ? (
            <Badge variant="warn">Check failed</Badge>
          ) : versionInfo?.updateAvailable ? (
            <Badge variant="warn">Update available</Badge>
          ) : (
            <Badge variant="ok">Up to date</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {(updateStatus?.running || updateInProgress) && !showUpdateResult && (
            <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-1">
              <div className="text-[var(--text-primary)] text-sm font-medium">Updating…</div>
              <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed">
                Pulling code, rebuilding, and restarting the service. This page may stop responding for 30–60 seconds — keep this tab open. When finished, you will be prompted to refresh.
              </p>
            </div>
          )}

          {showUpdateResult && updateStatus.phase === 'success' && (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-emerald-400 text-sm font-semibold">Update complete</div>
                  <p className="text-[var(--text-secondary)] text-[11px] mt-1 leading-relaxed">
                    {updateStatus.message || 'The service has been restarted. Refresh this page to load the new version.'}
                  </p>
                </div>
                <Badge variant="ok">Done</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Refresh now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDismissedResultAt(updateStatus.finishedAt);
                    loadVersionInfo(true);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {showUpdateResult && updateStatus.phase === 'failed' && (
            <div className="rounded border border-rose-500/40 bg-rose-500/10 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-rose-400 text-sm font-semibold">Update failed</div>
                  <p className="text-[var(--text-secondary)] text-[11px] mt-1 leading-relaxed">
                    {updateStatus.message || 'Check the log below, fix any permission errors, then retry.'}
                  </p>
                </div>
                <Badge variant="err">Failed</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDismissedResultAt(updateStatus.finishedAt)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="ops-label">Installed</div>
              <div className="text-[var(--text-primary)] text-sm font-semibold">v{versionInfo?.current || '—'}</div>
              {versionInfo?.currentCommit && (
                <div className="text-[var(--text-muted)] text-[10px] mt-0.5">{versionInfo.currentCommit}</div>
              )}
            </div>
            <div>
              <div className="ops-label">Latest on main</div>
              <div className="text-[var(--text-primary)] text-sm font-semibold">
                {versionInfo?.latest ? `v${versionInfo.latest}` : '—'}
              </div>
              {versionInfo?.latestCommit && (
                <div className="text-[var(--text-muted)] text-[10px] mt-0.5">{versionInfo.latestCommit}</div>
              )}
            </div>
          </div>

          {versionInfo?.source && !versionInfo?.checkError && (
            <div className="text-[var(--text-muted)] text-[10px]">
              Checked via {versionInfo.source === 'github-release' ? 'GitHub release' : 'main branch'}
            </div>
          )}

          {versionInfo?.checkError && (
            <div className="text-amber-400 text-[11px]">
              Could not check for updates: {versionInfo.checkError}
            </div>
          )}

          {versionInfo?.commitUpdate && !versionInfo?.versionUpdate && versionInfo?.updateAvailable && (
            <div className="text-amber-400/90 text-[11px]">
              New commits on main ({versionInfo.latestCommit}) — version unchanged, update recommended.
            </div>
          )}

          {versionInfo?.releaseNotes && versionInfo.updateAvailable && (
            <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <div className="ops-label mb-1">Release notes</div>
              <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-[11px] leading-relaxed">
                {versionInfo.releaseNotes}
              </pre>
              {versionInfo.releaseUrl && (
                <a
                  href={versionInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-[11px] mt-2 inline-block"
                >
                  View on GitHub
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadVersionInfo(true)}
              disabled={isCheckingVersion}
            >
              {isCheckingVersion ? 'Checking…' : 'Check for updates'}
            </Button>

            {versionInfo?.installType === 'systemd' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUpdateModal(true)}
                disabled={updateStatus?.running}
              >
                {updateStatus?.running ? 'Updating…' : versionInfo?.updateAvailable ? 'Update now' : 'Reinstall / sync'}
              </Button>
            )}
          </div>

          {versionInfo?.installType === 'docker' && (
            <div className="text-[var(--text-secondary)] text-[11px] leading-relaxed">
              Docker installs: run <code className="text-neutral-200">docker compose pull && docker compose up -d</code>.
              For automated image monitoring, consider Diun (notify-only) or WUD (semver-aware auto-update).
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-[var(--border)]">
            <input
              type="checkbox"
              checked={form.autoUpdateEnabled}
              onChange={(e) => setForm({ ...form, autoUpdateEnabled: e.target.checked })}
              className="rounded border-[var(--border-subtle)]"
            />
            <span className="text-[var(--text-secondary)]">Enable automatic daily updates (systemd timer)</span>
          </label>
          <div className="text-[var(--text-muted)] text-[10px]">
            Save settings to apply the auto-update timer change.
          </div>

          {updateStatus?.logTail && (
            <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <div className="text-[var(--text-muted)] text-[10px] uppercase mb-1">
                Update Log {updateStatus.running ? '(live)' : ''}
              </div>
              <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-[10px] leading-relaxed max-h-48 overflow-y-auto">
                {updateStatus.logTail}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update confirmation modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-[var(--text-secondary)] leading-relaxed">
                This will pull the latest code, rebuild the frontend, and restart the service.
                The dashboard may go offline for 30–60 seconds. When the update finishes, you will see a &quot;Refresh now&quot; button — use it to load the new version.
              </p>
              {!versionInfo?.updateAvailable && (
                <p className="text-amber-400/90 text-[11px]">
                  You are already up to date. Only use this to force a re-sync/rebuild.
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-[var(--text-secondary)] block">Re-enter password to confirm</label>
                <input
                  type="password"
                  value={updatePassword}
                  onChange={(e) => setUpdatePassword(e.target.value)}
                  className="w-full h-9 rounded ops-input border px-3 text-sm text-[var(--text-primary)] outline-none focus:border-neutral-500 ops-input"
                  placeholder="Password"
                  autoFocus
                />
              </div>
              {updateError && (
                <div className="text-rose-400 text-[11px]">{updateError}</div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartUpdate}
                  disabled={isUpdating || !updatePassword}
                >
                  {isUpdating ? 'Starting…' : 'Start update'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowUpdateModal(false); setUpdatePassword(''); setUpdateError(''); }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
