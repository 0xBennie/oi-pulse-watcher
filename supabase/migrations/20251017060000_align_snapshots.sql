-- Ensure cvd_data has unique symbol/timestamp pairs before enforcing constraint
DELETE FROM public.cvd_data a
USING public.cvd_data b
WHERE a.symbol = b.symbol
  AND a.timestamp = b.timestamp
  AND a.ctid < b.ctid;

ALTER TABLE public.cvd_data
  ADD CONSTRAINT IF NOT EXISTS cvd_data_symbol_timestamp_key UNIQUE (symbol, timestamp);
