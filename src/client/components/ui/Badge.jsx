import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({ variant = 'neutral', className, children, ...props }) {
  const variantStyles = {
    neutral: 'bg-[#141414] text-neutral-300 border-[#262626]',
    ok: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50',
    warn: 'bg-amber-950/40 text-amber-400 border-amber-800/50',
    err: 'bg-rose-950/40 text-rose-400 border-rose-800/50',
    blue: 'bg-blue-950/40 text-blue-400 border-blue-800/50',
    outline: 'border border-neutral-700 text-neutral-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider border',
        variantStyles[variant] || variantStyles.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
