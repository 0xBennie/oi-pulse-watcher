import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { syncBinancePerpetualMarkets } from "../_shared/binance-perp-sync.ts";

const ALLOWED_ORIGINS = [
  'https://lovable.dev',
  'http://localhost:8080',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null): HeadersInit {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed)) || 
    origin.endsWith('.lovable.dev') || 
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const BINANCE_API_BASE = 'https://fapi.binance.com';
const SNAP_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BACKFILL_INTERVALS = 24; // 2 小时的回填窗口
const MAX_TRADES_PER_REQUEST = 1000;
const EPSILON = 1e-8;

type GenericSchema = {
  Tables: Record<string, unknown>;
  Views: Record<string, unknown>;
  Functions: Record<string, unknown>;
  Enums: Record<string, unknown>;
  CompositeTypes: Record<string, unknown>;
};

type GenericDatabase = Record<string, GenericSchema>;

type SupabaseServiceClient = SupabaseClient<GenericDatabase>;

interface AggTradeData {
  T: number;
  q: string;
  m: boolean;
}

interface OpenInterestSample {
  timestamp: number;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
}

interface CvdDataRow {
  cvd: number | string;
  price: number | string;
  timestamp: number | string;
  open_interest?: number | string | null;
  open_interest_value?: number | string | null;
}

const toNumber = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) {
    return NaN;
  }
  return typeof value === 'number' ? value : parseFloat(value);
};

const alignToInterval = (timestamp: number): number =>
  Math.floor(timestamp / SNAP_INTERVAL_MS) * SNAP_INTERVAL_MS;

const generateBuckets = (start: number, end: number): number[] => {
  const buckets: number[] = [];
  for (let ts = start; ts <= end; ts += SNAP_INTERVAL_MS) {
    buckets.push(ts);
  }
  return buckets;
};

const safePercentChange = (current: number, previous: number): number => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) <= EPSILON) {
    return 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

async function fetchMarkPriceSeries(
  symbol: string,
  startTime: number,
  endExclusive: number
): Promise<Map<number, number>> {
  const encoded = encodeURIComponent(symbol);
  const safeStart = Math.max(0, startTime);
  const safeEnd = Math.max(safeStart + SNAP_INTERVAL_MS, endExclusive);
  const bucketCount = Math.ceil((safeEnd - safeStart) / SNAP_INTERVAL_MS);
  const limit = Math.min(1500, bucketCount + 5);
  const url = `${BINANCE_API_BASE}/fapi/v1/markPriceKlines?symbol=${encoded}&interval=5m&startTime=${safeStart}&endTime=${safeEnd - 1}&limit=${limit}`;

  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const priceMap = new Map<number, number>();

    if (Array.isArray(data)) {
      for (const entry of data) {
        const openTime = Number(entry?.[0]);
        const closePrice = parseFloat(entry?.[4]);
        if (!Number.isFinite(openTime) || !Number.isFinite(closePrice)) {
          continue;
        }
        priceMap.set(alignToInterval(openTime), closePrice);
      }
    }

    return priceMap;
  } catch (error) {
    console.warn(`  ⚠️ Failed to fetch mark price klines for ${symbol}:`, error);
    return new Map();
  }
}

async function fetchOpenInterestSeries(
  symbol: string,
  startTime: number,
  endExclusive: number,
  expectedBuckets: number
): Promise<Map<number, { contracts: number | null; value: number | null }>> {
  const encoded = encodeURIComponent(symbol);
  const limit = Math.min(500, Math.max(expectedBuckets + 10, 20));
  const url = `${BINANCE_API_BASE}/futures/data/openInterestHist?symbol=${encoded}&period=5m&limit=${limit}`;

  try {
    const response = await fetchWithRetry(url);
    const data: OpenInterestSample[] = await response.json();
    const oiMap = new Map<number, { contracts: number | null; value: number | null }>();

    if (Array.isArray(data)) {
      for (const item of data) {
        const rawTimestamp = Number(item.timestamp);
        if (!Number.isFinite(rawTimestamp)) continue;
        const bucketStart = alignToInterval(rawTimestamp);
        if (bucketStart < startTime || bucketStart >= endExclusive) continue;

        const contracts = parseFloat(item.sumOpenInterest);
        const value = parseFloat(item.sumOpenInterestValue);
        oiMap.set(bucketStart, {
          contracts: Number.isFinite(contracts) ? contracts : null,
          value: Number.isFinite(value) ? value : null,
        });
      }
    }

    return oiMap;
  } catch (error) {
    console.warn(`  ⚠️ Failed to fetch open interest for ${symbol}:`, error);
    return new Map();
  }
}

