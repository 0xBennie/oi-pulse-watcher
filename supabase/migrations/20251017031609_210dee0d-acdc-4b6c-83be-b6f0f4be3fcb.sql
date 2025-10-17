-- 创建Telegram用户表
CREATE TABLE IF NOT EXISTS public.telegram_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  chat_id TEXT NOT NULL,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略（service role可以完全访问）
CREATE POLICY "Service role can manage telegram users"
ON public.telegram_users
FOR ALL
USING (true);

-- 为alerts表添加telegram_sent字段
ALTER TABLE public.alerts 
ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN DEFAULT NULL;

-- 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON public.telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_subscribed ON public.telegram_users(subscribed);
CREATE INDEX IF NOT EXISTS idx_alerts_telegram_sent ON public.alerts(telegram_sent, created_at);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION public.update_telegram_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

CREATE TRIGGER update_telegram_users_updated_at
BEFORE UPDATE ON public.telegram_users
FOR EACH ROW
EXECUTE FUNCTION public.update_telegram_users_updated_at();