-- 创建清理旧CVD数据的函数（保留7天）
CREATE OR REPLACE FUNCTION cleanup_old_cvd_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 删除7天前的CVD数据
  DELETE FROM cvd_data
  WHERE timestamp < EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000;
  
  -- 删除7天前的告警数据
  DELETE FROM alerts
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  -- 记录清理日志
  RAISE NOTICE 'Cleaned up CVD data older than 7 days';
END;
$$;

-- 创建定期清理的触发器（每次插入数据时有1%的概率触发清理）
CREATE OR REPLACE FUNCTION maybe_cleanup_cvd_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1%概率触发清理（约每100次插入清理一次）
  IF random() < 0.01 THEN
    PERFORM cleanup_old_cvd_data();
  END IF;
  RETURN NEW;
END;
$$;

-- 如果触发器已存在则先删除
DROP TRIGGER IF EXISTS trigger_cleanup_cvd_data ON cvd_data;

-- 创建触发器
CREATE TRIGGER trigger_cleanup_cvd_data
  AFTER INSERT ON cvd_data
  FOR EACH STATEMENT
  EXECUTE FUNCTION maybe_cleanup_cvd_data();

-- 手动清理一次旧数据
SELECT cleanup_old_cvd_data();