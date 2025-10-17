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

interface AggTrade {
  a: number; // Aggregate tradeId
  p: string; // Price
  q: string; // Quantity
  f: number; // First tradeId
  l: number; // Last tradeId
  T: number; // Timestamp
  m: boolean; // Was the buyer the maker?
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

    const { symbol, hoursBack = 24 } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate symbol format
    const symbolPattern = /^[A-Z0-9]{1,10}USDT$/;
    if (!symbolPattern.test(symbol)) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`回填 ${symbol} 最近 ${hoursBack} 小时的历史CVD数据...`);

    const now = Date.now();
    const startTime = now - (hoursBack * 60 * 60 * 1000);
    const encodedSymbol = encodeURIComponent(symbol);
    
    // 分批获取数据，每次最多1000条
    let allTrades: AggTrade[] = [];
    let currentStartTime = startTime;
    let batchCount = 0;
    const maxBatches = 100; // 限制最大批次数，防止无限循环

    console.log(`开始时间: ${new Date(startTime).toISOString()}`);
    console.log(`结束时间: ${new Date(now).toISOString()}`);

    while (currentStartTime < now && batchCount < maxBatches) {
      const url = `${BINANCE_API_BASE}/fapi/v1/aggTrades?symbol=${encodedSymbol}&startTime=${currentStartTime}&limit=1000`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Binance API error: ${errorText}`);
        throw new Error('Failed to fetch historical trades');
      }

      const trades: AggTrade[] = await response.json();
      
      if (trades.length === 0) {
        break;
      }

      allTrades.push(...trades);
      currentStartTime = trades[trades.length - 1].T + 1;
      batchCount++;
      
      console.log(`批次 ${batchCount}: 获取了 ${trades.length} 条交易，总计 ${allTrades.length} 条`);
      
      // 小延迟避免触发限速
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`总共获取 ${allTrades.length} 条历史交易数据`);

    if (allTrades.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: '未找到历史数据',
          dataPoints: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 按时间间隔（如每分钟）聚合CVD数据
    const intervalMs = 60 * 1000; // 1分钟
    const cvdByInterval = new Map<number, { cvd: number; price: number; timestamp: number }>();

    let runningCvd = 0;
    
    for (const trade of allTrades) {
      const volume = parseFloat(trade.q);
      const delta = trade.m ? -volume : volume; // m=true表示买方是maker（卖单），所以是负
      runningCvd += delta;

      const intervalKey = Math.floor(trade.T / intervalMs) * intervalMs;
      
      cvdByInterval.set(intervalKey, {
        cvd: runningCvd,
        price: parseFloat(trade.p),
        timestamp: trade.T
      });
    }

    console.log(`聚合为 ${cvdByInterval.size} 个数据点`);

    // 获取现有最早的CVD数据，用于衔接
    const { data: existingData } = await supabase
      .from('cvd_data')
      .select('cvd, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: true })
      .limit(1)
      .maybeSingle();

    // 准备插入数据
    const cvdRecords = Array.from(cvdByInterval.values()).map(point => ({
      symbol,
      timestamp: point.timestamp,
      cvd: point.cvd,
      price: point.price,
    }));

    // 如果有现有数据，调整CVD值以衔接
    if (existingData && cvdRecords.length > 0) {
      const offset = parseFloat(existingData.cvd) - cvdRecords[cvdRecords.length - 1].cvd;
      console.log(`调整CVD偏移量: ${offset}`);
      
      cvdRecords.forEach(record => {
        record.cvd += offset;
      });
    }

    // 批量插入CVD数据
    const { error: cvdError } = await supabase
      .from('cvd_data')
      .upsert(cvdRecords, { 
        onConflict: 'symbol,timestamp',
        ignoreDuplicates: false 
      });

    if (cvdError) {
      console.error('Error inserting CVD data:', cvdError);
      throw cvdError;
    }

    console.log(`✅ 成功回填 ${symbol} 的 ${cvdRecords.length} 个CVD数据点`);

    return new Response(
      JSON.stringify({ 
        success: true,
        symbol,
        dataPoints: cvdRecords.length,
        timeRange: {
          start: new Date(startTime).toISOString(),
          end: new Date(now).toISOString()
        },
        tradesProcessed: allTrades.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in backfill-cvd-history:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to backfill historical data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
