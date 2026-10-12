import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'ops-card border border-[var(--border-color)] bg-[var(--panel-alt)] text-[var(--text-main)] transition-colors theme-card',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'ops-card-header flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--panel-alt)] theme-header',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn(
        'ops-card-title',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('ops-card-content', className)} {...props}>
      {children}
    </div>
  );
}
