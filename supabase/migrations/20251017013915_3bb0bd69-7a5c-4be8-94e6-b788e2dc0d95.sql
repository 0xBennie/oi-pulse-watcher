-- 修复函数的 search_path 安全问题
ALTER FUNCTION public.update_monitored_coins_updated_at() SET search_path = public;