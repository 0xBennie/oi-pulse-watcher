-- 删除清理触发器
DROP TRIGGER IF EXISTS trigger_cleanup_cvd_data ON cvd_data;

-- 删除清理函数
DROP FUNCTION IF EXISTS maybe_cleanup_cvd_data();
DROP FUNCTION IF EXISTS cleanup_old_cvd_data();