async function fetchCvdDeltas(
  symbol: string,
  startTime: number,
  endExclusive: number
): Promise<Map<number, number>> {
  const encoded = encodeURIComponent(symbol);
  const deltas = new Map<number, number>();
  let cursor = startTime;

  while (cursor < endExclusive) {
    const url = `${BINANCE_API_BASE}/fapi/v1/aggTrades?symbol=${encoded}&startTime=${cursor}&endTime=${endExclusive - 1}&limit=${MAX_TRADES_PER_REQUEST}`;

    let trades: AggTradeData[] = [];
    try {
      const response = await fetchWithRetry(url);
      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length === 0) {
        break;
      }
      trades = payload as AggTradeData[];
    } catch (error) {
      console.warn(`  ⚠️ Failed to fetch agg trades for ${symbol}:`, error);
      break;
    }

    let maxTimestamp = cursor;
    for (const trade of trades) {
      const tradeTimestamp = Number(trade.T);
      if (!Number.isFinite(tradeTimestamp) || tradeTimestamp < startTime || tradeTimestamp >= endExclusive) {
        continue;
      }

      maxTimestamp = Math.max(maxTimestamp, tradeTimestamp);
      const quantity = parseFloat(trade.q);
      if (!Number.isFinite(quantity)) continue;

      const delta = trade.m ? -quantity : quantity;
      const bucketStart = alignToInterval(tradeTimestamp);
      deltas.set(bucketStart, (deltas.get(bucketStart) ?? 0) + delta);
    }

    if (trades.length < MAX_TRADES_PER_REQUEST) {
      cursor = maxTimestamp + 1;
    } else {
      const lastTradeTimestamp = Number(trades[trades.length - 1]?.T ?? maxTimestamp);
      if (!Number.isFinite(lastTradeTimestamp)) {
        break;
      }
      cursor = Math.max(lastTradeTimestamp + 1, cursor + 1);
    }
  }

  return deltas;
}

