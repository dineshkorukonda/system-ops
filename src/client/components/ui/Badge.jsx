import React from 'react';
import { cn } from '../../lib/utils';
export function Badge({variant='neutral',className,children,...props}) {
 return <span className={cn('ops-badge',`badge-${variant}`,className)} {...props}>{children}</span>;
}
