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
      document.title = branding.pageTitle || `${branding.siteName} | Sign in`;
      return;
    }
    fetch('/api/v2/settings/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setLocalBranding(data);
          document.title = data.pageTitle || `${data.siteName} | Sign in`;
        }
      })
      .catch(() => {});
  }, [branding]);

  const siteName = localBranding?.siteName || 'system-ops';
  const siteSubtitle = localBranding?.siteSubtitle || 'Operations Console';

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
    } catch {
      setError('Unable to connect. Check that the service is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center ops-app p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{siteName}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{siteSubtitle}</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="ops-label block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoFocus
                  className="ops-input w-full h-10 px-3 text-sm"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/20 bg-[var(--danger-muted)] p-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Secured session · Loopback binding recommended
        </p>
      </div>
    </div>
  );
}
