import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BINANCE_API_BASE = 'https://fapi.binance.com';

interface TradeData {
  id: number;
  price: string;
  qty: string;
  time: number; // trades API使用time字段
  isBuyerMaker: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { symbol } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Collecting trades for ${symbol}`);

    // 获取最近1000笔交易（使用trades而不是aggTrades，aggTrades没有isBuyerMaker字段）
    const response = await fetch(
      `${BINANCE_API_BASE}/fapi/v1/trades?symbol=${symbol}&limit=1000`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Binance API error for ${symbol}:`, errorText);
      throw new Error(`Failed to fetch trades: ${response.status}`);
    }

    const trades: TradeData[] = await response.json();
    console.log(`Fetched ${trades.length} trades for ${symbol}`);

    // 计算CVD
    let cvd = 0;
    const tradeRecords = [];
    
    for (const trade of trades) {
      const volume = parseFloat(trade.qty);
      const delta = trade.isBuyerMaker ? -volume : volume; // 买单为正，卖单为负
      cvd += delta;

      tradeRecords.push({
        symbol,
        timestamp: trade.time,
        price: parseFloat(trade.price),
        quantity: volume,
        is_buyer_maker: trade.isBuyerMaker,
      });
    }

    // 存储交易数据（批量插入）
    const { error: tradeError } = await supabase
      .from('trade_data')
      .insert(tradeRecords);

    if (tradeError) {
      console.error('Error inserting trade data:', tradeError);
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
      console.error('Error inserting CVD data:', cvdError);
      throw cvdError;
    }

    console.log(`CVD calculated for ${symbol}: ${cumulativeCvd}`);

    return new Response(
      JSON.stringify({ 
        symbol, 
        cvd: cumulativeCvd, 
        price: latestPrice,
        timestamp: latestTimestamp,
        tradesProcessed: trades.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in collect-cvd function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});