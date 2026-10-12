import React from 'react';
import { cn } from '../../lib/utils';
export function Button({variant='default',size='default',className,disabled,children,...props}) {
 return <button className={cn('ops-button',`button-${variant}`,`button-size-${size}`,className)} disabled={disabled} {...props}>{children}</button>;
}
