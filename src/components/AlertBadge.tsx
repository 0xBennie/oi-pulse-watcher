import { AlertLevel } from '@/types/coin';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface AlertBadgeProps {
  level: AlertLevel;
  className?: string;
}

export function AlertBadge({ level, className }: AlertBadgeProps) {
  if (level === 'NONE') {
    return <span className={cn('text-muted-foreground text-sm', className)}>-</span>;
  }

  const config = {
    STRONG: {
      bg: 'bg-alert-strong/10',
      text: 'text-alert-strong',
      border: 'border-alert-strong/50',
      icon: AlertTriangle,
      label: 'STRONG',
    },
    MEDIUM: {
      bg: 'bg-alert-medium/10',
      text: 'text-alert-medium',
      border: 'border-alert-medium/50',
      icon: AlertCircle,
      label: 'MEDIUM',
    },
    WEAK: {
      bg: 'bg-alert-weak/10',
      text: 'text-alert-weak',
      border: 'border-alert-weak/50',
      icon: Info,
      label: 'WEAK',
    },
  };

  const { bg, text, border, icon: Icon, label } = config[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border',
        bg,
        text,
        border,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
