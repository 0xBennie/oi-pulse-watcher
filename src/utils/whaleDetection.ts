import { WhaleSignal, WhaleSignalType, OIData } from '@/types/coin';

/**
 * 检测庄家行为信号
 * @param oiHistory OI历史数据（按时间倒序，最新的在前）
 * @param priceChange5m 5分钟价格变化百分比
 * @param volume24h 24小时成交额（USDT）
 * @returns WhaleSignal 或 undefined
 */
export function detectWhaleSignal(
  oiHistory: OIData[],
  priceChange5m: number,
  volume24h: number
): WhaleSignal | undefined {
  if (oiHistory.length < 2) return undefined;

  // 计算5分钟和10分钟的OI变化
  const latest = oiHistory[0];
  const prev5m = oiHistory[1];
  const oiChange5m = ((latest.sumOpenInterestValue - prev5m.sumOpenInterestValue) / prev5m.sumOpenInterestValue) * 100;

  // 计算OI绝对值（百万USDT）
  const oiValueInMillions = latest.sumOpenInterestValue / 1_000_000;

  // 计算ΔOI/Volume比值（5分钟OI变化 / 24h成交额）
  const oiDelta = Math.abs(latest.sumOpenInterestValue - prev5m.sumOpenInterestValue);
  const oiVolumeRatio = volume24h > 0 ? oiDelta / volume24h : 0;

  // A. 庄家建仓信号检测
  // 条件：OI增加≥20% + 价格波动≤1.5% + ΔOI/Volume≥0.25
  if (
    oiChange5m >= 20 &&
    Math.abs(priceChange5m) <= 1.5 &&
    oiVolumeRatio >= 0.25 &&
    oiValueInMillions >= 0.3 // 至少30万USDT
  ) {
    return {
      type: 'WHALE_BUY',
      confidence: calculateConfidence(oiChange5m, priceChange5m, oiVolumeRatio, 'buy'),
      oiChange: oiChange5m,
      priceChange: priceChange5m,
      oiVolumeRatio,
      description: `🐋 庄家建仓：OI激增${oiChange5m.toFixed(1)}%，价格仅动${Math.abs(priceChange5m).toFixed(1)}%，资金正在悄悄流入`,
    };
  }

  // B. 庄家撤仓/出货信号检测
  // 条件：OI下降≥15% + 价格未同步暴跌（跌幅<OI降幅的一半）
  if (
    oiChange5m <= -15 &&
    priceChange5m > oiChange5m / 2 && // 价格跌幅小于OI降幅的一半
    oiValueInMillions >= 0.3
  ) {
    return {
      type: 'WHALE_SELL',
      confidence: calculateConfidence(oiChange5m, priceChange5m, oiVolumeRatio, 'sell'),
      oiChange: oiChange5m,
      priceChange: priceChange5m,
      oiVolumeRatio,
      description: `🐋 庄家撤仓：OI骤降${Math.abs(oiChange5m).toFixed(1)}%，价格仅跌${Math.abs(priceChange5m).toFixed(1)}%，主力正在离场`,
    };
  }

  // C. 洗盘/对倒信号检测
  // 条件：10分钟内OI先增≥20%后降≥15% + 价格震荡但收盘几乎不变
  if (oiHistory.length >= 3) {
    const prev10m = oiHistory[2];
    const oiChange10m = ((latest.sumOpenInterestValue - prev10m.sumOpenInterestValue) / prev10m.sumOpenInterestValue) * 100;
    const midPoint = oiHistory[1];
    const oiChangeFirst5m = ((midPoint.sumOpenInterestValue - prev10m.sumOpenInterestValue) / prev10m.sumOpenInterestValue) * 100;
    const oiChangeSecond5m = ((latest.sumOpenInterestValue - midPoint.sumOpenInterestValue) / midPoint.sumOpenInterestValue) * 100;

    // 先增后减的模式
    if (
      oiChangeFirst5m >= 20 &&
      oiChangeSecond5m <= -15 &&
      Math.abs(oiChange10m) <= 3 && // 10分钟总体变化很小
      Math.abs(priceChange5m) <= 2 && // 价格变化不大
      oiValueInMillions >= 0.3
    ) {
      return {
        type: 'WASH_TRADING',
        confidence: calculateConfidence(oiChangeFirst5m, priceChange5m, oiVolumeRatio, 'wash'),
        oiChange: oiChange5m,
        priceChange: priceChange5m,
        oiVolumeRatio,
        description: `🌊 洗盘对倒：OI先增${oiChangeFirst5m.toFixed(1)}%后降${Math.abs(oiChangeSecond5m).toFixed(1)}%，庄家正在清洗盘面`,
      };
    }
  }

  return undefined;
}

/**
 * 计算信号置信度（0-100）
 */
function calculateConfidence(
  oiChange: number,
  priceChange: number,
  oiVolumeRatio: number,
  signalType: 'buy' | 'sell' | 'wash'
): number {
  let confidence = 50; // 基础置信度

  if (signalType === 'buy') {
    // OI增幅越大，置信度越高
    confidence += Math.min(Math.abs(oiChange) - 20, 30); // 最多+30
    // 价格波动越小，置信度越高
    confidence += Math.max(10 - Math.abs(priceChange) * 5, 0); // 最多+10
    // OI/Volume比值越高，置信度越高
    confidence += Math.min((oiVolumeRatio - 0.25) * 20, 10); // 最多+10
  } else if (signalType === 'sell') {
    // OI降幅越大，置信度越高
    confidence += Math.min(Math.abs(oiChange) - 15, 25);
    // 价格跌幅与OI降幅差距越大，置信度越高
    const divergence = Math.abs(oiChange) - Math.abs(priceChange);
    confidence += Math.min(divergence, 15);
  } else if (signalType === 'wash') {
    // 洗盘信号固定较高置信度
    confidence = 70;
    confidence += Math.min(Math.abs(oiChange) / 2, 15);
  }

  return Math.min(Math.max(confidence, 0), 100);
}
