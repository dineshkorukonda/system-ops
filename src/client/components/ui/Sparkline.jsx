import React from 'react';
import { cn } from '../../lib/utils';

export function Sparkline({
  data = [],
  width = 200,
  height = 40,
  className,
}) {
  if (!data || data.length < 2) {
    return (
      <div className={cn('flex h-10 items-center text-xs text-muted-foreground', className)}>
        Collecting…
      </div>
    );
  }

  const padding = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max === min ? 1 : max - min;
  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathData = `M ${points.join(' L ')}`;
  const gradId = 'spark-grad-mono';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M ${points[0]} L ${points.join(' L ')} L ${width - padding},${height} L ${padding},${height} Z`}
        fill={`url(#${gradId})`}
        className="text-foreground"
      />
      <path d={pathData} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground" />
    </svg>
  );
}
