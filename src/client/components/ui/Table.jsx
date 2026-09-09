import React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, ...props }) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b border-[var(--border)]', className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn('border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-raised)]', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn('h-10 px-4 text-left align-middle font-medium text-[var(--text-muted)]', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return (
    <td className={cn('p-4 align-middle text-[var(--text-primary)]', className)} {...props} />
  );
}

export function TableEmpty({ colSpan, children }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-[var(--text-muted)]">
        {children}
      </TableCell>
    </TableRow>
  );
}
