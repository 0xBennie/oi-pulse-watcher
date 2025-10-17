import { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint, Coin } from '@/types/coin';
import { supabase } from '@/integrations/supabase/client';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';
import { getCVDHistory } from '@/utils/cvd';
import { detectWhaleSignal } from '@/utils/whaleDetection';

interface PriceHistory {
  [symbol: string]: { price: number; timestamp: number };
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
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
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

    const results = await Promise.all(
      coinsData.map(async (coin) => {
        // CVD数据由后台定时任务自动收集，这里只读取即可
        const [priceData, oiHistory, cvdHistory] = await Promise.all([
          fetchPriceData(coin.binance),
          fetchOIHistory(coin.binance, 4), // 获取4个数据点用于洗盘检测
          getCVDHistory(coin.binance, FETCH_LIMIT), // 获取3天历史数据（72小时）
        ]);

        console.log(`${coin.base} CVD历史数据:`, cvdHistory.length, '个点');

        if (!priceData || oiHistory.length === 0) {
          return null;
        }

        // Calculate 5m price change - 使用函数式更新避免依赖
        const currentPrice = priceData.price;
        let priceChangePercent5m = 0;
        
        setPriceHistory((prev) => {
          const lastKnownPrice = prev[coin.base]?.price;
          priceChangePercent5m = lastKnownPrice
            ? calculatePercentageChange(currentPrice, lastKnownPrice)
            : 0;
          
          return {
            ...prev,
            [coin.base]: { price: currentPrice, timestamp: Date.now() },
          };
        });

        // Calculate OI change (注意：oiHistory是倒序的，最新的在前)
        const currentOI = oiHistory[0]; // 最新数据
        const previousOI = oiHistory[1]; // 5分钟前数据
        const oiChangePercent = calculatePercentageChange(
          currentOI.sumOpenInterestValue,
          previousOI.sumOpenInterestValue
        );

        // 计算CVD变化 - cvdHistory是按时间升序排列的
        const currentCVD = cvdHistory.length > 0 ? cvdHistory[cvdHistory.length - 1].cvd : 0;
        // 5分钟前的CVD值（假设每3分钟一个点，5分钟大约是2个点）
        const previousCVDIndex = Math.max(0, cvdHistory.length - 3);
        const previousCVD = cvdHistory.length > 2 ? cvdHistory[previousCVDIndex].cvd : currentCVD;
        const cvdChangePercent = calculatePercentageChange(currentCVD, previousCVD);

        // 检测庄家信号
        const whaleSignal = detectWhaleSignal(
          oiHistory,
          priceChangePercent5m,
          priceData.quoteVolume || 0
        );

        // 需要先构建历史数据再判断告警
        let tempHistory: HistoricalDataPoint[];
        
        if (cvdHistory.length > 0) {
          const historicalPoints = cvdHistory.map(point => ({
            timestamp: point.timestamp,
            price: point.price,
            openInterest: currentOI.sumOpenInterestValue,
            cvd: point.cvd,
          }));
          
          const newDataPoint: HistoricalDataPoint = {
            timestamp: Date.now(),
            price: currentPrice,
            openInterest: currentOI.sumOpenInterestValue,
            cvd: currentCVD,
          };
          
          tempHistory = [...historicalPoints, newDataPoint];
        } else {
          const existingHistory = historicalDataRef.current[coin.base] || [];
          tempHistory = existingHistory;
        }

        const alertLevel = determineAlertLevel(
          cvdChangePercent, 
          priceChangePercent5m, 
          oiChangePercent,
          tempHistory
        );

        // Update historical data - 合并CVD历史数据
        const timestamp = Date.now();
        
        // 创建当前数据点
        const newDataPoint: HistoricalDataPoint = {
          timestamp,
          price: currentPrice,
          openInterest: currentOI.sumOpenInterestValue,
          cvd: currentCVD,
        };
        
        let updatedHistory: HistoricalDataPoint[];
        
        if (cvdHistory.length > 0) {
          // 将CVD历史转换为HistoricalDataPoint格式
          const historicalPoints = cvdHistory.map(point => ({
            timestamp: point.timestamp,
            price: point.price,
            openInterest: currentOI.sumOpenInterestValue,
            cvd: point.cvd,
          }));
          
          // 检查最新的历史数据点是否已经包含当前时间点
          const lastHistoricalTimestamp = historicalPoints.length > 0 
            ? historicalPoints[historicalPoints.length - 1].timestamp 
            : 0;
          
          // 如果当前数据点比历史数据新（超过1分钟），则追加
          if (timestamp - lastHistoricalTimestamp > 60000) {
            updatedHistory = [...historicalPoints, newDataPoint];
          } else {
            updatedHistory = historicalPoints;
          }
        } else {
          // 如果没有CVD数据，从已有历史开始累积
          const existingHistory = historicalDataRef.current[coin.base] || [];
          updatedHistory = [...existingHistory, newDataPoint];
        }
        
        // 限制历史点数量
        if (updatedHistory.length > MAX_HISTORY_POINTS) {
          updatedHistory = updatedHistory.slice(-MAX_HISTORY_POINTS);
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
          volume24h: priceData.quoteVolume || 0,
          whaleSignal,
          alertLevel,
          lastUpdate: timestamp,
          history: updatedHistory,
        };
      })
    );

    const validResults = results.filter((r): r is MonitorDataWithHistory => r !== null);
    setMonitorData(validResults);
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
