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
  
  // Empty by default
  return [];
}

export function storeCoins(coins: Coin[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
}

export function addCoin(coin: Coin): Coin[] {
  const coins = getStoredCoins();
  const exists = coins.some(c => c.base === coin.base);
  
  if (exists) {
    throw new Error(`${coin.base} 已在监控列表中`);
  }
  
  const newCoins = [...coins, coin];
  storeCoins(newCoins);
  return newCoins;
}

export function addMultipleCoins(newCoins: Coin[]): number {
  const existingCoins = getStoredCoins();
  const existingBases = new Set(existingCoins.map(c => c.base));
  
  // Filter out duplicates
  const coinsToAdd = newCoins.filter(coin => !existingBases.has(coin.base));
  
  if (coinsToAdd.length === 0) {
    return 0;
  }
  
  const updatedCoins = [...existingCoins, ...coinsToAdd];
  storeCoins(updatedCoins);
  
  return coinsToAdd.length;
}

export function removeCoin(base: string): Coin[] {
  const coins = getStoredCoins();
  const newCoins = coins.filter(c => c.base !== base);
  storeCoins(newCoins);
  return newCoins;
}

export function clearAllCoins(): void {
  storeCoins([]);
}
