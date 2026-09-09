import React, { useState, useEffect } from 'react';

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
      if (res.ok && data.success) onLoginSuccess();
      else setError(data.error || 'Invalid password');
    } catch {
      setError('Unable to connect.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="shell flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] text-lg font-semibold mb-4">
            {siteName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{siteName}</h1>
          <p className="mt-1 text-[var(--fg-muted)]">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--fg-muted)] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-[var(--fg)] text-[var(--bg)] font-medium text-sm hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
