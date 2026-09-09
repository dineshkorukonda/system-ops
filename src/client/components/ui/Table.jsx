import React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, children, ...props }) {
  return (
    <div className="ops-table-wrap">
      <table className={cn('ops-table', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, className }) {
  return <tr className={className}>{children}</tr>;
}

export function TableHeader({ children, className }) {
  return <th className={className}>{children}</th>;
}

export function TableCell({ children, className, colSpan }) {
  return (
    <td className={cn('text-[var(--text-secondary)]', className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="ops-empty">
        {children}
      </td>
    </tr>
  );
}
