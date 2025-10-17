import { useState, useEffect, useCallback, useRef } from 'react';
import { MonitorDataWithHistory, AlertLevel, HistoricalDataPoint } from '@/types/coin';
import { getStoredCoins } from '@/utils/storage';
import { fetchPriceData, fetchOIHistory, calculatePercentageChange } from '@/utils/binance';
import { collectCVDData, getCVDHistory } from '@/utils/cvd';
import { detectWhaleSignal } from '@/utils/whaleDetection';

interface PriceHistory {
  [symbol: string]: { price: number; timestamp: number };
}

interface HistoricalStorage {
  [symbol: string]: HistoricalDataPoint[];
}

const MAX_HISTORY_POINTS = 360; // 18小时历史 (360个点 * 3分钟 = 1080分钟)

export function useCoinMonitor(refreshInterval: number = 180000) { // 3分钟刷新一次
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
          fetchOIHistory(coin.binance, 4), // 获取4个数据点用于洗盘检测
          getCVDHistory(coin.binance, 360), // 获取18小时历史数据
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

        const alertLevel = determineAlertLevel(oiChangePercent, priceChangePercent5m);

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
