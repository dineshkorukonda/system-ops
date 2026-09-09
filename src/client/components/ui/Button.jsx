import React from 'react';
import { cn } from '../../lib/utils';

export function Button({
  variant = 'default',
  size = 'default',
  className,
  disabled,
  children,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-40 select-none cursor-pointer';

  const variants = {
    default:
      'bg-white text-black hover:bg-neutral-200 font-semibold',
    secondary:
      'bg-[#141414] text-white border border-[#262626] hover:bg-[#1f1f1f]',
    outline:
      'border border-[#262626] bg-transparent text-neutral-300 hover:bg-[#141414] hover:text-white',
    ghost:
      'bg-transparent text-neutral-400 hover:bg-[#141414] hover:text-white',
  };

  const sizes = {
    sm: 'h-7 px-2.5 text-xs',
    default: 'h-8 px-3.5 text-xs',
    lg: 'h-10 px-5 text-sm',
    icon: 'h-8 w-8',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
