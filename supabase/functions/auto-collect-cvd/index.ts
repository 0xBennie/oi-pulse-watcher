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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processCoin(symbol: string, supabase: any): Promise<void> {
  try {
    console.log(`  Processing ${symbol}...`);

    // 获取最近1000笔交易
    const response = await fetch(
      `${BINANCE_API_BASE}/fapi/v1/trades?symbol=${symbol}&limit=1000`,
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

    console.log(`  ✓ ${symbol}: CVD=${cumulativeCvd.toFixed(2)}, Price=$${latestPrice}`);

  } catch (error) {
    console.error(`  ✗ Failed to process ${symbol}:`, error);
    throw error;
  }
}
