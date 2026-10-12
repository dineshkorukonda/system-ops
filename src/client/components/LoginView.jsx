import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-main)] p-4 theme-bg">
      <div className="w-full max-w-sm">
        <Card className="border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl">
          <div className="p-6 text-center space-y-1.5 border-b border-[var(--border-color)] theme-header">
            <h2 className="font-mono text-base font-bold tracking-tight text-[var(--text-primary)]">
              {siteName.toUpperCase()}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {siteSubtitle}
            </p>
          </div>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Access Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter console password..."
                  required
                  autoFocus
                  className="w-full h-9 rounded border border-[var(--border-color)] bg-[var(--card-bg)] px-3 font-mono text-xs text-[var(--text-primary)] placeholder-neutral-600 outline-none hover:border-neutral-600 focus:border-neutral-300 theme-input"
                />
              </div>

              {error && (
                <div className="rounded border border-rose-900/50 bg-rose-950/30 p-2.5 font-mono text-xs text-[var(--error)]">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-9 font-mono text-xs font-semibold"
              >
                {isLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
              </Button>
            </form>
          </CardContent>

          <div className="flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--surface-muted)] px-6 py-3 font-mono text-[10px] text-[var(--text-muted)] theme-header">
            <span>BINDING: 127.0.0.1:9080</span>
            <span className="text-[var(--success)] font-semibold">ENCRYPTED SESSION</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