// 带重试与指数退避的请求，处理 418/429/5xx 等限流/临时错误
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  baseDelay = 600
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(12000),
      });
      if (res.ok) return res;
      const status = res.status;
      if (retries > 0 && (status === 418 || status === 429 || status >= 500)) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, delay));
        retries--; attempt++;
        continue;
      }
      throw new Error(`Binance API error: ${status}`);
    } catch (err) {
      if (retries <= 0) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
      retries--; attempt++;
    }
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase: SupabaseServiceClient = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 Starting auto CVD collection...');

    try {
      const syncSummary = await syncBinancePerpetualMarkets(supabase, fetchWithRetry, {
        disableMissing: true,
      });

      console.log(
        `📥 Synced Binance perpetual markets: total=${syncSummary.totalMarkets}, new=${syncSummary.newMarkets}, reenabled=${syncSummary.reenabledMarkets}, disabled=${syncSummary.disabledMarkets}`
      );
    } catch (syncError) {
      console.error('⚠️ Failed to sync Binance perpetual markets:', syncError);
    }

    // 从数据库获取所有启用的监控币对
    const { data: monitoredCoins, error: coinsError } = await supabase
      .from('monitored_coins')
      .select('symbol, name')
      .eq('enabled', true);

    if (coinsError) {
      console.error('Error fetching monitored coins:', coinsError);
      throw coinsError;
    }

    if (!monitoredCoins || monitoredCoins.length === 0) {
      console.log('⚠️ No monitored coins found. Add coins to monitored_coins table first.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No coins to monitor',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Processing ${monitoredCoins.length} coins:`, monitoredCoins.map(c => c.symbol).join(', '));

    // 并行处理所有币对（限制并发数以避免压力过大）
    const BATCH_SIZE = 3; // 限低并发，降低被限流概率
    const results = [];
    
    for (let i = 0; i < monitoredCoins.length; i += BATCH_SIZE) {
      const batch = monitoredCoins.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(coin => processCoin(coin.symbol, supabase))
      );
      results.push(...batchResults);
      
      // 延迟避免触发Binance限速
      if (i + BATCH_SIZE < monitoredCoins.length) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Collection complete: ${successful} successful, ${failed} failed`);

    // 统计本轮新产生的警报数并触发 Telegram 推送
    const { count: newAlerts } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .is('telegram_sent', null)
      .gte('created_at', new Date(Date.now() - 120 * 1000).toISOString());

    if (newAlerts && newAlerts > 0) {
      console.log(`📢 Triggering telegram-alert for ${newAlerts} new alerts...`);
      const { data: alertResult, error: alertError } = await supabase.functions.invoke('telegram-alert', {
        body: { reason: 'auto-collect-cvd', newAlerts }
      });
      
      if (alertError) {
        console.error('Failed to trigger telegram-alert:', alertError);
      } else {
        console.log('✅ Telegram alert triggered:', alertResult);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: monitoredCoins.length,
        successful,
        failed,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in auto-collect-cvd:', error);
    // Return generic error to client, log details server-side
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Auto CVD collection failed' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processCoin(symbol: string, supabase: SupabaseServiceClient): Promise<void> {
  try {
    const symbolPattern = /^[A-Z0-9]{1,10}USDT$/;
    if (!symbolPattern.test(symbol)) {
      console.error(`  Invalid symbol format: ${symbol}`);
      throw new Error('Invalid symbol format');
    }

    console.log(`  Processing ${symbol}...`);

    const now = Date.now();
    const currentBucket = alignToInterval(now);

    const { data: latestRow, error: latestRowError } = await supabase
      .from('cvd_data')
      .select('timestamp, cvd, price, open_interest, open_interest_value')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRowError) {
      throw latestRowError;
    }

    const lastTimestamp = latestRow ? Number(latestRow.timestamp) : null;
    let startBucket = lastTimestamp !== null && Number.isFinite(lastTimestamp)
      ? alignToInterval(lastTimestamp) + SNAP_INTERVAL_MS
      : currentBucket - SNAP_INTERVAL_MS * (DEFAULT_BACKFILL_INTERVALS - 1);

    if (startBucket > currentBucket) {
      console.log(`  ⏭️ ${symbol}: snapshots already up to date`);
      return;
    }

    if (!Number.isFinite(startBucket)) {
      startBucket = currentBucket;
    }

    const buckets = generateBuckets(startBucket, currentBucket);
    if (buckets.length === 0) {
      console.log(`  ⏭️ ${symbol}: no buckets to process`);
      return;
    }

    const rangeStart = buckets[0];
    const rangeEndExclusive = buckets[buckets.length - 1] + SNAP_INTERVAL_MS;

    const [priceMap, oiMap, cvdDeltas] = await Promise.all([
      fetchMarkPriceSeries(symbol, rangeStart, rangeEndExclusive),
      fetchOpenInterestSeries(symbol, rangeStart, rangeEndExclusive, buckets.length),
      fetchCvdDeltas(symbol, rangeStart, rangeEndExclusive),
    ]);

    let runningCvd = latestRow ? toNumber(latestRow.cvd) : 0;
    let lastPrice = latestRow ? toNumber(latestRow.price) : NaN;
    let lastOiContracts = latestRow ? toNumber(latestRow.open_interest) : NaN;
    let lastOiValue = latestRow ? toNumber(latestRow.open_interest_value) : NaN;

    const rowsToUpsert: Array<{
      symbol: string;
      timestamp: number;
      price: number;
      cvd: number;
      open_interest: number | null;
      open_interest_value: number | null;
    }> = [];

    for (const bucketStart of buckets) {
      const price = priceMap.get(bucketStart) ?? (Number.isFinite(lastPrice) ? lastPrice : undefined);
      const oiInfo = oiMap.get(bucketStart);
      const oiContracts = oiInfo?.contracts ?? (Number.isFinite(lastOiContracts) ? lastOiContracts : null);
      const oiValue = oiInfo?.value ?? (Number.isFinite(lastOiValue) ? lastOiValue : null);
      const delta = cvdDeltas.get(bucketStart) ?? 0;
      const nextCvd = runningCvd + delta;

      if (price === undefined || !Number.isFinite(price)) {
        console.warn(`  ⚠️ ${symbol}: missing price for ${new Date(bucketStart).toISOString()}, skipping snapshot`);
        runningCvd = nextCvd;
        continue;
      }

      rowsToUpsert.push({
        symbol,
        timestamp: bucketStart,
        price,
        cvd: nextCvd,
        open_interest: oiContracts !== null && Number.isFinite(oiContracts) ? oiContracts : null,
        open_interest_value: oiValue !== null && Number.isFinite(oiValue) ? oiValue : null,
      });

      runningCvd = nextCvd;
      lastPrice = price;
      if (oiContracts !== null && Number.isFinite(oiContracts)) {
        lastOiContracts = oiContracts;
      }
      if (oiValue !== null && Number.isFinite(oiValue)) {
        lastOiValue = oiValue;
      }
    }

    if (rowsToUpsert.length === 0) {
      console.log(`  ⏭️ ${symbol}: 无可写入的快照`);
      return;
    }

    const { error: upsertError } = await supabase
      .from('cvd_data')
      .upsert(rowsToUpsert, { onConflict: 'symbol,timestamp' });

    if (upsertError) {
      throw upsertError;
    }

    const latestSnapshot = rowsToUpsert[rowsToUpsert.length - 1];
    const latestDelta = cvdDeltas.get(latestSnapshot.timestamp) ?? 0;

    console.log(
      `  ✓ ${symbol}: 写入 ${rowsToUpsert.length} 条快照，最新价格=$${latestSnapshot.price.toFixed(4)}, ΔCVD=${latestDelta.toFixed(2)}`
    );

    const alertResult = await determineAlert(symbol, supabase);

    if (alertResult.alertType !== 'NONE') {
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

      const { data: recentAlert } = await supabase
        .from('alerts')
        .select('id')
        .eq('symbol', symbol)
        .eq('alert_type', alertResult.alertType)
        .gte('created_at', new Date(fifteenMinutesAgo).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentAlert) {
        console.log(`  ⏸️ ${symbol}: ${alertResult.alertType} 在冷却中，跳过`);
        return;
      }

      await supabase.from('alerts').insert({
        symbol,
        alert_type: alertResult.alertType,
        price: latestSnapshot.price,
        cvd: latestSnapshot.cvd,
        cvd_change_percent: alertResult.cvdChangePercent,
        price_change_percent: alertResult.priceChangePercent,
        oi_change_percent: alertResult.oiChangePercent,
        details: {
          interval_ms: SNAP_INTERVAL_MS,
          snapshot_timestamp: latestSnapshot.timestamp,
          cvd_delta: latestDelta,
        },
      });

      console.log(
        `  🚨 ${symbol}: Alert=${alertResult.alertType}, 价格变化=${alertResult.priceChangePercent.toFixed(2)}%, CVD变化=${alertResult.cvdChangePercent.toFixed(2)}%, OI变化=${alertResult.oiChangePercent.toFixed(2)}%`
      );
    }
  } catch (error) {
    console.error(`  ✗ Failed to process ${symbol}:`, error);
    throw error;
  }
}

async function determineAlert(
  symbol: string,
  supabase: SupabaseServiceClient
): Promise<{ alertType: string; priceChangePercent: number; cvdChangePercent: number; oiChangePercent: number }> {
  try {
    const { data: recentData } = await supabase
      .from('cvd_data')
      .select('cvd, price, timestamp, open_interest, open_interest_value')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(60);

    if (!recentData || recentData.length < 2) {
      return { alertType: 'NONE', priceChangePercent: 0, cvdChangePercent: 0, oiChangePercent: 0 };
    }

    const typedRecentData = (recentData as CvdDataRow[]).map((entry) => ({
      cvd: toNumber(entry.cvd),
      price: toNumber(entry.price),
      timestamp: Number(entry.timestamp),
      openInterest: entry.open_interest_value !== undefined && entry.open_interest_value !== null
        ? toNumber(entry.open_interest_value)
        : entry.open_interest !== undefined && entry.open_interest !== null
          ? toNumber(entry.open_interest)
          : NaN,
    }));

    typedRecentData.sort((a, b) => b.timestamp - a.timestamp);

    const latestEntry = typedRecentData[0];
    const referenceTimestamp = latestEntry.timestamp - SNAP_INTERVAL_MS;

    let referenceEntry = typedRecentData.find((entry, index) => index > 0 && entry.timestamp <= referenceTimestamp);

    if (!referenceEntry && typedRecentData.length > 1) {
      referenceEntry = typedRecentData[typedRecentData.length - 1];
    }

    if (!referenceEntry) {
      return { alertType: 'NONE', priceChangePercent: 0, cvdChangePercent: 0, oiChangePercent: 0 };
    }

    const priceChangePercent = safePercentChange(latestEntry.price, referenceEntry.price);
    const cvdChangePercent = safePercentChange(latestEntry.cvd, referenceEntry.cvd);
    const oiChangePercent = safePercentChange(latestEntry.openInterest, referenceEntry.openInterest);

    if (Math.abs(cvdChangePercent) > 150 || Math.abs(priceChangePercent) > 50) {
      console.warn(
        `  ⚠️ ${symbol}: extreme change detected (price=${priceChangePercent.toFixed(2)}%, cvd=${cvdChangePercent.toFixed(2)}%), skip alert`
      );
      return { alertType: 'NONE', priceChangePercent: 0, cvdChangePercent: 0, oiChangePercent: 0 };
    }

    if (cvdChangePercent >= 8 && priceChangePercent >= 3 && oiChangePercent >= 3) {
      return { alertType: 'STRONG_BREAKOUT', priceChangePercent, cvdChangePercent, oiChangePercent };
    }

    if (cvdChangePercent >= 12 && Math.abs(priceChangePercent) <= 1 && oiChangePercent >= 0) {
      return { alertType: 'ACCUMULATION', priceChangePercent, cvdChangePercent, oiChangePercent };
    }

    if (cvdChangePercent <= -4 && priceChangePercent >= 1 && oiChangePercent <= 0) {
      return { alertType: 'DISTRIBUTION_WARN', priceChangePercent, cvdChangePercent, oiChangePercent };
    }

    if (cvdChangePercent <= -6 && priceChangePercent <= -2 && oiChangePercent >= 1) {
      return { alertType: 'SHORT_CONFIRM', priceChangePercent, cvdChangePercent, oiChangePercent };
    }

    if (typedRecentData.length >= 12) {
      const windowData = typedRecentData.slice(0, 12);
      const maxPrice = Math.max(...windowData.map((d) => d.price));
      const maxCvd = Math.max(...windowData.map((d) => d.cvd));
      if (latestEntry.price >= maxPrice * 0.999 && latestEntry.cvd < maxCvd * 0.92) {
        return { alertType: 'TOP_DIVERGENCE', priceChangePercent, cvdChangePercent, oiChangePercent };
      }
    }

    return { alertType: 'NONE', priceChangePercent, cvdChangePercent, oiChangePercent };
  } catch (error) {
    console.error(`Alert calculation error for ${symbol}:`, error);
    return { alertType: 'NONE', priceChangePercent: 0, cvdChangePercent: 0, oiChangePercent: 0 };
  }
}
