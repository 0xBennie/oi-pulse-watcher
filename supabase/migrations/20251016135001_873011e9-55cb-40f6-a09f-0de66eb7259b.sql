-- 创建CVD数据表
CREATE TABLE IF NOT EXISTS public.cvd_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  cvd NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 创建索引以优化查询
CREATE INDEX idx_cvd_symbol_timestamp ON public.cvd_data(symbol, timestamp DESC);

-- 启用RLS
ALTER TABLE public.cvd_data ENABLE ROW LEVEL SECURITY;

-- 创建公开读取策略（所有人可以读取CVD数据）
CREATE POLICY "Anyone can read CVD data"
ON public.cvd_data
FOR SELECT
USING (true);

-- 创建交易数据表（用于计算CVD）
CREATE TABLE IF NOT EXISTS public.trade_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  is_buyer_maker BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 创建索引
CREATE INDEX idx_trade_symbol_timestamp ON public.trade_data(symbol, timestamp DESC);

-- 启用RLS
ALTER TABLE public.trade_data ENABLE ROW LEVEL SECURITY;

-- 创建公开读取策略
CREATE POLICY "Anyone can read trade data"
ON public.trade_data
FOR SELECT
USING (true);