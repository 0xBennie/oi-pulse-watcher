import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * 清理数据库中所有无效的币对（在币安合约市场不存在的）
 */
export async function cleanupInvalidCoins() {
  try {
    console.log('Starting cleanup of invalid coins...');
    toast.info('正在清理无效币对...');

    const { data, error } = await supabase.functions.invoke('manage-monitored-coins', {
      body: { action: 'cleanup_invalid' }
    });

    if (error) {
      console.error('Error cleaning up invalid coins:', error);
      toast.error('清理无效币对失败');
      return { success: false, cleaned: 0 };
    }

    console.log('Cleanup result:', data);
    
    if (data.cleaned > 0) {
      toast.success(data.message || `已清理 ${data.cleaned} 个无效币对`);
    } else {
      toast.success('所有币对均有效');
    }

    return { success: true, cleaned: data.cleaned };
  } catch (error) {
    console.error('Error in cleanup process:', error);
    toast.error('清理过程出错');
    return { success: false, cleaned: 0 };
  }
}
