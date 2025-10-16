import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricItemProps {
  icon: ReactNode;
  label: string;
  value: string | ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function MetricItem({ icon, label, value, trend, className }: MetricItemProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-sm font-semibold font-mono-number',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-danger',
            !trend && 'text-foreground'
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
