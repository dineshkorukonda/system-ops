import React from 'react';
import { cn } from '../../lib/utils';

export function Sparkline({
  data = [],
  width = 200,
  height = 40,
  strokeColor = '#3b82f6',
  className,
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={cn(
          'h-[40px] w-full flex items-center justify-center text-xs text-[var(--text-muted)]',
          className
        )}
      >
        Collecting data…
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
  const firstX = padding;
  const lastX = width - padding;
  const areaData = `M ${points[0]} L ${points.join(' L ')} L ${lastX},${height} L ${firstX},${height} Z`;
  const gradId = `spark-grad-${strokeColor.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full overflow-visible', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaData} fill={`url(#${gradId})`} />
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
