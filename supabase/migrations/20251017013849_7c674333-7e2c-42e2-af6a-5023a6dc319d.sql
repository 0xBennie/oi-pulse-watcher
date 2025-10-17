-- 创建监控币对列表表
CREATE TABLE IF NOT EXISTS public.monitored_coins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE, -- 币安交易对符号，如 BTCUSDT
  name TEXT NOT NULL, -- 显示名称，如 BTC
  enabled BOOLEAN NOT NULL DEFAULT true, -- 是否启用监控
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.monitored_coins ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取监控列表
CREATE POLICY "Anyone can read monitored coins"
  ON public.monitored_coins
  FOR SELECT
  USING (true);

-- 允许所有人添加币对（实际应用中可以限制为认证用户）
CREATE POLICY "Anyone can insert monitored coins"
  ON public.monitored_coins
  FOR INSERT
  WITH CHECK (true);

-- 允许所有人更新币对
CREATE POLICY "Anyone can update monitored coins"
  ON public.monitored_coins
  FOR UPDATE
  USING (true);

-- 允许所有人删除币对
CREATE POLICY "Anyone can delete monitored coins"
  ON public.monitored_coins
  FOR DELETE
  USING (true);

-- 创建更新时间戳的触发器函数
CREATE OR REPLACE FUNCTION public.update_monitored_coins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER update_monitored_coins_updated_at
  BEFORE UPDATE ON public.monitored_coins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monitored_coins_updated_at();

-- 启用pg_cron和pg_net扩展（用于定时任务）
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 创建定时任务：每3分钟自动收集CVD数据
-- 注意：这个任务会调用即将创建的auto-collect-cvd函数
SELECT cron.schedule(
  'auto-collect-cvd-every-3min',
  '*/3 * * * *', -- 每3分钟执行一次
  $$
  SELECT
    net.http_post(
      url:='https://mqyoujkxhgwhgfwsqrgh.supabase.co/functions/v1/auto-collect-cvd',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeW91amt4aGd3aGdmd3NxcmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDk0NTQsImV4cCI6MjA3NjE4NTQ1NH0.VdqyTP_sW1G9Iem4oEOAPrwbBhJyPfcBUcGfK7a4z1k"}'::jsonb,
      body:='{"trigger": "cron"}'::jsonb
    ) as request_id;
  $$
);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_monitored_coins_enabled ON public.monitored_coins(enabled);
CREATE INDEX IF NOT EXISTS idx_monitored_coins_symbol ON public.monitored_coins(symbol);