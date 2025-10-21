import { PriceData } from '@/types/coin';

interface BinanceTickerResponse {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

const BINANCE_API_BASE = 'https://fapi.binance.com';

export async function fetchPriceData(symbol: string): Promise<PriceData | null> {
  try {
    const response = await fetch(
      `${BINANCE_API_BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`
    );
    
    if (!response.ok) {
      console.error(`Failed to fetch price for ${symbol}: ${response.status}`);
      return null;
    }

    const data: BinanceTickerResponse = await response.json();

    return {
      symbol: data.symbol,
      price: parseFloat(data.lastPrice),
      priceChangePercent24h: parseFloat(data.priceChangePercent),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume), // 24h成交额（USDT）
    };
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}
