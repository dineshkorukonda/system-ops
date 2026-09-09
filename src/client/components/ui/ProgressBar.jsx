import React from 'react';
import { cn } from '../../lib/utils';

export function ProgressBar({ value = 0, variant = 'default', className }) {
  const clamped = Math.min(Math.max(value, 0), 100);

  const variantColors = {
    default: 'bg-[var(--accent)]',
    green: 'bg-[var(--success)]',
    warn: 'bg-[var(--warning)]',
    err: 'bg-[var(--danger)]',
    blue: 'bg-[var(--accent)]',
  };

  const activeColor =
    variant === 'auto'
      ? clamped > 85
        ? variantColors.err
        : clamped > 70
        ? variantColors.warn
        : variantColors.green
      : variantColors[variant] || variantColors.default;

  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]',
        className
      )}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', activeColor)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
