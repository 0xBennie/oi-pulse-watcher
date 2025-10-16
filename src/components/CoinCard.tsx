import { MonitorDataWithHistory } from '@/types/coin';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertBadge } from './AlertBadge';
import { AlertBanner } from './AlertBanner';
import { MetricItem } from './MetricItem';
import { Trash2, DollarSign, TrendingUp, Activity, Clock, BarChart3, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeCoin } from '@/utils/storage';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleRemove = () => {
    try {
      removeCoin(data.coin.base);
      toast.success(`已移除 ${data.coin.base}`);
      onRemove();
    } catch (error) {
      toast.error('移除失败');
    }
  };

  const chartData = data.history.map(point => ({
    time: formatTime(point.timestamp),
    price: point.price,
    cvd: point.cvd ? point.cvd / 1_000 : 0, // Convert to thousands for better scale
  }));

  const borderColor = {
    STRONG: 'border-l-alert-strong',
    MEDIUM: 'border-l-alert-medium',
    WEAK: 'border-l-alert-weak',
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

        {chartData.length > 1 && (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#f97316' }}
                  stroke="#f97316"
                  label={{ value: 'CVD (K)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#f97316' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#a855f7' }}
                  stroke="#a855f7"
                  label={{ value: '价格', angle: 90, position: 'insideRight', fontSize: 10, fill: '#a855f7' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cvd"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={false}
                  name="CVD(K)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="price"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="价格"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
        <AlertBadge level={data.alertLevel} />
      </CardFooter>
    </Card>
  );
}
