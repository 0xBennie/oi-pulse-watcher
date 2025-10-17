import { useState } from 'react';
import { HistoricalDataPoint } from '@/types/coin';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface TradingChartProps {
  data: HistoricalDataPoint[];
  symbol: string;
}

type TimeFrame = '3m' | '15m' | '1h' | '4h';

export function TradingChart({ data, symbol }: TradingChartProps) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('15m');

  const formatTime = (timestamp: number, frame: TimeFrame) => {
    const date = new Date(timestamp);
    if (frame === '3m' || frame === '15m') {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (frame === '1h') {
      return date.toLocaleString('zh-CN', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit'
      }).replace(/\//g, '-').replace(/\s/g, ' ');
    } else {
      return date.toLocaleString('zh-CN', { 
        month: '2-digit', 
        day: '2-digit'
      }).replace(/\//g, '-');
    }
  };

  // 根据时间周期聚合数据
  const aggregateData = (rawData: HistoricalDataPoint[], frame: TimeFrame) => {
    if (rawData.length === 0) return [];
    
    // 根据时间框架确定聚合间隔
    const intervalMinutes = frame === '3m' ? 1 : frame === '15m' ? 5 : frame === '1h' ? 20 : 80;
    const intervalMs = intervalMinutes * 60 * 1000;
    
    const result: HistoricalDataPoint[] = [];
    let currentBucket: HistoricalDataPoint[] = [];
    let bucketStartTime = rawData[0].timestamp;
    
    for (const point of rawData) {
      // 如果当前点超出了bucket的时间范围，保存当前bucket并开始新bucket
      if (point.timestamp - bucketStartTime >= intervalMs) {
        if (currentBucket.length > 0) {
          // 使用最后一个点作为这个时间段的代表
          result.push(currentBucket[currentBucket.length - 1]);
        }
        currentBucket = [point];
        bucketStartTime = point.timestamp;
      } else {
        currentBucket.push(point);
      }
    }
    
    // 添加最后一个bucket
    if (currentBucket.length > 0) {
      result.push(currentBucket[currentBucket.length - 1]);
    }
    
    return result;
  };

  const aggregatedData = aggregateData(data, timeFrame);

  const chartData = aggregatedData.map((point) => ({
    time: formatTime(point.timestamp, timeFrame),
    价格: point.price,
    CVD: point.cvd / 1000, // 转换为K单位
    fullTime: point.timestamp,
  }));

  if (chartData.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-card/50 rounded-xl border border-border/50">
        <p className="text-muted-foreground">暂无数据，正在收集...</p>
      </div>
    );
  }

  // 计算CVD的最大最小值用于颜色渐变和Y轴范围
  const cvdValues = chartData.map(d => d.CVD);
  const maxCVD = Math.max(...cvdValues);
  const minCVD = Math.min(...cvdValues);
  
  // 动态计算CVD的Y轴范围，增加10%的边距让曲线更清晰
  const cvdRange = maxCVD - minCVD;
  const cvdPadding = cvdRange * 0.1;
  const cvdDomain = [
    Math.floor(minCVD - cvdPadding),
    Math.ceil(maxCVD + cvdPadding)
  ];

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-bold text-foreground">{symbol}</h4>
          <p className="text-xs text-muted-foreground mt-1">价格走势与资金流向分析</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            {(['3m', '15m', '1h', '4h'] as TimeFrame[]).map((frame) => (
              <Button
                key={frame}
                variant={timeFrame === frame ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeFrame(frame)}
                className={cn(
                  "h-7 px-3 text-xs font-medium transition-all",
                  timeFrame === frame && "shadow-md"
                )}
              >
                {frame}
              </Button>
            ))}
          </div>
          <div className="flex gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-gradient-to-r from-primary via-primary to-primary/30 rounded-full"></div>
              <span className="text-muted-foreground">价格</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full"></div>
              <span className="text-muted-foreground">CVD</span>
            </div>
          </div>
        </div>
      </div>
      <div className="h-96 w-full bg-gradient-to-br from-card via-card/95 to-card/80 rounded-xl border border-border/50 shadow-lg p-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="cvdGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.9} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
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
              interval={Math.floor(chartData.length / 8)} // 显示约8个刻度
              minTickGap={30}
            />
            <YAxis
              yAxisId="left"
              stroke="#10b981"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}K`}
              width={50}
              domain={cvdDomain}
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
              strokeWidth={3.5}
              dot={false}
              activeDot={{ 
                r: 7, 
                fill: 'hsl(var(--primary))', 
                strokeWidth: 3, 
                stroke: 'hsl(var(--background))',
                filter: 'url(#glow)'
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="CVD"
              stroke="url(#cvdGradient)"
              strokeWidth={3}
              dot={false}
              activeDot={{ 
                r: 7, 
                strokeWidth: 3, 
                stroke: 'hsl(var(--background))',
                filter: 'url(#glow)'
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
