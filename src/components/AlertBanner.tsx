import { AlertLevel } from '@/types/coin';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface AlertBannerProps {
  level: AlertLevel;
  oiChange: number;
  priceChange5m: number;
  className?: string;
}

export function AlertBanner({ level, oiChange, priceChange5m, className }: AlertBannerProps) {
  if (level === 'NONE') return null;

  const getAnalysisText = () => {
    const oiDirection = oiChange > 0 ? '增加' : '减少';
    const priceDirection = priceChange5m > 0 ? '上涨' : '下跌';
    const capitalFlow = oiChange > 0 ? '流入' : '流出';

    if (level === 'STRONG') {
      return `⚠️ 强烈异动！持仓量在5分钟内${oiDirection}了${Math.abs(oiChange).toFixed(2)}%，价格${priceDirection}${Math.abs(priceChange5m).toFixed(2)}%，资金正在大量${capitalFlow}`;
    }
    
    if (level === 'MEDIUM') {
      return `📊 中等异动：持仓量${oiDirection}${Math.abs(oiChange).toFixed(2)}%，价格${priceDirection}${Math.abs(priceChange5m).toFixed(2)}%，需要关注`;
    }
    
    return `💡 弱信号：持仓量或价格出现波动，建议观察`;
  };

  const config = {
    STRONG: {
      bg: 'bg-gradient-to-r from-alert-strong/20 to-alert-strong/10',
      border: 'border-l-4 border-alert-strong',
      text: 'text-alert-strong',
      icon: AlertTriangle,
    },
    MEDIUM: {
      bg: 'bg-gradient-to-r from-alert-medium/20 to-alert-medium/10',
      border: 'border-l-4 border-alert-medium',
      text: 'text-alert-medium',
      icon: oiChange > 0 ? TrendingUp : TrendingDown,
    },
    WEAK: {
      bg: 'bg-gradient-to-r from-alert-weak/20 to-alert-weak/10',
      border: 'border-l-4 border-alert-weak',
      text: 'text-alert-weak',
      icon: oiChange > 0 ? TrendingUp : TrendingDown,
    },
  };

  const { bg, border, text, icon: Icon } = config[level];

  return (
    <div
      className={cn(
        'p-3 rounded-lg flex items-start gap-2.5',
        bg,
        border,
        className
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', text)} />
      <p className="text-sm leading-relaxed text-foreground/90">
        {getAnalysisText()}
      </p>
    </div>
  );
}
