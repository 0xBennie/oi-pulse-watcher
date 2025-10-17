import { MonitorDataWithHistory, AlertLevel } from '@/types/coin';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertBadge } from './AlertBadge';
import { AlertBanner } from './AlertBanner';
import { WhaleSignalBadge } from './WhaleSignalBadge';
import { TradingChart } from './TradingChart';
import { MetricItem } from './MetricItem';
import { Trash2, DollarSign, TrendingUp, Activity, Clock, BarChart3, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeCoin } from '@/utils/storage';
import { toast } from 'sonner';

interface CoinCardProps {
  data: MonitorDataWithHistory;
  rank?: number;
  onRemove: () => void;
}

export function CoinCard({ data, rank, onRemove }: CoinCardProps) {
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatOI = (oi: number) => {
    if (oi >= 1_000_000_000) return `$${(oi / 1_000_000_000).toFixed(2)}B`;
    if (oi >= 1_000_000) return `$${(oi / 1_000_000).toFixed(2)}M`;
    if (oi >= 1_000) return `$${(oi / 1_000).toFixed(2)}K`;
    return `$${oi.toFixed(0)}`;
  };

  const formatCVD = (cvd: number) => {
    const absCvd = Math.abs(cvd);
    const sign = cvd >= 0 ? '+' : '-';
    if (absCvd >= 1_000_000) return `${sign}${(absCvd / 1_000_000).toFixed(2)}M`;
    if (absCvd >= 1_000) return `${sign}${(absCvd / 1_000).toFixed(2)}K`;
    return `${sign}${absCvd.toFixed(0)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleRemove = () => {
    removeCoin(data.coin.base);
    toast.success(`已移除 ${data.coin.base}`);
    onRemove();
  };

  const getAlertColor = (level: AlertLevel) => {
    switch (level) {
      case 'STRONG_BREAKOUT':
        return 'border-green-500 bg-green-50/50 dark:bg-green-950/20';
      case 'ACCUMULATION':
        return 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20';
      case 'DISTRIBUTION_WARN':
        return 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20';
      case 'SHORT_CONFIRM':
        return 'border-red-500 bg-red-50/50 dark:bg-red-950/20';
      case 'TOP_DIVERGENCE':
        return 'border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20';
      default:
        return '';
    }
  };

  const getAlertLabel = (level: AlertLevel) => {
    switch (level) {
      case 'STRONG_BREAKOUT':
        return '🚀 强势突破';
      case 'ACCUMULATION':
        return '🧨 庄家建仓';
      case 'DISTRIBUTION_WARN':
        return '😨 出货警告';
      case 'SHORT_CONFIRM':
        return '💥 空头确认';
      case 'TOP_DIVERGENCE':
        return '📈 顶部背离';
      default:
        return '';
    }
  };

  const borderColor = {
    STRONG_BREAKOUT: 'border-l-green-500',
    ACCUMULATION: 'border-l-blue-500',
    DISTRIBUTION_WARN: 'border-l-orange-500',
    SHORT_CONFIRM: 'border-l-red-500',
    TOP_DIVERGENCE: 'border-l-yellow-500',
    NONE: 'border-l-transparent',
  }[data.alertLevel];

  return (
    <Card className={cn('hover:shadow-lg transition-shadow border-l-4', borderColor)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{data.coin.base}</h3>
            {rank && rank <= 3 && (
              <Badge variant="secondary" className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 text-yellow-600 border-yellow-500/50">
                #{rank}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{data.coin.binance}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <AlertBanner
          level={data.alertLevel}
          oiChange={data.cvdChangePercent5m}
          priceChange5m={data.priceChangePercent5m}
        />

        {data.whaleSignal && <WhaleSignalBadge signal={data.whaleSignal} />}

        {data.history.length > 1 && (
          <TradingChart data={data.history} symbol={data.coin.base} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <MetricItem
            icon={<DollarSign className="w-4 h-4" />}
            label="当前价格"
            value={`$${formatPrice(data.price)}`}
          />
          <MetricItem
            icon={<TrendingUp className="w-4 h-4" />}
            label="24h涨幅"
            value={`${data.priceChangePercent24h > 0 ? '+' : ''}${data.priceChangePercent24h.toFixed(2)}%`}
            trend={data.priceChangePercent24h > 0 ? 'up' : 'down'}
          />
          <MetricItem
            icon={<Activity className="w-4 h-4" />}
            label="5m涨幅"
            value={`${data.priceChangePercent5m > 0 ? '+' : ''}${data.priceChangePercent5m.toFixed(2)}%`}
            trend={data.priceChangePercent5m > 0 ? 'up' : 'down'}
          />
          <MetricItem
            icon={data.cvd >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            label="CVD"
            value={formatCVD(data.cvd)}
            trend={data.cvd >= 0 ? 'up' : 'down'}
          />
          <MetricItem
            icon={<Activity className="w-4 h-4" />}
            label="5m CVD变化"
            value={`${data.cvdChangePercent5m > 0 ? '+' : ''}${data.cvdChangePercent5m.toFixed(2)}%`}
            trend={data.cvdChangePercent5m > 0 ? 'up' : 'down'}
          />
          <MetricItem
            icon={<Clock className="w-4 h-4" />}
            label="更新时间"
            value={formatTime(data.lastUpdate)}
          />
        </div>
      </CardContent>

      <CardFooter className="pt-0 flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          币安永续
        </Badge>
        {data.alertLevel !== 'NONE' && (
          <div className="px-3 py-1 rounded-full text-sm font-medium">
            {getAlertLabel(data.alertLevel)}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
