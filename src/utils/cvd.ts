import { supabase } from '@/integrations/supabase/client';

export interface CVDDataPoint {
  timestamp: number;
  cvd: number;
  price: number;
  openInterest?: number | null;
  openInterestValue?: number | null;
}

export async function collectCVDData(symbol: string): Promise<void> {
  const { error } = await supabase.functions.invoke('collect-cvd', {
    body: { symbol }
  });

  if (error) {
    console.error(`Failed to collect CVD for ${symbol}:`, error);
    throw error;
  }
}

export async function getCVDHistory(symbol: string, limit: number = 60): Promise<CVDDataPoint[]> {
  const { data, error } = await supabase.functions.invoke('get-cvd-history', {
    body: { symbol, limit }
  });

  if (error) {
    console.error(`Failed to get CVD history for ${symbol}:`, error);
    return [];
  }

  return data?.data || [];
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}