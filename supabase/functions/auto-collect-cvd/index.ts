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
    const BATCH_SIZE = 5;
    const results = [];
    
    for (let i = 0; i < monitoredCoins.length; i += BATCH_SIZE) {
      const batch = monitoredCoins.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(coin => processCoin(coin.symbol, supabase))
      );
      results.push(...batchResults);
      
      // 小延迟避免触发Binance限速
      if (i + BATCH_SIZE < monitoredCoins.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Collection complete: ${successful} successful, ${failed} failed`);

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

    // 获取最近1000笔交易
    const response = await fetch(
      `${BINANCE_API_BASE}/fapi/v1/trades?symbol=${encodedSymbol}&limit=1000`,
      { signal: AbortSignal.timeout(10000) } // 10秒超时
    );

    if (!response.ok) {
      throw new Error(`Binance API error for ${symbol}: ${response.status}`);
    }

    const trades: TradeData[] = await response.json();

    // 计算CVD
    let cvd = 0;
    const tradeRecords = [];
    
    for (const trade of trades) {
      const volume = parseFloat(trade.qty);
      const delta = trade.isBuyerMaker ? -volume : volume;
      cvd += delta;

      tradeRecords.push({
        symbol,
        timestamp: trade.time,
        price: parseFloat(trade.price),
        quantity: volume,
        is_buyer_maker: trade.isBuyerMaker,
      });
    }

    // 批量插入交易数据（异步执行，不阻塞主流程）
    supabase
      .from('trade_data')
      .insert(tradeRecords)
      .then(({ error }: any) => {
        if (error) {
          console.error(`  ⚠️ Trade data insert warning for ${symbol}:`, error.message);
        }
      })
      .catch((err: Error) => {
        console.error(`  ⚠️ Trade data insert error for ${symbol}:`, err);
      });

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

    // 存储CVD数据
    const { error: cvdError } = await supabase
      .from('cvd_data')
      .insert({
        symbol,
        timestamp: latestTimestamp,
        cvd: cumulativeCvd,
        price: latestPrice,
      });

    if (cvdError) {
      throw cvdError;
    }

    // 获取上一个OI值计算变化率
    const { data: prevOIData } = await supabase
      .from('cvd_data')
      .select('price')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(3)
      .maybeSingle();

    let oiChangePercent = 0;
    // 这里简化处理，实际应该存储OI历史
    
    // 计算告警
    const alertType = await determineAlert(
      symbol,
      cvd,
      cumulativeCvd,
      latestPrice,
      oiChangePercent,
      supabase
    );

    if (alertType !== 'NONE') {
      // 保存告警到数据库
      await supabase.from('alerts').insert({
        symbol,
        alert_type: alertType,
        price: latestPrice,
        cvd: cumulativeCvd,
        cvd_change_percent: (cvd / Math.abs(prevCvd || 1)) * 100,
        price_change_percent: 0, // 这里需要历史价格数据
        oi_change_percent: oiChangePercent,
        details: {
          trades_count: trades.length,
          timestamp: latestTimestamp
        }
      });
      
      console.log(`  🚨 ${symbol}: Alert=${alertType}`);
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
): Promise<string> {
  try {
    // 获取历史数据用于计算变化率和背离
    const { data: recentData } = await supabase
      .from('cvd_data')
      .select('cvd, price, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(61); // 当前+60个历史点

    if (!recentData || recentData.length < 3) {
      return 'NONE';
    }

    // 计算CVD变化率（最近3个点，约9分钟）
    const currentCVD = parseFloat(recentData[0].cvd);
    const prevCVD = parseFloat(recentData[2].cvd);
    const cvdChangePercent = ((currentCVD - prevCVD) / Math.abs(prevCVD || 1)) * 100;

    // 计算价格变化率
    const priceNow = parseFloat(recentData[0].price);
    const pricePrev = parseFloat(recentData[2].price);
    const priceChangePercent = ((priceNow - pricePrev) / pricePrev) * 100;

    // 1. STRONG_BREAKOUT: CVD↑≥5%、价↑≥2%、OI↑≥5%
    if (cvdChangePercent >= 5 && priceChangePercent >= 2 && oiChangePercent >= 5) {
      return 'STRONG_BREAKOUT';
    }

    // 2. ACCUMULATION: CVD↑≥8%、价格横盘±1%、OI持平或上升
    if (cvdChangePercent >= 8 && Math.abs(priceChangePercent) <= 1 && oiChangePercent >= 0) {
      return 'ACCUMULATION';
    }

    // 3. DISTRIBUTION_WARN: CVD↓≥3%、价↑≥1%
    if (cvdChangePercent <= -3 && priceChangePercent >= 1) {
      return 'DISTRIBUTION_WARN';
    }

    // 4. SHORT_CONFIRM: CVD↓≥5%、价↓≥2%、OI↑
    if (cvdChangePercent <= -5 && priceChangePercent <= -2 && oiChangePercent > 0) {
      return 'SHORT_CONFIRM';
    }

    // 5. TOP_DIVERGENCE: 近60根内价格创新高但CVD未创新高
    if (recentData.length >= 60) {
      const prices = recentData.map((d: any) => parseFloat(d.price));
      const cvds = recentData.map((d: any) => parseFloat(d.cvd));
      
      const maxPrice = Math.max(...prices);
      const maxCVD = Math.max(...cvds);
      
      // 如果当前价格是新高（或接近），但CVD不是新高
      if (priceNow >= maxPrice * 0.998 && currentCVD < maxCVD * 0.95) {
        return 'TOP_DIVERGENCE';
      }
    }

    return 'NONE';
  } catch (error) {
    console.error(`Alert calculation error for ${symbol}:`, error);
    return 'NONE';
  }
}
