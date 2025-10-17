-- Fix Critical: Restrict write access to monitored_coins table
-- Drop existing permissive policies that allow anyone to write
DROP POLICY IF EXISTS "Anyone can insert monitored coins" ON public.monitored_coins;
DROP POLICY IF EXISTS "Anyone can update monitored coins" ON public.monitored_coins;
DROP POLICY IF EXISTS "Anyone can delete monitored coins" ON public.monitored_coins;

-- Create restricted policies: only service role can write
CREATE POLICY "Service role can insert monitored coins"
ON public.monitored_coins
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update monitored coins"
ON public.monitored_coins
FOR UPDATE
TO service_role
USING (true);

CREATE POLICY "Service role can delete monitored coins"
ON public.monitored_coins
FOR DELETE
TO service_role
USING (true);

-- Add symbol format validation at database level
ALTER TABLE public.monitored_coins
ADD CONSTRAINT symbol_format_check 
CHECK (symbol ~ '^[A-Z0-9]{1,10}USDT$');

-- Add validation for name field
ALTER TABLE public.monitored_coins
ADD CONSTRAINT name_length_check 
CHECK (length(name) >= 1 AND length(name) <= 50);