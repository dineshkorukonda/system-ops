import React from 'react';
import { cn } from '../../lib/utils';

export function ProgressBar({ value = 0, className }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
