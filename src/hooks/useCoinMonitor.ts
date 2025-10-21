import { useState, useEffect, useCallback } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint, Coin } from '@/types/coin';
import { supabase } from '@/integrations/supabase/client';
import { fetchPriceData, calculatePercentageChange } from '@/utils/binance';
import { getCVDHistory } from '@/utils/cvd';
import { detectWhaleSignal } from '@/utils/whaleDetection';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_HISTORY_POINTS = 1728; // 6 天历史 (1728 * 5 分钟 = 8640 分钟 = 144 小时)
const FETCH_LIMIT = 864; // 每次获取 3 天数据 (864 * 5 分钟 = 4320 分钟 = 72 小时)

const safePercentageChange = (current: number, previous: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) < 1e-8) {
    return 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

const resolveOpenInterestValue = (value?: number | null, fallback?: number | null): number | null => {
  if (value !== undefined && value !== null) {
    return value;
  }
  if (fallback !== undefined && fallback !== null) {
    return fallback;
  }
  return null;
};

export function useCoinMonitor(refreshInterval: number = 60000) { // 1分钟刷新一次
  const [monitorData, setMonitorData] = useState<MonitorDataWithHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);

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
      const [priceData, cvdHistory] = await Promise.all([
        fetchPriceData(coin.binance),
        getCVDHistory(coin.binance, FETCH_LIMIT),
      ]);

      if (!priceData || cvdHistory.length < 2) {
        return null;
      }

      const orderedHistory = [...cvdHistory].sort((a, b) => a.timestamp - b.timestamp);
      const latestPoint = orderedHistory[orderedHistory.length - 1];
      const referenceTimestamp = latestPoint.timestamp - FIVE_MINUTES_MS;
      const referencePoint = [...orderedHistory]
        .reverse()
        .find((point) => point.timestamp <= referenceTimestamp);

      if (!referencePoint) {
        return null;
      }

      const priceChangePercent5m = calculatePercentageChange(latestPoint.price, referencePoint.price);

      const currentOpenInterest = resolveOpenInterestValue(latestPoint.openInterestValue, latestPoint.openInterest);
      const previousOpenInterest = resolveOpenInterestValue(referencePoint.openInterestValue, referencePoint.openInterest);
      const oiChangePercent = currentOpenInterest !== null && previousOpenInterest !== null
        ? safePercentageChange(currentOpenInterest, previousOpenInterest)
        : 0;

      const cvdChangePercent = safePercentageChange(latestPoint.cvd, referencePoint.cvd);

      const history: HistoricalDataPoint[] = orderedHistory
        .slice(-MAX_HISTORY_POINTS)
        .map((point) => ({
          timestamp: point.timestamp,
          price: point.price,
          openInterest: resolveOpenInterestValue(point.openInterestValue, point.openInterest) ?? 0,
          cvd: point.cvd,
        }));

      const oiHistory = orderedHistory
        .slice(-3)
        .reverse()
        .map((point) => ({
          symbol: coin.binance,
          timestamp: point.timestamp,
          sumOpenInterest: resolveOpenInterestValue(point.openInterest, point.openInterestValue) ?? 0,
          sumOpenInterestValue: resolveOpenInterestValue(point.openInterestValue, point.openInterest) ?? 0,
        }))
        .filter((entry) => entry.sumOpenInterestValue > 0);

      const whaleSignal = oiHistory.length >= 2
        ? detectWhaleSignal(oiHistory, priceChangePercent5m, priceData.quoteVolume || 0)
        : undefined;

      const alertLevel = determineAlertLevel(
        cvdChangePercent,
        priceChangePercent5m,
        oiChangePercent,
        history,
      );

      return {
        coin,
        price: priceData.price,
        priceChangePercent24h: priceData.priceChangePercent24h,
        priceChangePercent5m,
        openInterest: currentOpenInterest ?? 0,
        openInterestChangePercent5m: oiChangePercent,
        cvd: latestPoint.cvd,
        cvdChangePercent5m: cvdChangePercent,
        volume24h: priceData.quoteVolume || 0,
        whaleSignal,
        alertLevel,
        lastUpdate: latestPoint.timestamp,
        history,
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

    const latestTimestamp = aggregatedResults.reduce((max, item) => Math.max(max, item.lastUpdate), 0);
    setLastUpdate(latestTimestamp ? new Date(latestTimestamp) : new Date());
  }, []);

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
