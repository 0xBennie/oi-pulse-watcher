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
  alertLevel: AlertLevel;
  lastUpdate: number;
}

export type AlertLevel = 'NONE' | 'WEAK' | 'MEDIUM' | 'STRONG';

export type SortField = 'symbol' | 'price' | '24h%' | '5m%' | 'oi' | 'oiChange' | 'alert';
export type SortDirection = 'asc' | 'desc';
