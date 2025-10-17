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
    const cvdDirection = oiChange > 0 ? '上涨' : '下跌';
    const priceDirection = priceChange5m > 0 ? '上涨' : '下跌';

    switch (level) {
      case 'STRONG_BREAKOUT':
        return `🚀 强势突破！CVD${cvdDirection}${Math.abs(oiChange).toFixed(2)}%，价格${priceDirection}${Math.abs(priceChange5m).toFixed(2)}%，多头真实进场`;
      case 'ACCUMULATION':
        return `🧨 庄家建仓信号！CVD大幅${cvdDirection}但价格横盘，资金在悄悄吸筹`;
      case 'DISTRIBUTION_WARN':
        return `😨 出货警告！CVD${cvdDirection}但价格上涨，主力可能边拉边出`;
      case 'SHORT_CONFIRM':
        return `💥 空头确认！CVD和价格双双下跌，空头主导趋势`;
      case 'TOP_DIVERGENCE':
        return `📈 顶部背离！价格创新高但CVD未创新高，警惕假突破`;
      default:
        return '';
    }
  };

  const config = {
    STRONG_BREAKOUT: {
      title: '🚀 强势突破',
      bgClass: 'bg-green-50/80 dark:bg-green-950/40 border-green-200 dark:border-green-800',
      textClass: 'text-green-900 dark:text-green-100',
    },
    ACCUMULATION: {
      title: '🧨 庄家建仓',
      bgClass: 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
      textClass: 'text-blue-900 dark:text-blue-100',
    },
    DISTRIBUTION_WARN: {
      title: '😨 出货警告',
      bgClass: 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
      textClass: 'text-orange-900 dark:text-orange-100',
    },
    SHORT_CONFIRM: {
      title: '💥 空头确认',
      bgClass: 'bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-800',
      textClass: 'text-red-900 dark:text-red-100',
    },
    TOP_DIVERGENCE: {
      title: '📈 顶部背离',
      bgClass: 'bg-yellow-50/80 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800',
      textClass: 'text-yellow-900 dark:text-yellow-100',
    },
  }[level] || {
    title: '',
    bgClass: '',
    textClass: '',
  };

  const { bgClass, textClass } = config;

  return (
    <div className={cn('p-3 rounded-lg border-l-4', bgClass, className)}>
      <p className={cn('text-sm leading-relaxed', textClass)}>
        {getAnalysisText()}
      </p>
    </div>
  );
}
