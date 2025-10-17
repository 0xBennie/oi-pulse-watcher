-- 删除旧的3分钟任务
SELECT cron.unschedule('auto-collect-cvd-every-3min');

-- 创建新的1分钟任务
SELECT cron.schedule(
  'auto-collect-cvd-every-1min',
  '* * * * *', -- 每1分钟
  $$
  select
    net.http_post(
        url:='https://mqyoujkxhgwhgfwsqrgh.supabase.co/functions/v1/auto-collect-cvd',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeW91amt4aGd3aGdmd3NxcmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDk0NTQsImV4cCI6MjA3NjE4NTQ1NH0.VdqyTP_sW1G9Iem4oEOAPrwbBhJyPfcBUcGfK7a4z1k"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);