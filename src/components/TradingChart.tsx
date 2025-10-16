import { HistoricalDataPoint } from '@/types/coin';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

interface TradingChartProps {
  data: HistoricalDataPoint[];
  symbol: string;
}

export function TradingChart({ data, symbol }: TradingChartProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // 每3个点取一个
  const chartData = data
    .filter((_, index) => index % 3 === 0 || index === data.length - 1)
    .map((point) => ({
      time: formatTime(point.timestamp),
      价格: point.price,
      CVD: point.cvd ? point.cvd / 1000 : 0,
      fullTime: point.timestamp,
    }));

  if (chartData.length === 0) return null;

  // 计算CVD的最大最小值用于颜色渐变
  const cvdValues = chartData.map(d => d.CVD);
  const maxCVD = Math.max(...cvdValues);
  const minCVD = Math.min(...cvdValues);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-xl">
          <p className="text-xs text-muted-foreground mb-2">{payload[0].payload.time}</p>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary"></span>
              价格: <span className="font-mono">${payload[0].value.toFixed(4)}</span>
            </p>
            {payload[1] && (
              <p className={cn(
                "text-sm font-semibold flex items-center gap-2",
                payload[1].value >= 0 ? "text-green-500" : "text-red-500"
              )}>
                <span className={cn(
                  "w-3 h-3 rounded-full",
                  payload[1].value >= 0 ? "bg-green-500" : "bg-red-500"
                )}></span>
                CVD: <span className="font-mono">{payload[1].value >= 0 ? '+' : ''}{payload[1].value.toFixed(1)}K</span>
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-base font-semibold text-foreground">{symbol}</h4>
          <p className="text-xs text-muted-foreground">价格与资金流向</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gradient-to-r from-primary to-primary/50"></div>
            <span className="text-muted-foreground">价格</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gradient-to-r from-green-500 to-red-500"></div>
            <span className="text-muted-foreground">CVD</span>
          </div>
        </div>
      </div>
      <div className="h-80 w-full bg-gradient-to-b from-card/50 to-transparent rounded-xl border border-border/50 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="cvdGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))" 
              opacity={0.2}
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              yAxisId="left"
              stroke="#10b981"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}K`}
              width={50}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--primary))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value.toFixed(4)}`}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="价格"
              stroke="url(#priceGradient)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: '#fff' }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="CVD"
              stroke="url(#cvdGradient)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
