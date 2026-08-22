import React, { useState } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';

export function LoginView({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-black p-4 theme-bg">
      <div className="w-full max-w-sm">
        <Card className="border-[#262626] bg-[#080808] shadow-2xl">
          <div className="p-6 text-center space-y-1.5 border-b border-[#1a1a1a] theme-header">
            <h2 className="font-mono text-base font-bold tracking-tight text-white">
              SYSTEM-OPS
            </h2>
            <p className="text-xs text-neutral-400">
              Operations Console Authentication
            </p>
          </div>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Access Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter console password..."
                  required
                  autoFocus
                  className="w-full h-9 rounded border border-[#262626] bg-[#121212] px-3 font-mono text-xs text-white placeholder-neutral-600 outline-none hover:border-neutral-600 focus:border-neutral-300 theme-input"
                />
              </div>

              {error && (
                <div className="rounded border border-rose-900/50 bg-rose-950/30 p-2.5 font-mono text-[11px] text-rose-400">
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

          <div className="flex items-center justify-between border-t border-[#1a1a1a] bg-[#050505] px-6 py-3 font-mono text-[10px] text-neutral-500 theme-header">
            <span>BINDING: 127.0.0.1:9080</span>
            <span className="text-emerald-500 font-semibold">ENCRYPTED SESSION</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
