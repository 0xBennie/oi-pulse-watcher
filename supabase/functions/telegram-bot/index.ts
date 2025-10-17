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

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    const update: TelegramUpdate = await req.json();
    console.log('Received update:', JSON.stringify(update));

    if (!update.message?.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const userId = update.message.from.id;
    const username = update.message.from.username || update.message.from.first_name;

    console.log(`Message from ${username} (${userId}): ${text}`);

    // 处理命令
    if (text.startsWith('/start')) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `👋 欢迎使用币对监控Bot！

命令列表：
/subscribe - 订阅所有监控币对的警报
/unsubscribe - 取消订阅
/status - 查看订阅状态
/list - 查看当前监控的币对
/price SYMBOL - 查询币对价格（示例：/price BTCUSDT）

订阅后，当监控的币对出现强烈信号（如强势突破、顶部背离等）时，会自动推送消息给你！`
      );

      // 记录用户
      await supabase.from('telegram_users').upsert({
        telegram_id: userId.toString(),
        username,
        chat_id: chatId.toString(),
        subscribed: false,
      }, { onConflict: 'telegram_id' });

    } else if (text.startsWith('/subscribe')) {
      // 订阅警报
      const { error } = await supabase
        .from('telegram_users')
        .upsert({
          telegram_id: userId.toString(),
          username,
          chat_id: chatId.toString(),
          subscribed: true,
        }, { onConflict: 'telegram_id' });

      if (error) {
        console.error('Subscribe error:', error);
        await sendTelegramMessage(botToken, chatId, '❌ 订阅失败，请稍后重试');
      } else {
        await sendTelegramMessage(botToken, chatId, '✅ 订阅成功！你将收到所有监控币对的警报通知');
      }

    } else if (text.startsWith('/unsubscribe')) {
      // 取消订阅
      const { error } = await supabase
        .from('telegram_users')
        .update({ subscribed: false })
        .eq('telegram_id', userId.toString());

      if (error) {
        console.error('Unsubscribe error:', error);
        await sendTelegramMessage(botToken, chatId, '❌ 取消订阅失败');
      } else {
        await sendTelegramMessage(botToken, chatId, '✅ 已取消订阅');
      }

    } else if (text.startsWith('/status')) {
      // 查看订阅状态
      const { data } = await supabase
        .from('telegram_users')
        .select('subscribed')
        .eq('telegram_id', userId.toString())
        .maybeSingle();

      const status = data?.subscribed ? '✅ 已订阅' : '❌ 未订阅';
      await sendTelegramMessage(botToken, chatId, `当前状态: ${status}`);

    } else if (text.startsWith('/list')) {
      // 查看监控币对
      const { data: coins } = await supabase
        .from('monitored_coins')
        .select('symbol, name')
        .eq('enabled', true);

      if (!coins || coins.length === 0) {
        await sendTelegramMessage(botToken, chatId, '当前没有监控的币对');
      } else {
        const list = coins.map(c => `${c.name} (${c.symbol})`).join('\n');
        await sendTelegramMessage(botToken, chatId, `📊 监控中的币对 (${coins.length}个):\n\n${list}`);
      }

    } else if (text.startsWith('/stats')) {
      // 市场统计数据
      try {
        // 获取所有启用的币对
        const { data: coins } = await supabase
          .from('monitored_coins')
          .select('symbol, name')
          .eq('enabled', true)
          .limit(10);

        if (!coins || coins.length === 0) {
          await sendTelegramMessage(botToken, chatId, '❌ 暂无监控币对');
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 获取每个币对的多时间周期数据
        const statsPromises = coins.map(async (coin) => {
          const symbol = coin.symbol;
          
          // 获取CVD历史数据（最近300个点，约5小时）
          const { data: cvdData } = await supabase
            .from('cvd_data')
            .select('cvd, price, open_interest, timestamp')
            .eq('symbol', symbol)
            .order('timestamp', { ascending: false })
            .limit(300);

          if (!cvdData || cvdData.length < 30) {
            return null; // 数据不足
          }

          // 获取24小时Binance数据
          const binanceRes = await fetch(
            `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
          );
          const binance24h = binanceRes.ok ? await binanceRes.json() : null;

          // 计算各时间周期变化率
          const now = cvdData[0];
          const m5 = cvdData[3] || cvdData[2];   // ~5分钟前
          const m15 = cvdData[9] || cvdData[8];  // ~15分钟前
          const h1 = cvdData[30] || cvdData[29]; // ~1小时前
          const h4 = cvdData[120] || cvdData[119]; // ~4小时前
          const h24 = cvdData[144] || cvdData[143]; // ~24小时前
          const h48 = cvdData[288] || cvdData[287]; // ~48小时前

          const calc = (curr: any, prev: any, field: string) => {
            if (!prev || !curr) return 0;
            const c = parseFloat(curr[field]);
            const p = parseFloat(prev[field]);
            return p !== 0 ? ((c - p) / Math.abs(p)) * 100 : 0;
          };

          return {
            symbol: coin.name,
            oi_5m: calc(now, m5, 'open_interest'),
            oi_15m: calc(now, m15, 'open_interest'),
            oi_1h: calc(now, h1, 'open_interest'),
            oi_4h: calc(now, h4, 'open_interest'),
            oi_24h: calc(now, h24, 'open_interest'),
            oi_48h: calc(now, h48, 'open_interest'),
            cvd_5m: calc(now, m5, 'cvd'),
            cvd_15m: calc(now, m15, 'cvd'),
            cvd_1h: calc(now, h1, 'cvd'),
            price_5m: calc(now, m5, 'price'),
            price_15m: calc(now, m15, 'price'),
            price_1h: calc(now, h1, 'price'),
            price_24h: binance24h ? parseFloat(binance24h.priceChangePercent) : 0,
          };
        });

        const allStats = (await Promise.all(statsPromises)).filter(s => s !== null);
        
        // 按OI 1小时涨幅排序
        allStats.sort((a, b) => Math.abs(b!.oi_1h) - Math.abs(a!.oi_1h));

        // 格式化输出
        const formatNum = (n: number) => {
          const sign = n >= 0 ? '+' : '';
          return `${sign}${n.toFixed(1)}`;
        };

        const pad = (str: string, len: number) => str.padEnd(len, ' ');

        let message = '📊 市场监控（按OI-1h排序）\n\n';
        
        allStats.slice(0, 10).forEach((stat, i) => {
          const s = stat!;
          message += `${i + 1}. ${s.symbol}\n`;
          message += `     5m    15m    1h     4h    24h    48h\n`;
          message += `OI ${pad(formatNum(s.oi_5m), 5)} ${pad(formatNum(s.oi_15m), 6)} ${pad(formatNum(s.oi_1h), 6)} ${pad(formatNum(s.oi_4h), 5)} ${pad(formatNum(s.oi_24h), 6)} ${formatNum(s.oi_48h)}\n`;
          message += `CV ${pad(formatNum(s.cvd_5m), 5)} ${pad(formatNum(s.cvd_15m), 6)} ${pad(formatNum(s.cvd_1h), 6)} -- -- --\n`;
          message += `P  ${pad(formatNum(s.price_5m), 5)} ${pad(formatNum(s.price_15m), 6)} ${pad(formatNum(s.price_1h), 6)} -- ${pad(formatNum(s.price_24h), 6)} --\n\n`;
        });

        await sendTelegramMessage(botToken, chatId, message);
      } catch (error) {
        console.error('Stats error:', error);
        await sendTelegramMessage(botToken, chatId, '❌ 数据查询失败');
      }

    } else if (text.startsWith('/price ')) {
      // 查询价格
      const symbol = text.replace('/price ', '').trim().toUpperCase();
      
      try {
        const response = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
        );

        if (!response.ok) {
          await sendTelegramMessage(botToken, chatId, `❌ 未找到币对 ${symbol}`);
        } else {
          const data = await response.json();
          const price = parseFloat(data.lastPrice);
          const change = parseFloat(data.priceChangePercent);
          const volume = parseFloat(data.quoteVolume);
          
          const emoji = change >= 0 ? '📈' : '📉';
          const changeText = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
          
          await sendTelegramMessage(
            botToken,
            chatId,
            `${emoji} ${symbol}\n\n💰 价格: $${price}\n📊 24h涨跌: ${changeText}\n💵 24h成交额: $${(volume / 1000000).toFixed(2)}M`
          );
        }
      } catch (error) {
        console.error('Price query error:', error);
        await sendTelegramMessage(botToken, chatId, '❌ 查询失败，请稍后重试');
      }

    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        '❓ 未知命令。输入 /start 查看帮助'
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in telegram-bot function:', error);
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
      text: escapeHtml(text),
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
