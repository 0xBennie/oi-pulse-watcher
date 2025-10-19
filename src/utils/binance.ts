import { PriceData, OIData } from '@/types/coin';

interface BinanceTickerResponse {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

interface BinanceOpenInterestResponse {
  symbol: string;
  timestamp: number;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
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

export async function fetchOIHistory(symbol: string, limit: number = 4): Promise<OIData[]> {
  try {
    const response = await fetch(
      `${BINANCE_API_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=${limit}`
    );
    
    if (!response.ok) {
      console.error(`Failed to fetch OI for ${symbol}: ${response.status}`);
      return [];
    }

    const data: BinanceOpenInterestResponse[] = await response.json();

    return data.map((item) => ({
      symbol: item.symbol,
      timestamp: item.timestamp,
      sumOpenInterest: parseFloat(item.sumOpenInterest),
      sumOpenInterestValue: parseFloat(item.sumOpenInterestValue),
    }));
  } catch (error) {
    console.error(`Error fetching OI for ${symbol}:`, error);
    return [];
  }
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}
