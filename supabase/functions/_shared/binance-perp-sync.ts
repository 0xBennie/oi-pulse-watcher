import type { PostgrestError } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const EXCHANGE_INFO_ENDPOINT = 'https://fapi.binance.com/fapi/v1/exchangeInfo';

interface BinanceExchangeInfoResponse {
  symbols: BinancePerpSymbol[];
}

interface BinancePerpSymbol {
  symbol: string;
  contractType: string;
  quoteAsset: string;
  baseAsset: string;
  status: string;
}

export interface SyncSummary {
  totalMarkets: number;
  newMarkets: number;
  reenabledMarkets: number;
  disabledMarkets: number;
}

const CHUNK_SIZE_DEFAULT = 80;

const isPerpetualUsdtMarket = (symbol: BinancePerpSymbol): boolean =>
  symbol.contractType === 'PERPETUAL' && symbol.quoteAsset === 'USDT';

export async function fetchPerpetualMarkets(fetcher: typeof fetch = fetch): Promise<BinancePerpSymbol[]> {
  const response = await fetcher(EXCHANGE_INFO_ENDPOINT);

  if (!response.ok) {
    throw new Error(`Failed to fetch Binance exchange info: ${response.status}`);
  }

  const payload = (await response.json()) as BinanceExchangeInfoResponse;

  if (!payload?.symbols || !Array.isArray(payload.symbols)) {
    return [];
  }

  return payload.symbols.filter(isPerpetualUsdtMarket);
}

type MonitoredCoinRow = { symbol: string; enabled?: boolean | null };

interface SupabaseLikeClient {
  from<T extends string>(table: T): {
    select(columns: string): Promise<{ data: MonitoredCoinRow[] | null; error: PostgrestError | null }>;
    upsert(records: Array<{ symbol: string; name: string; enabled: boolean }>, options?: { onConflict?: string }): Promise<{ error: PostgrestError | null }>;
    update(values: { enabled: boolean }): {
      in(column: string, values: string[]): Promise<{ error: PostgrestError | null }>;
    };
  };
}

export async function syncBinancePerpetualMarkets(
  supabase: SupabaseLikeClient,
  fetcher: typeof fetch = fetch,
  options: { chunkSize?: number; disableMissing?: boolean } = {}
): Promise<SyncSummary> {
  const { chunkSize = CHUNK_SIZE_DEFAULT, disableMissing = true } = options;

  const markets = await fetchPerpetualMarkets(fetcher);
  const tradingMarkets = markets.filter((market) => market.status === 'TRADING');

  const { data: existingRows, error: existingError } = await supabase
    .from('monitored_coins')
    .select('symbol, enabled');

  if (existingError) {
    throw existingError;
  }

  const existingMap = new Map<string, boolean>();
  (existingRows ?? []).forEach((row) => {
    existingMap.set(row.symbol, row.enabled ?? false);
  });

  const desiredSymbols = new Set(tradingMarkets.map((market) => market.symbol));

  const newMarkets = tradingMarkets.filter((market) => !existingMap.has(market.symbol));
  const reenabledMarkets = tradingMarkets.filter((market) => existingMap.get(market.symbol) === false);

  const upsertPayload = tradingMarkets.map((market) => ({
    symbol: market.symbol,
    name: market.baseAsset,
    enabled: true,
  }));

  for (let i = 0; i < upsertPayload.length; i += chunkSize) {
    const chunk = upsertPayload.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('monitored_coins')
      .upsert(chunk, { onConflict: 'symbol' });

    if (error) {
      throw error;
    }
  }

  let disabledMarkets = 0;

  if (disableMissing && existingRows) {
    const missingSymbols = existingRows
      .filter((row) => !desiredSymbols.has(row.symbol) && row.enabled !== false)
      .map((row) => row.symbol);

    if (missingSymbols.length > 0) {
      const { error } = await supabase
        .from('monitored_coins')
        .update({ enabled: false })
        .in('symbol', missingSymbols);

      if (error) {
        throw error;
      }

      disabledMarkets = missingSymbols.length;
    }
  }

  return {
    totalMarkets: tradingMarkets.length,
    newMarkets: newMarkets.length,
    reenabledMarkets: reenabledMarkets.length,
    disabledMarkets,
  };
}
