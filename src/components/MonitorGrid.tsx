import { useState } from 'react';
import { MonitorDataWithHistory } from '@/types/coin';
import { CoinCard } from './CoinCard';

interface MonitorGridProps {
  data: MonitorDataWithHistory[];
  onCoinRemoved: () => void;
}

export function MonitorGrid({ data, onCoinRemoved }: MonitorGridProps) {
  // Sort by alert level (STRONG > MEDIUM > WEAK > NONE)
  const sortedData = [...data].sort((a, b) => {
    const alertOrder = { STRONG: 3, MEDIUM: 2, WEAK: 1, NONE: 0 };
    return alertOrder[b.alertLevel] - alertOrder[a.alertLevel];
  });

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-2">
        <p className="text-lg">暂无监控币种</p>
        <p className="text-sm">点击"添加币种"开始监控</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sortedData.map((item, index) => (
        <CoinCard
          key={item.coin.base}
          data={item}
          rank={item.alertLevel !== 'NONE' && index < 3 ? index + 1 : undefined}
          onRemove={onCoinRemoved}
        />
      ))}
    </div>
  );
}
