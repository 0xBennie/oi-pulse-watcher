-- Create alerts table to store all alert events
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  price NUMERIC NOT NULL,
  cvd NUMERIC NOT NULL,
  cvd_change_percent NUMERIC NOT NULL,
  price_change_percent NUMERIC NOT NULL,
  oi_change_percent NUMERIC NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON public.alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON public.alerts(alert_type);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read alerts
CREATE POLICY "Anyone can read alerts"
  ON public.alerts
  FOR SELECT
  USING (true);

-- Only service role can insert alerts (from edge functions)
CREATE POLICY "Service role can insert alerts"
  ON public.alerts
  FOR INSERT
  WITH CHECK (true);