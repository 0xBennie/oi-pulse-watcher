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

const ALERT_EMOJI: Record<string, string> = {
  'STRONG_BREAKOUT': '🚀',
  'ACCUMULATION': '📊',
  'DISTRIBUTION_WARN': '⚠️',
  'SHORT_CONFIRM': '📉',
  'TOP_DIVERGENCE': '🔴',
};

const ALERT_TEXT: Record<string, string> = {
  'STRONG_BREAKOUT': '强势突破',
  'ACCUMULATION': '吸筹信号',
  'DISTRIBUTION_WARN': '派发警告',
  'SHORT_CONFIRM': '做空确认',
  'TOP_DIVERGENCE': '顶部背离',
};

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
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    if (!botToken) {
      console.log('TELEGRAM_BOT_TOKEN not configured, skipping alert');
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('🔔 Checking for new alerts to send...');

    // 批量获取未发送的警报（不限时间，按时间从旧到新，限制数量避免超时）
    const BATCH_LIMIT = 100;
    
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .is('telegram_sent', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (alertsError) {
      console.error('Error fetching alerts:', alertsError);
      throw alertsError;
    }

    if (!alerts || alerts.length === 0) {
      console.log('No unsent alerts to send');
      return new Response(JSON.stringify({ ok: true, alerts: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📬 Found ${alerts.length} unsent alerts (batch limit: ${BATCH_LIMIT})`);

    // 获取所有订阅用户
    const { data: subscribers } = await supabase
      .from('telegram_users')
      .select('chat_id')
      .eq('subscribed', true);

    if (!subscribers || subscribers.length === 0) {
      console.log('No subscribers found');
      
      // 标记警报为已尝试发送
      await supabase
        .from('alerts')
        .update({ telegram_sent: true })
        .in('id', alerts.map(a => a.id));
      
      return new Response(JSON.stringify({ ok: true, subscribers: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Sending to ${subscribers.length} subscribers`);

    // 批量发送警报
    let sentCount = 0;
    for (const alert of alerts) {
      const emoji = ALERT_EMOJI[alert.alert_type] || '🔔';
      const alertName = ALERT_TEXT[alert.alert_type] || alert.alert_type;
      
      const message = `${emoji} <b>${alertName}</b>

💎 币对: ${alert.symbol}
💰 价格: $${parseFloat(alert.price).toFixed(6)}
📊 CVD: ${parseFloat(alert.cvd).toFixed(0)}
📈 CVD变化: ${parseFloat(alert.cvd_change_percent).toFixed(2)}%
📉 价格变化: ${parseFloat(alert.price_change_percent).toFixed(2)}%
🔄 OI变化: ${parseFloat(alert.oi_change_percent).toFixed(2)}%

⏰ ${new Date(alert.created_at).toLocaleString('zh-CN')}`;

      // 发送给所有订阅者
      for (const subscriber of subscribers) {
        try {
          await sendTelegramMessage(botToken, parseInt(subscriber.chat_id), message);
          sentCount++;
          
          // 小延迟避免Telegram限流
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to send to ${subscriber.chat_id}:`, error);
        }
      }

      // 标记警报为已发送
      await supabase
        .from('alerts')
        .update({ telegram_sent: true })
        .eq('id', alert.id);
    }

    console.log(`✅ Sent ${sentCount} messages`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        alerts: alerts.length,
        subscribers: subscribers.length,
        sent: sentCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in telegram-alert function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to send telegram message:', error);
    throw new Error('Failed to send message');
  }

  return response.json();
}
