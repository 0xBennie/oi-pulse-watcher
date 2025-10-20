import { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint, Coin } from '@/types/coin';
import { supabase } from '@/integrations/supabase/client';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';
import { getCVDHistory } from '@/utils/cvd';
import { detectWhaleSignal } from '@/utils/whaleDetection';

interface PriceHistoryEntry {
  price: number;
  timestamp: number;
}

interface PriceHistory {
  [symbol: string]: PriceHistoryEntry[];
}

interface HistoricalStorage {
  [symbol: string]: HistoricalDataPoint[];
}

const MAX_HISTORY_POINTS = 2880; // 6天历史 (2880个点 * 3分钟 = 8640分钟 = 144小时 = 6天)
const FETCH_LIMIT = 1440; // 每次获取3天数据 (1440 * 3分钟 = 72小时)
export function useCoinMonitor(refreshInterval: number = 60000) { // 1分钟刷新一次
  const [monitorData, setMonitorData] = useState<MonitorDataWithHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const priceHistoryRef = useRef<PriceHistory>({});
  const historicalDataRef = useRef<HistoricalStorage>({});

  const determineAlertLevel = (
    cvdChangePercent: number,
    priceChangePercent: number,
    oiChangePercent: number,
    history: HistoricalDataPoint[]
  ): AlertLevel => {
    // 1. STRONG_BREAKOUT: CVD↑≥5%、价↑≥2%、OI↑≥5%
    if (cvdChangePercent >= 5 && priceChangePercent >= 2 && oiChangePercent >= 5) {
      return 'STRONG_BREAKOUT';
    }

    // 2. ACCUMULATION: CVD↑≥8%、价格横盘±1%、OI持平或上升
    if (cvdChangePercent >= 8 && Math.abs(priceChangePercent) <= 1 && oiChangePercent >= 0) {
      return 'ACCUMULATION';
    }

    // 3. DISTRIBUTION_WARN: CVD↓≥3%、价↑≥1%
    if (cvdChangePercent <= -3 && priceChangePercent >= 1) {
      return 'DISTRIBUTION_WARN';
    }

    // 4. SHORT_CONFIRM: CVD↓≥5%、价↓≥2%、OI↑
    if (cvdChangePercent <= -5 && priceChangePercent <= -2 && oiChangePercent > 0) {
      return 'SHORT_CONFIRM';
    }

    // 5. TOP_DIVERGENCE: 近60根内价格创新高但CVD未创新高
    if (history.length >= 60) {
      const recent60 = history.slice(-60);
      const currentPrice = recent60[recent60.length - 1].price;
      const currentCVD = recent60[recent60.length - 1].cvd;
      
      // 检查价格是否创新高
      const maxPrice = Math.max(...recent60.map(h => h.price));
      const maxCVD = Math.max(...recent60.map(h => h.cvd));
      
      // 如果当前价格是新高（或接近新高），但CVD不是新高
      if (currentPrice >= maxPrice * 0.998 && currentCVD < maxCVD * 0.95) {
        return 'TOP_DIVERGENCE';
      }
    }

    return 'NONE';
  };

  const fetchMonitorData = useCallback(async () => {
    // 从数据库获取启用的监控币种
    const { data: monitoredCoins, error } = await supabase
      .from('monitored_coins')
      .select('symbol, name, enabled')
      .eq('enabled', true);

    if (error) {
      console.error('Failed to fetch monitored coins:', error);
      setMonitorData([]);
      return;
    }

    if (!monitoredCoins || monitoredCoins.length === 0) {
      setCoins([]);
      setMonitorData([]);
      return;
    }

    // 转换为 Coin 格式
    const coinsData: Coin[] = monitoredCoins.map(coin => ({
      base: coin.name,
      binance: coin.symbol,
    }));

    setCoins(coinsData);

    const processCoinData = async (coin: Coin): Promise<MonitorDataWithHistory | null> => {
      const [priceData, oiHistory, cvdHistory] = await Promise.all([
        fetchPriceData(coin.binance),
        fetchOIHistory(coin.binance, 4),
        getCVDHistory(coin.binance, FETCH_LIMIT),
      ]);

      console.log(`${coin.base} CVD历史数据:`, cvdHistory.length, '个点');

      if (!priceData || oiHistory.length === 0) {
        return null;
      }

      const sortedOIHistory = [...oiHistory].sort((a, b) => b.timestamp - a.timestamp);

      const currentPrice = priceData.price;
      const now = Date.now();
      const historyKey = coin.binance;
      const existingPriceHistory = priceHistoryRef.current[historyKey] ?? [];
      const trimmedPriceHistory = existingPriceHistory.filter(
        (entry) => now - entry.timestamp <= 10 * 60 * 1000
      );

      const fiveMinutesAgo = now - 5 * 60 * 1000;
      let referencePriceEntry = [...trimmedPriceHistory]
        .reverse()
        .find((entry) => entry.timestamp <= fiveMinutesAgo);

      if (!referencePriceEntry && trimmedPriceHistory.length > 0) {
        referencePriceEntry = trimmedPriceHistory[0];
      }

      const priceChangePercent5m = referencePriceEntry
        ? calculatePercentageChange(currentPrice, referencePriceEntry.price)
        : 0;

      priceHistoryRef.current[historyKey] = [
        ...trimmedPriceHistory,
        { price: currentPrice, timestamp: now },
      ];

      const currentOI = sortedOIHistory[0];
      const currentOITimestamp = currentOI.timestamp;
      const targetOITimestamp = currentOITimestamp - 5 * 60 * 1000;

      const previousOI = sortedOIHistory
        .slice(1)
        .find((item) => item.timestamp <= targetOITimestamp)
        || sortedOIHistory[sortedOIHistory.length - 1];

      const oiChangePercent = previousOI
        ? calculatePercentageChange(
            currentOI.sumOpenInterestValue,
            previousOI.sumOpenInterestValue
          )
        : 0;

      const latestCVDPoint = cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1] : undefined;
      const currentCVD = latestCVDPoint?.cvd ?? 0;

      let cvdChangePercent = 0;
      if (latestCVDPoint) {
        const cvdTargetTimestamp = latestCVDPoint.timestamp - 5 * 60 * 1000;
        const previousCVDPoint = [...cvdHistory]
          .reverse()
          .find((point) => point.timestamp <= cvdTargetTimestamp && point.timestamp !== latestCVDPoint.timestamp)
          || cvdHistory[0];

        if (previousCVDPoint) {
          const previousCVD = previousCVDPoint.cvd;
          cvdChangePercent = Math.abs(previousCVD) > 0
            ? ((currentCVD - previousCVD) / Math.abs(previousCVD)) * 100
            : 0;
        }
      }

      const whaleSignal = detectWhaleSignal(
        sortedOIHistory,
        priceChangePercent5m,
        priceData.quoteVolume || 0
      );

      let tempHistory: HistoricalDataPoint[];

      if (cvdHistory.length > 0) {
        const existingHistory = historicalDataRef.current[coin.binance] || [];
        const historyMap = new Map<number, HistoricalDataPoint>();

        for (const point of existingHistory) {
          historyMap.set(point.timestamp, point);
        }

        const fallbackOpenInterest = existingHistory.length > 0
          ? existingHistory[existingHistory.length - 1].openInterest
          : currentOI.sumOpenInterestValue;

        for (const point of cvdHistory) {
          const existingPoint = historyMap.get(point.timestamp);
          historyMap.set(point.timestamp, {
            timestamp: point.timestamp,
            price: point.price,
            cvd: point.cvd,
            openInterest: point.openInterest ?? existingPoint?.openInterest ?? fallbackOpenInterest,
          });
        }

        const newDataPoint: HistoricalDataPoint = {
          timestamp: now,
          price: currentPrice,
          openInterest: currentOI.sumOpenInterestValue,
          cvd: currentCVD,
        };

        historyMap.set(newDataPoint.timestamp, newDataPoint);
        tempHistory = Array.from(historyMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      } else {
        const existingHistory = historicalDataRef.current[coin.binance] || [];
        tempHistory = existingHistory;
      }

      const alertLevel = determineAlertLevel(
        cvdChangePercent,
        priceChangePercent5m,
        oiChangePercent,
        tempHistory
      );

      const timestamp = now;

      const newDataPoint: HistoricalDataPoint = {
        timestamp,
        price: currentPrice,
        openInterest: currentOI.sumOpenInterestValue,
        cvd: currentCVD,
      };

      let updatedHistory: HistoricalDataPoint[];

      if (cvdHistory.length > 0) {
        updatedHistory = tempHistory;
      } else {
        const existingHistory = historicalDataRef.current[coin.binance] || [];
        updatedHistory = [...existingHistory, newDataPoint];
      }

      if (updatedHistory.length > MAX_HISTORY_POINTS) {
        updatedHistory = updatedHistory.slice(-MAX_HISTORY_POINTS);
      }

      historicalDataRef.current[coin.binance] = updatedHistory;

      return {
        coin,
        price: priceData.price,
        priceChangePercent24h: priceData.priceChangePercent24h,
        priceChangePercent5m,
        openInterest: currentOI.sumOpenInterestValue,
        openInterestChangePercent5m: oiChangePercent,
        cvd: currentCVD,
        cvdChangePercent5m: cvdChangePercent,
        volume24h: priceData.quoteVolume || 0,
        whaleSignal,
        alertLevel,
        lastUpdate: timestamp,
        history: updatedHistory,
      };
    };

    const aggregatedResults: MonitorDataWithHistory[] = [];
    const BATCH_SIZE = 6;
    const BATCH_DELAY_MS = 350;

    for (let i = 0; i < coinsData.length; i += BATCH_SIZE) {
      const batch = coinsData.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(processCoinData));
      const validBatch = batchResults.filter((r): r is MonitorDataWithHistory => r !== null);
      aggregatedResults.push(...validBatch);

      if (i + BATCH_SIZE < coinsData.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    setMonitorData(aggregatedResults);
    setLastUpdate(new Date());
  }, []); // 移除 priceHistory 依赖，使用函数式更新

  useEffect(() => {
    setLoading(true);
    fetchMonitorData().finally(() => setLoading(false));

    const interval = setInterval(() => {
      fetchMonitorData();
    }, refreshInterval);

    // 监听 monitored_coins 表的变化
    const channel = supabase
      .channel('monitored-coins-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'monitored_coins'
        },
        () => {
          console.log('Monitored coins changed, refreshing...');
          fetchMonitorData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
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
