import { useState, useEffect, useCallback } from 'react';
import { MonitorData, Coin, AlertLevel } from '@/types/coin';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';
import { getStoredCoins } from '@/utils/storage';

interface PriceHistory {
  [symbol: string]: { price: number; timestamp: number };
}

export function useCoinMonitor(refreshInterval: number = 60000) {
  const [monitorData, setMonitorData] = useState<MonitorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});

  const determineAlertLevel = (oiChange: number, priceChange5m: number): AlertLevel => {
    if (oiChange >= 10 && priceChange5m >= 2) return 'STRONG';
    if (oiChange >= 8 && priceChange5m >= 1.5) return 'MEDIUM';
    if (oiChange >= 5 || priceChange5m >= 1) return 'WEAK';
    return 'NONE';
  };

  const fetchMonitorData = useCallback(async () => {
    const currentCoins = getStoredCoins();
    setCoins(currentCoins);

    const results = await Promise.all(
      currentCoins.map(async (coin) => {
        const [priceData, oiHistory] = await Promise.all([
          fetchPriceData(coin.binance),
          fetchOIHistory(coin.binance),
        ]);

        if (!priceData) {
          return null;
        }

        const currentPrice = priceData.price;
        const currentTimestamp = Date.now();

        // Calculate 5m price change
        let priceChangePercent5m = 0;
        const lastPriceRecord = priceHistory[coin.binance];
        if (lastPriceRecord && currentTimestamp - lastPriceRecord.timestamp <= 300000) {
          priceChangePercent5m = calculatePercentageChange(currentPrice, lastPriceRecord.price);
        }

        // Update price history
        setPriceHistory(prev => ({
          ...prev,
          [coin.binance]: { price: currentPrice, timestamp: currentTimestamp },
        }));

        // Calculate OI change
        let openInterestChangePercent5m = 0;
        let currentOI = 0;

        if (oiHistory.length >= 2) {
          const latest = oiHistory[oiHistory.length - 1];
          const previous = oiHistory[0];
          currentOI = latest.sumOpenInterestValue;
          openInterestChangePercent5m = calculatePercentageChange(
            latest.sumOpenInterestValue,
            previous.sumOpenInterestValue
          );
        } else if (oiHistory.length === 1) {
          currentOI = oiHistory[0].sumOpenInterestValue;
        }

        const alertLevel = determineAlertLevel(
          Math.abs(openInterestChangePercent5m),
          Math.abs(priceChangePercent5m)
        );

        return {
          coin,
          price: currentPrice,
          priceChangePercent24h: priceData.priceChangePercent24h,
          priceChangePercent5m,
          openInterest: currentOI,
          openInterestChangePercent5m,
          alertLevel,
          lastUpdate: currentTimestamp,
        };
      })
    );

    const validResults = results.filter((r): r is MonitorData => r !== null);
    setMonitorData(validResults);
    setLastUpdate(new Date());
    setLoading(false);
  }, [priceHistory]);

  useEffect(() => {
    fetchMonitorData();
    const interval = setInterval(fetchMonitorData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchMonitorData();
  }, [fetchMonitorData]);

  return { monitorData, loading, lastUpdate, coins, refresh };
}
