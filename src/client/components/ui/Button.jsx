import React from 'react';
import { cn } from '../../lib/utils';

export function Button({
  variant = 'default',
  size = 'default',
  className,
  disabled,
  children,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer';

  const variants = {
    default:
      'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm',
    secondary:
      'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-muted)]',
    outline:
      'border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
    ghost:
      'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
    danger:
      'border border-transparent bg-[var(--danger-muted)] text-[var(--danger)] hover:opacity-90',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    default: 'h-9 px-4 text-sm',
    lg: 'h-10 px-5 text-sm',
    icon: 'h-9 w-9',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
