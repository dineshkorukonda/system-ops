import React from 'react';
import { cn } from '../../lib/utils';

export function ProgressBar({ value = 0, className }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const tone = clamped >= 90 ? 'bg-destructive' : clamped >= 75 ? 'bg-warning' : 'bg-primary';

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', tone)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
