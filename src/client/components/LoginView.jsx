import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-info/5 pointer-events-none" />
      <Card className="relative w-full max-w-sm border-primary/20 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-sm">
            {siteName.charAt(0).toUpperCase()}
          </div>
          <CardTitle>{siteName}</CardTitle>
          <CardDescription>Sign in to your operations console</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
