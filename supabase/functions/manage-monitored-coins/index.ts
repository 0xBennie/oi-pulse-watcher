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

    const { action, id, symbol, name, enabled } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;

    switch (action) {
      case 'insert': {
        if (!symbol || !name) {
          return new Response(
            JSON.stringify({ error: 'Symbol and name are required' }),
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

        // Validate name length
        if (name.length < 1 || name.length > 50) {
          return new Response(
            JSON.stringify({ error: 'Invalid name length' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate if symbol exists on Binance Futures
        try {
          const binanceResponse = await fetch(
            `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
          );
          
          if (!binanceResponse.ok) {
            console.error(`Binance validation failed for ${symbol}: ${binanceResponse.status}`);
            return new Response(
              JSON.stringify({ error: `该币对 ${symbol} 在币安合约市场不存在或未上线` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (error) {
          console.error('Error validating symbol with Binance:', error);
          return new Response(
            JSON.stringify({ error: '无法验证币对有效性，请稍后重试' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('monitored_coins')
          .insert({
            symbol,
            name,
            enabled: true
          });

        if (result.error) {
          console.error('Insert error:', result.error);
          return new Response(
            JSON.stringify({ error: result.error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      }

      case 'cleanup_invalid': {
        // 清理所有无效币对（在Binance上不存在合约的）
        console.log('Starting cleanup of invalid coins...');
        
        // 获取所有监控币对
        const { data: coins, error: fetchError } = await supabase
          .from('monitored_coins')
          .select('id, symbol');

        if (fetchError) {
          console.error('Error fetching coins:', fetchError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch coins' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const invalidCoinIds = [];
        
        // 检查每个币对
        for (const coin of coins || []) {
          try {
            const binanceResponse = await fetch(
              `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${coin.symbol}`
            );
            
            if (!binanceResponse.ok) {
              console.log(`Found invalid coin: ${coin.symbol}`);
              invalidCoinIds.push(coin.id);
            }
          } catch (error) {
            console.error(`Error checking ${coin.symbol}:`, error);
          }
          
          // 添加小延迟避免频率限制
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 删除所有无效币对
        if (invalidCoinIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('monitored_coins')
            .delete()
            .in('id', invalidCoinIds);

          if (deleteError) {
            console.error('Error deleting invalid coins:', deleteError);
            return new Response(
              JSON.stringify({ error: 'Failed to delete invalid coins' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log(`Cleaned up ${invalidCoinIds.length} invalid coins`);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            cleaned: invalidCoinIds.length,
            message: `已清理 ${invalidCoinIds.length} 个无效币对` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'toggle': {
        if (!id || enabled === undefined) {
          return new Response(
            JSON.stringify({ error: 'ID and enabled status are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('monitored_coins')
          .update({ enabled })
          .eq('id', id);

        if (result.error) {
          console.error('Toggle error:', result.error);
          return new Response(
            JSON.stringify({ error: 'Failed to update coin status' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      }

      case 'delete': {
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('monitored_coins')
          .delete()
          .eq('id', id);

        if (result.error) {
          console.error('Delete error:', result.error);
          return new Response(
            JSON.stringify({ error: 'Failed to delete coin' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      }

      case 'clear': {
        result = await supabase
          .from('monitored_coins')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (result.error) {
          console.error('Clear error:', result.error);
          return new Response(
            JSON.stringify({ error: 'Failed to clear coins' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-monitored-coins function:', error);
    return new Response(
      JSON.stringify({ error: 'Operation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
