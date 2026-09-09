import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({ variant = 'default', className, children, ...props }) {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    outline: 'text-foreground border-border',
    muted: 'border-transparent bg-muted text-muted-foreground',
    neutral: 'border-transparent bg-muted text-muted-foreground',
    ok: 'border-transparent bg-secondary text-secondary-foreground',
    warn: 'border border-border text-foreground',
    err: 'border border-foreground text-foreground',
    blue: 'border-transparent bg-muted text-foreground',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
