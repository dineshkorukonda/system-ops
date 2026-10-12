import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

export function LoginView({ branding, onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localBranding, setLocalBranding] = useState(branding);

  useEffect(() => {
    if (branding) {
      setLocalBranding(branding);
      document.title = branding.pageTitle || `${branding.siteName} | Login`;
      return;
    }
    fetch('/api/v2/settings/branding')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setLocalBranding(data);
          document.title = data.pageTitle || `${data.siteName} | Login`;
        }
      })
      .catch(() => {});
  }, [branding]);

  const siteName = localBranding?.siteName || 'system-ops';
  const siteSubtitle = localBranding?.siteSubtitle || 'Operations Console Authentication';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onLoginSuccess();
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      setError('Connection error. Verify host connectivity.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ops-login flex min-h-screen items-center justify-center p-5 pt-28 pb-20">
      <div className="absolute top-6 left-6 flex items-center gap-3"><span className="h-3 w-3 bg-[var(--accent)]" /><h2 className="text-lg font-bold tracking-tight">{siteName}</h2></div>
      <div className="absolute top-6 right-6 hidden sm:flex gap-2 items-center rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-[10px] font-mono text-[var(--text-muted)]"><Icon name="security" className="h-4 w-4 text-[var(--accent)]" />AUTHORIZED ACCESS ONLY</div>
      <Card className="w-full max-w-sm">
        <CardContent className="!p-6">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-[var(--border-color)]">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--accent)]"><Icon name="system" /><span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-[var(--accent)] border-2 border-[var(--card-bg)]" /></div>
            <div><h2 className="font-bold text-base">{siteName}</h2><p className="text-[11px] font-mono text-[var(--text-muted)]">{siteSubtitle}</p></div>
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-2">Welcome back, operator.</h1>
          <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">Authenticate to access your command center.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="console-password" className="block font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">Access password</label>
              <div className="relative"><Icon name="key" className="absolute left-3 top-2.5 text-[var(--text-muted)]" /><input id="console-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter console password" required autoFocus className="theme-input w-full h-10 border pl-10 pr-4 text-sm" /></div>
            </div>
            {error && <div role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 text-xs text-rose-400">{error}</div>}
            <Button type="submit" disabled={isLoading} className="w-full !h-10 !text-sm"><Icon name="security" />{isLoading ? 'Authenticating...' : 'Initialize Secure Session'}<Icon name="arrow" className="ml-auto" /></Button>
          </form>
          <p className="mt-5 pt-4 border-t border-[var(--border-color)] text-center font-mono text-[9px] tracking-wider text-[var(--text-muted)]">SYSTEM-OPS • AUTHORIZED ACCESS ONLY</p>
        </CardContent>
      </Card>
    </div>
  );
}
