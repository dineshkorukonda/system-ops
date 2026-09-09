import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({ variant = 'neutral', className, children, ...props }) {
  const variantStyles = {
    neutral: 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border)]',
    ok: 'bg-[var(--success-muted)] text-[var(--success)] border-transparent',
    warn: 'bg-[var(--warning-muted)] text-[var(--warning)] border-transparent',
    err: 'bg-[var(--danger-muted)] text-[var(--danger)] border-transparent',
    blue: 'bg-[var(--accent-muted)] text-[var(--accent)] border-transparent',
    outline: 'border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
        variantStyles[variant] || variantStyles.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
