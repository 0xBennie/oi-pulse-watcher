import { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint } from '@/types/coin';
import { getStoredCoins } from '@/utils/storage';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';
import { collectCVDData, getCVDHistory } from '@/utils/cvd';

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
        // 先触发CVD数据收集（后台执行）
        collectCVDData(coin.binance).catch(err => {
          console.error(`CVD collection failed for ${coin.binance}:`, err);
        });

        const [priceData, oiHistory, cvdHistory] = await Promise.all([
          fetchPriceData(coin.binance),
          fetchOIHistory(coin.binance),
          getCVDHistory(coin.binance, 180),
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

        // 计算CVD变化
        const currentCVD = cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1].cvd : 0;
        const previousCVD = cvdHistory.length > 1 ? cvdHistory[0].cvd : currentCVD;
        const cvdChangePercent = calculatePercentageChange(currentCVD, previousCVD);

        const alertLevel = determineAlertLevel(oiChangePercent, priceChangePercent5m);

        // Update historical data - 合并CVD历史数据
        const timestamp = Date.now();
        
        // 如果有CVD历史数据，使用它；否则创建新的数据点
        let updatedHistory: HistoricalDataPoint[];
        
        if (cvdHistory.length > 0) {
          // 将CVD历史转换为HistoricalDataPoint格式
          updatedHistory = cvdHistory.map(point => ({
            timestamp: point.timestamp,
            price: point.price,
            openInterest: currentOI.sumOpenInterestValue, // 使用当前OI作为占位
            cvd: point.cvd,
          }));
        } else {
          // 如果没有CVD数据，使用传统方式
          const newDataPoint: HistoricalDataPoint = {
            timestamp,
            price: currentPrice,
            openInterest: currentOI.sumOpenInterestValue,
          };

          const existingHistory = historicalDataRef.current[coin.base] || [];
          updatedHistory = [...existingHistory, newDataPoint];

          if (updatedHistory.length > MAX_HISTORY_POINTS) {
            updatedHistory.shift();
          }
        }

        historicalDataRef.current[coin.base] = updatedHistory;

        return {
          coin,
          price: priceData.price,
          priceChangePercent24h: priceData.priceChangePercent24h,
          priceChangePercent5m,
          openInterest: currentOI.sumOpenInterestValue,
          openInterestChangePercent5m: oiChangePercent,
          cvd: currentCVD,
          cvdChangePercent5m: cvdChangePercent,
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
