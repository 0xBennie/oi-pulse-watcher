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
