import { HistoricalDataPoint } from '@/types/coin';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

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

  // 每3个点取一个用于显示，减少X轴拥挤
  const chartData = data
    .filter((_, index) => index % 3 === 0 || index === data.length - 1)
    .map((point) => ({
      time: formatTime(point.timestamp),
      价格: point.price,
      CVD: point.cvd ? point.cvd / 1000 : 0, // 转换为K
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground">{symbol} 价格走势</h4>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              yAxisId="left"
              stroke="#f97316"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value.toFixed(0)}K`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--primary))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="CVD"
              stroke="#f97316"
              strokeWidth={2.5}
              dot={false}
              name="CVD(K)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="价格"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              name="价格(USDT)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
