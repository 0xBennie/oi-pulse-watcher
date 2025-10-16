export interface Coin {
  base: string;
  binance: string;
  bybit?: string;
  okx?: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  priceChangePercent24h: number;
  volume?: number; // 24h成交量
  quoteVolume?: number; // 24h成交额（USDT）
}

export interface OIData {
  symbol: string;
  timestamp: number;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
}

export interface MonitorData {
  coin: Coin;
  price: number;
  priceChangePercent24h: number;
  priceChangePercent5m: number;
  openInterest: number;
  openInterestChangePercent5m: number;
  cvd: number; // CVD值
  cvdChangePercent5m: number; // CVD变化百分比
  volume24h: number; // 24小时成交额（USDT）
  whaleSignal: WhaleSignal | undefined; // 庄家信号
  alertLevel: AlertLevel;
  lastUpdate: number;
}

export interface HistoricalDataPoint {
  timestamp: number;
  price: number;
  openInterest: number;
  cvd?: number; // 新增CVD字段
}

export interface MonitorDataWithHistory extends MonitorData {
  history: HistoricalDataPoint[];
}

export type AlertLevel = 'NONE' | 'WEAK' | 'MEDIUM' | 'STRONG';

// 庄家信号类型
export type WhaleSignalType = 'WHALE_BUY' | 'WHALE_SELL' | 'WASH_TRADING';

export interface WhaleSignal {
  type: WhaleSignalType;
  confidence: number; // 置信度 0-100
  oiChange: number; // OI变化百分比
  priceChange: number; // 价格变化百分比
  oiVolumeRatio?: number; // ΔOI/Volume比值
  description: string; // 信号描述
}

export type SortField = 'symbol' | 'price' | '24h%' | '5m%' | 'oi' | 'oiChange' | 'alert';
export type SortDirection = 'asc' | 'desc';
