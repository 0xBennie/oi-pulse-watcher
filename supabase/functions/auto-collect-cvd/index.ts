import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

interface TradeData {
  id: number;
  price: string;
  qty: string;
  time: number;
  isBuyerMaker: boolean;
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 Starting auto CVD collection...');

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

async function processCoin(symbol: string, supabase: any): Promise<void> {
  try {
    // Validate symbol format
    const symbolPattern = /^[A-Z0-9]{1,10}USDT$/;
    if (!symbolPattern.test(symbol)) {
      console.error(`  Invalid symbol format: ${symbol}`);
      throw new Error('Invalid symbol format');
    }

    console.log(`  Processing ${symbol}...`);

    // URL encode the symbol for safety
    const encodedSymbol = encodeURIComponent(symbol);

    // 如果该币对历史点过少，自动触发回填以补齐历史
    try {
      const { count } = await supabase
        .from('cvd_data')
        .select('*', { head: true, count: 'exact' })
        .eq('symbol', symbol);

      if (!count || count < 60) { // 少于约1小时的数据
        const { error: bfErr } = await supabase.functions.invoke('backfill-cvd-history', {
          body: { symbol, hoursBack: 24 },
        });
        if (bfErr) {
          console.warn(`  Backfill error for ${symbol}:`, bfErr);
        } else {
          console.log(`  ⏪ Backfilled ${symbol} for 24h`);
        }
      }
    } catch (e) {
      console.warn(`  Backfill check failed for ${symbol}:`, e);
    }

    // 获取最近1000笔交易（带重试，避免418/429限流）
    const response = await fetchWithRetry(
      `${BINANCE_API_BASE}/fapi/v1/trades?symbol=${encodedSymbol}&limit=1000`
    );

    const trades: TradeData[] = await response.json();

    // 计算CVD (不再存储原始交易数据)
    let cvd = 0;
    
    for (const trade of trades) {
      const volume = parseFloat(trade.qty);
      const delta = trade.isBuyerMaker ? -volume : volume;
      cvd += delta;
    }

    // 获取最新价格和时间戳
    const latestPrice = parseFloat(trades[trades.length - 1].price);
    const latestTimestamp = trades[trades.length - 1].time;

    // 获取上一个CVD值
    const { data: prevCvdData } = await supabase
      .from('cvd_data')
      .select('cvd')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevCvd = prevCvdData?.cvd ? parseFloat(prevCvdData.cvd) : 0;
    const cumulativeCvd = prevCvd + cvd;

    // 获取最新 OI（5m 聚合）并与CVD一起存储
    let openInterest: number | null = null;
    let openInterestValue: number | null = null;
    try {
      const oiRes = await fetchWithRetry(
        `${BINANCE_API_BASE}/futures/data/openInterestHist?symbol=${encodedSymbol}&period=5m&limit=1`
      );
      const oiArr = await oiRes.json();
      if (Array.isArray(oiArr) && oiArr.length > 0) {
        openInterest = parseFloat(oiArr[0].sumOpenInterest);
        openInterestValue = parseFloat(oiArr[0].sumOpenInterestValue);
      }
    } catch (e) {
      console.warn(`  OI fetch failed for ${symbol}:`, e);
    }

    // 存储CVD + OI 数据
    const { error: cvdError } = await supabase
      .from('cvd_data')
      .insert({
        symbol,
        timestamp: latestTimestamp,
        cvd: cumulativeCvd,
        price: latestPrice,
        open_interest: openInterest,
        open_interest_value: openInterestValue,
      });

    if (cvdError) {
      throw cvdError;
    }

    // 计算 OI 变化率（基于最近3个含OI的数据点，约4-6分钟）
    let oiChangePercent = 0;
    try {
      const { data: oiRows } = await supabase
        .from('cvd_data')
        .select('open_interest')
        .eq('symbol', symbol)
        .not('open_interest', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(3);

      if (oiRows && oiRows.length >= 3) {
        const oiNow = parseFloat(oiRows[0].open_interest as any);
        const oiPrev = parseFloat(oiRows[2].open_interest as any);
        if (isFinite(oiNow) && isFinite(oiPrev) && Math.abs(oiPrev) > 0) {
          oiChangePercent = ((oiNow - oiPrev) / Math.abs(oiPrev)) * 100;
        }
      } else {
        console.log(`  ⏭️ ${symbol}: OI 数据不足（${oiRows?.length || 0}/3），跳过 OI 计算`);
      }
    } catch (e) {
      console.warn(`  OI change calc failed for ${symbol}:`, e);
    }

    // 计算告警（返回包含价格变化率的对象）
    const alertResult = await determineAlert(
      symbol,
      cvd,
      cumulativeCvd,
      latestPrice,
      oiChangePercent,
      supabase
    );

    if (alertResult.alertType !== 'NONE') {
      // 冷却机制：检查最近15分钟内是否已有相同类型警报
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

      // 保存告警到数据库（使用实际计算的价格变化率）
      await supabase.from('alerts').insert({
        symbol,
        alert_type: alertResult.alertType,
        price: latestPrice,
        cvd: cumulativeCvd,
        cvd_change_percent: (cvd / Math.abs(prevCvd || 1)) * 100,
        price_change_percent: alertResult.priceChangePercent,
        oi_change_percent: oiChangePercent,
        details: {
          trades_count: trades.length,
          timestamp: latestTimestamp
        }
      });
      
      console.log(`  🚨 ${symbol}: Alert=${alertResult.alertType}, 价格变化=${alertResult.priceChangePercent.toFixed(2)}%`);
    }

    console.log(`  ✓ ${symbol}: CVD=${cumulativeCvd.toFixed(2)}, Price=$${latestPrice}`);

  } catch (error) {
    console.error(`  ✗ Failed to process ${symbol}:`, error);
    throw error;
  }
}

async function determineAlert(
  symbol: string,
  cvdDelta: number,
  cumulativeCvd: number,
  currentPrice: number,
  oiChangePercent: number,
  supabase: any
): Promise<{ alertType: string; priceChangePercent: number }> {
  try {
    // 获取历史数据用于计算变化率和背离
    const { data: recentData } = await supabase
      .from('cvd_data')
      .select('cvd, price, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(61); // 当前+60个历史点

    if (!recentData || recentData.length < 3) {
      return { alertType: 'NONE', priceChangePercent: 0 };
    }

    // 计算CVD变化率（最近3个点，约4-6分钟）
    const currentCVD = parseFloat(recentData[0].cvd);
    const prevCVD = parseFloat(recentData[2].cvd);
    const cvdChangePercent = ((currentCVD - prevCVD) / Math.abs(prevCVD || 1)) * 100;

    // 过滤异常值（CVD变化超过±100%通常是数据异常）
    if (Math.abs(cvdChangePercent) > 100) {
      console.warn(`  ⚠️ ${symbol}: CVD变化异常 ${cvdChangePercent.toFixed(2)}%，跳过`);
      return { alertType: 'NONE', priceChangePercent: 0 };
    }

    // 计算价格变化率（2分钟窗口：第0点和第1点）
    const priceNow = parseFloat(recentData[0].price);
    const pricePrev = parseFloat(recentData[1].price);
    const priceChangePercent = ((priceNow - pricePrev) / pricePrev) * 100;

    // 1. STRONG_BREAKOUT: CVD↑≥8%、价↑≥3%（暂时禁用OI检查）
    if (cvdChangePercent >= 8 && priceChangePercent >= 3) {
      return { alertType: 'STRONG_BREAKOUT', priceChangePercent };
    }

    // 2. ACCUMULATION: CVD↑≥15%、价格横盘±0.5%（暂时禁用OI检查）
    if (cvdChangePercent >= 15 && Math.abs(priceChangePercent) <= 0.5) {
      return { alertType: 'ACCUMULATION', priceChangePercent };
    }

    // 3. DISTRIBUTION_WARN: CVD↓≥3%、价↑≥1%
    if (cvdChangePercent <= -3 && priceChangePercent >= 1) {
      return { alertType: 'DISTRIBUTION_WARN', priceChangePercent };
    }

    // 4. SHORT_CONFIRM: CVD↓≥5%、价↓≥2%（暂时禁用OI检查）
    if (cvdChangePercent <= -5 && priceChangePercent <= -2) {
      return { alertType: 'SHORT_CONFIRM', priceChangePercent };
    }

    // 5. TOP_DIVERGENCE: 近60根内价格创新高但CVD未创新高
    if (recentData.length >= 60) {
      const prices = recentData.map((d: any) => parseFloat(d.price));
      const cvds = recentData.map((d: any) => parseFloat(d.cvd));
      
      const maxPrice = Math.max(...prices);
      const maxCVD = Math.max(...cvds);
      
      // 如果当前价格是新高（≥99.9%），但CVD显著背离（<90%）
      if (priceNow >= maxPrice * 0.999 && currentCVD < maxCVD * 0.90) {
        return { alertType: 'TOP_DIVERGENCE', priceChangePercent };
      }
    }

    return { alertType: 'NONE', priceChangePercent };
  } catch (error) {
    console.error(`Alert calculation error for ${symbol}:`, error);
    return { alertType: 'NONE', priceChangePercent: 0 };
  }
}
