import { Coin } from '@/types/coin';

const STORAGE_KEY = 'coin-monitor-list';

export function getStoredCoins(): Coin[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse stored coins:', error);
    }
  }
  
  // Default coins
  return [
    { base: 'BTC', binance: 'BTCUSDT' },
    { base: 'ETH', binance: 'ETHUSDT' },
    { base: 'APE', binance: 'APEUSDT' },
  ];
}

export function storeCoins(coins: Coin[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
}

export function addCoin(coin: Coin): Coin[] {
  const coins = getStoredCoins();
  const exists = coins.some(c => c.base === coin.base);
  
  if (exists) {
    throw new Error(`Coin ${coin.base} already exists`);
  }
  
  const newCoins = [...coins, coin];
  storeCoins(newCoins);
  return newCoins;
}

export function removeCoin(base: string): Coin[] {
  const coins = getStoredCoins();
  const newCoins = coins.filter(c => c.base !== base);
  storeCoins(newCoins);
  return newCoins;
}
