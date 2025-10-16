import { WhaleSignal } from '@/types/coin';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Waves } from 'lucide-react';

interface WhaleSignalBadgeProps {
  signal: WhaleSignal;
  className?: string;
}

export function WhaleSignalBadge({ signal, className }: WhaleSignalBadgeProps) {
  const config = {
    WHALE_BUY: {
      bg: 'bg-gradient-to-r from-green-500/20 to-green-400/10',
      border: 'border-l-4 border-green-500',
      text: 'text-green-500',
      icon: TrendingUp,
      emoji: '🐋',
    },
    WHALE_SELL: {
      bg: 'bg-gradient-to-r from-red-500/20 to-red-400/10',
      border: 'border-l-4 border-red-500',
      text: 'text-red-500',
      icon: TrendingDown,
      emoji: '🐋',
    },
    WASH_TRADING: {
      bg: 'bg-gradient-to-r from-yellow-500/20 to-yellow-400/10',
      border: 'border-l-4 border-yellow-500',
      text: 'text-yellow-500',
      icon: Waves,
      emoji: '🌊',
    },
  };

  const { bg, border, text, icon: Icon } = config[signal.type];

  return (
    <div
      className={cn(
        'p-3 rounded-lg flex items-start gap-2.5 mt-2',
        bg,
        border,
        className
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', text)} />
      <div className="flex-1">
        <p className="text-sm leading-relaxed text-foreground/90 mb-1">
          {signal.description}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>置信度: <span className={cn('font-semibold', text)}>{signal.confidence.toFixed(0)}%</span></span>
          {signal.oiVolumeRatio && (
            <span>ΔOI/Vol: <span className="font-mono">{(signal.oiVolumeRatio * 100).toFixed(1)}%</span></span>
          )}
        </div>
      </div>
    </div>
  );
}
