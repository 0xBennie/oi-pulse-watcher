import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { HistoricalDataPoint } from '@/types/coin';

interface TradingViewChartProps {
  data: HistoricalDataPoint[];
  symbol: string;
}

export function TradingViewChart({ data, symbol }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // 创建图表
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'hsl(var(--muted-foreground))',
      },
      grid: {
        vertLines: { color: 'hsl(var(--border) / 0.1)' },
        horzLines: { color: 'hsl(var(--border) / 0.1)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'hsl(var(--border))',
      },
      rightPriceScale: {
        borderColor: 'hsl(var(--border))',
      },
      leftPriceScale: {
        visible: true,
        borderColor: 'hsl(var(--border))',
      },
    });

    // 创建价格区域图（右侧Y轴）
    const priceSeries = chart.addAreaSeries({
      lineColor: 'hsl(var(--primary))',
      topColor: 'hsl(var(--primary) / 0.4)',
      bottomColor: 'hsl(var(--primary) / 0.0)',
      lineWidth: 2,
      priceScaleId: 'right',
    });

    // 创建CVD线图（左侧Y轴）
    const cvdSeries = chart.addLineSeries({
      color: '#f97316',
      lineWidth: 2,
      priceScaleId: 'left',
    });

    // 准备数据
    const priceData = data.map(point => ({
      time: Math.floor(point.timestamp / 1000) as any,
      value: point.price,
    }));

    const cvdData = data
      .filter(point => point.cvd !== undefined)
      .map(point => ({
        time: Math.floor(point.timestamp / 1000) as any,
        value: (point.cvd || 0) / 1000, // 转换为K
      }));

    // 设置数据
    priceSeries.setData(priceData);
    if (cvdData.length > 0) {
      cvdSeries.setData(cvdData);
    }

    // 自动缩放
    chart.timeScale().fitContent();

    // 响应式处理
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground">{symbol} 价格走势</h4>
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-primary"></div>
            <span className="text-muted-foreground">价格</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-orange-500"></div>
            <span className="text-muted-foreground">CVD(K)</span>
          </div>
        </div>
      </div>
      <div ref={chartContainerRef} className="rounded-lg border border-border/50 overflow-hidden" />
    </div>
  );
}
