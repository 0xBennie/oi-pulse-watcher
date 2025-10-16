import { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint } from '@/types/coin';
import { getStoredCoins } from '@/utils/storage';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';

interface PriceHistory {
  [symbol: string]: { price: number; timestamp: number };
}

interface HistoricalStorage {
  [symbol: string]: HistoricalDataPoint[];
}

const MAX_HISTORY_POINTS = 180; // 30 minutes at 10 second intervals

export function useCoinMonitor(refreshInterval: number = 60000) {
  const [monitorData, setMonitorData] = useState<MonitorDataWithHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coins, setCoins] = useState(getStoredCoins());
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const historicalDataRef = useRef<HistoricalStorage>({});

  const determineAlertLevel = (oiChange: number, priceChange5m: number): AlertLevel => {
    const absOiChange = Math.abs(oiChange);
    const absPriceChange = Math.abs(priceChange5m);

    if (absOiChange >= 10 && absPriceChange >= 2) {
      return 'STRONG';
    }
    if (absOiChange >= 8 && absPriceChange >= 1.5) {
      return 'MEDIUM';
    }
    if (absOiChange >= 5 || absPriceChange >= 1) {
      return 'WEAK';
    }
    return 'NONE';
  };

  const fetchMonitorData = useCallback(async () => {
    const storedCoins = getStoredCoins();
    setCoins(storedCoins);

    if (storedCoins.length === 0) {
      setMonitorData([]);
      return;
    }

    const results = await Promise.all(
      storedCoins.map(async (coin) => {
        const [priceData, oiHistory] = await Promise.all([
          fetchPriceData(coin.binance),
          fetchOIHistory(coin.binance),
        ]);

        if (!priceData || oiHistory.length === 0) {
          return null;
        }

        // Calculate 5m price change
        const currentPrice = priceData.price;
        const lastKnownPrice = priceHistory[coin.base]?.price;
        const priceChangePercent5m = lastKnownPrice
          ? calculatePercentageChange(currentPrice, lastKnownPrice)
          : 0;

        // Update price history
        setPriceHistory((prev) => ({
          ...prev,
          [coin.base]: { price: currentPrice, timestamp: Date.now() },
        }));

        // Calculate OI change
        const currentOI = oiHistory[oiHistory.length - 1];
        const previousOI = oiHistory[0];
        const oiChangePercent = calculatePercentageChange(
          currentOI.sumOpenInterestValue,
          previousOI.sumOpenInterestValue
        );

        const alertLevel = determineAlertLevel(oiChangePercent, priceChangePercent5m);

        // Update historical data
        const timestamp = Date.now();
        const newDataPoint: HistoricalDataPoint = {
          timestamp,
          price: currentPrice,
          openInterest: currentOI.sumOpenInterestValue,
        };

        // Get existing history or create new array
        const existingHistory = historicalDataRef.current[coin.base] || [];
        const updatedHistory = [...existingHistory, newDataPoint];

        // Keep only last MAX_HISTORY_POINTS points
        if (updatedHistory.length > MAX_HISTORY_POINTS) {
          updatedHistory.shift();
        }

        historicalDataRef.current[coin.base] = updatedHistory;

        return {
          coin,
          price: priceData.price,
          priceChangePercent24h: priceData.priceChangePercent24h,
          priceChangePercent5m,
          openInterest: currentOI.sumOpenInterestValue,
          openInterestChangePercent5m: oiChangePercent,
          alertLevel,
          lastUpdate: timestamp,
          history: updatedHistory,
        };
      })
    );

    const validResults = results.filter((r): r is MonitorDataWithHistory => r !== null);
    setMonitorData(validResults);
    setLastUpdate(new Date());
  }, [priceHistory]);

  useEffect(() => {
    fetchMonitorData();

    const interval = setInterval(() => {
      fetchMonitorData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchMonitorData, refreshInterval]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchMonitorData();
    setLoading(false);
  }, [fetchMonitorData]);

  return {
    monitorData,
    loading,
    lastUpdate,
    coins,
    refresh,
  };
}
