-- 为 cvd_data 表添加 OI 数据字段
ALTER TABLE public.cvd_data
ADD COLUMN IF NOT EXISTS open_interest NUMERIC,
ADD COLUMN IF NOT EXISTS open_interest_value NUMERIC;

-- 添加索引以优化 OI 数据查询
CREATE INDEX IF NOT EXISTS idx_cvd_data_symbol_timestamp_oi 
ON public.cvd_data(symbol, timestamp DESC) 
INCLUDE (open_interest, open_interest_value);

-- 添加注释说明字段用途
COMMENT ON COLUMN public.cvd_data.open_interest IS '持仓量（币数）- 来自 Binance /fapi/v1/openInterest';
COMMENT ON COLUMN public.cvd_data.open_interest_value IS '持仓量价值（USDT）- 来自 Binance /futures/data/openInterestHist';