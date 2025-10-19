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

const MAX_LIMIT = 3000; // 支持最多3000个点（约6天数据）

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { symbol, limit = 1440 } = await req.json(); // 默认3天数据
    
    // Validate and bound the limit parameter
    const requestedLimit = typeof limit === 'number' ? limit : 1440;
    const safeLimit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate symbol format (alphanumeric, max 20 chars)
    const symbolPattern = /^[A-Z0-9]{3,20}$/;
    if (!symbolPattern.test(symbol)) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 获取历史CVD数据（先按时间降序取最近的安全数量，再在内存中反转为升序返回）
    const { data, error } = await supabase
      .from('cvd_data')
      .select('timestamp, cvd, price, open_interest, open_interest_value')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(safeLimit);


    if (error) {
      throw error;
    }

    type CvdRow = {
      timestamp: number;
      cvd: number;
      price: number;
      open_interest?: number | null;
      open_interest_value?: number | null;
    };

    const rows = ((data ?? []) as CvdRow[]);
    const serialized = [...rows].reverse().map((item) => ({
      timestamp: item.timestamp,
      cvd: item.cvd,
      price: item.price,
      openInterest: item.open_interest ?? null,
      openInterestValue: item.open_interest_value ?? null,
    }));

    return new Response(
      JSON.stringify({ data: serialized }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-cvd-history function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});