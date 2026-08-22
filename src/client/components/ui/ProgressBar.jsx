import React from 'react';
import { cn } from '../../lib/utils';

export function ProgressBar({ value = 0, variant = 'default', className }) {
  const clamped = Math.min(Math.max(value, 0), 100);

  const variantColors = {
    default: 'bg-white',
    green: 'bg-emerald-500',
    warn: 'bg-amber-500',
    err: 'bg-rose-500',
    blue: 'bg-blue-500',
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
        'h-1.5 w-full overflow-hidden rounded-full bg-[#1c1c1c]',
        className
      )}
    >
      <div
        className={cn('h-full transition-all duration-500 ease-out', activeColor)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
