import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Trash2, Plus, Power, PowerOff, Eraser } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cleanupInvalidCoins } from '@/utils/cleanupInvalidCoins';

interface MonitoredCoin {
  id: string;
  symbol: string;
  name: string;
  enabled: boolean;
  created_at: string;
}

export function CoinManagement() {
  const [coins, setCoins] = useState<MonitoredCoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchCoins();
  }, []);

  const fetchCoins = async () => {
    const { data, error } = await supabase
      .from('monitored_coins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('获取币对列表失败');
      console.error(error);
    } else {
      setCoins(data || []);
    }
  };

  const addCoin = async () => {
    if (!newSymbol || !newName) {
      toast.error('请输入币对符号和名称');
      return;
    }

    // 验证格式：必须以USDT结尾
    if (!/^[A-Z0-9]{1,10}USDT$/.test(newSymbol)) {
      toast.error('币对格式错误，必须以USDT结尾，例如: BTCUSDT');
      return;
    }

    setLoading(true);
    
    // Use service role key via edge function for write operations
    const { data, error } = await supabase.functions.invoke('manage-monitored-coins', {
      body: {
        action: 'insert',
        symbol: newSymbol.toUpperCase(),
        name: newName.toUpperCase()
      }
    });

    if (error) {
      toast.error('添加失败，请稍后重试');
      console.error('Add coin error:', error);
    } else if (data?.error) {
      if (data.error.includes('duplicate') || data.error.includes('23505')) {
        toast.error('该币对已存在');
      } else {
        toast.error('添加失败');
      }
    } else {
      toast.success(`已添加 ${newSymbol}`);
      setNewSymbol('');
      setNewName('');
      fetchCoins();
    }
    setLoading(false);
  };

  const toggleCoin = async (id: string, currentEnabled: boolean) => {
    const { data, error } = await supabase.functions.invoke('manage-monitored-coins', {
      body: {
        action: 'toggle',
        id,
        enabled: !currentEnabled
      }
    });

    if (error || data?.error) {
      toast.error('更新失败');
      console.error('Toggle coin error:', error || data?.error);
    } else {
      toast.success(currentEnabled ? '已暂停监控' : '已启用监控');
      fetchCoins();
    }
  };

  const deleteCoin = async (id: string, symbol: string) => {
    if (!confirm(`确定要删除 ${symbol} 吗？历史数据不会被删除。`)) {
      return;
    }

    const { data, error } = await supabase.functions.invoke('manage-monitored-coins', {
      body: {
        action: 'delete',
        id
      }
    });

    if (error || data?.error) {
      toast.error('删除失败');
      console.error('Delete coin error:', error || data?.error);
    } else {
      toast.success(`已删除 ${symbol}`);
      fetchCoins();
    }
  };

  const clearAllCoins = async () => {
    if (!confirm(`确定要删除所有 ${coins.length} 个监控币对吗？历史数据不会被删除。`)) {
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-monitored-coins', {
      body: {
        action: 'clear'
      }
    });

    if (error || data?.error) {
      toast.error('清空失败');
      console.error('Clear coins error:', error || data?.error);
    } else {
      toast.success('已清空所有监控币对');
      fetchCoins();
    }
    setLoading(false);
  };

  const testAutoCollect = async () => {
    setLoading(true);
    toast.loading('正在手动触发数据收集...');
    
    try {
      const { data, error } = await supabase.functions.invoke('auto-collect-cvd', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast.success(`数据收集完成！处理了 ${data.processed} 个币对`);
    } catch (error) {
      console.error(error);
      toast.error('触发失败: ' + (error as Error).message);
    }
    setLoading(false);
  };

  const backfillAllCoins = async () => {
    if (!confirm('确定要回填所有币对的7天历史数据吗？这可能需要几分钟时间。')) {
      return;
    }

    setLoading(true);
    const enabledCoins = coins.filter(c => c.enabled);
    
    toast.loading(`开始回填 ${enabledCoins.length} 个币对的历史数据...`);
    
    let successCount = 0;
    let failCount = 0;

    for (const coin of enabledCoins) {
      try {
        const { data, error } = await supabase.functions.invoke('backfill-cvd-history', {
          body: { 
            symbol: coin.symbol,
            hoursBack: 168 // 回填7天 = 7 * 24小时
          }
        });

        if (error) throw error;

        if (data?.success) {
          successCount++;
          console.log(`✅ ${coin.symbol}: ${data.dataPoints} 个数据点`);
        }
      } catch (error) {
        failCount++;
        console.error(`❌ ${coin.symbol} 回填失败:`, error);
      }
      
      // 小延迟避免过载
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setLoading(false);
    toast.success(`回填完成！成功: ${successCount}, 失败: ${failCount}`);
  };

  const handleCleanupInvalid = async () => {
    if (!confirm('确定要清理所有无效币对吗？（在币安合约市场不存在的币对将被删除）')) {
      return;
    }

    setLoading(true);
    const result = await cleanupInvalidCoins();
    setLoading(false);

    if (result.success) {
      fetchCoins(); // 刷新列表
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>监控币对管理</CardTitle>
            <CardDescription>
              添加要24/7持续监控的币对（每1分钟自动收集CVD数据）
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={backfillAllCoins} 
              disabled={loading || coins.length === 0}
              variant="default"
              size="sm"
            >
              回填7天历史数据
            </Button>
            <Button 
              onClick={handleCleanupInvalid} 
              disabled={loading || coins.length === 0}
              variant="destructive"
              size="sm"
            >
              <Eraser className="w-4 h-4 mr-1" />
              清理无效币对
            </Button>
            <Button 
              onClick={clearAllCoins} 
              disabled={loading || coins.length === 0}
              variant="outline"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              清空所有
            </Button>
            <Button 
              onClick={testAutoCollect} 
              disabled={loading || coins.length === 0}
              variant="outline"
              size="sm"
            >
              手动触发收集
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 添加新币对 */}
        <div className="flex gap-2">
          <Input
            placeholder="币对符号 (如: BTCUSDT)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && addCoin()}
            className="flex-1"
          />
          <Input
            placeholder="名称 (如: BTC)"
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && addCoin()}
            className="w-32"
          />
          <Button 
            onClick={addCoin} 
            disabled={loading}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加
          </Button>
        </div>

        {/* 币对列表 */}
        <div className="space-y-2">
          {coins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无监控币对，请先添加
            </div>
          ) : (
            coins.map((coin) => (
              <div
                key={coin.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={coin.enabled ? "default" : "secondary"}>
                    {coin.name}
                  </Badge>
                  <span className="font-mono text-sm">{coin.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleCoin(coin.id, coin.enabled)}
                  >
                    {coin.enabled ? (
                      <Power className="w-4 h-4 text-green-500" />
                    ) : (
                      <PowerOff className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCoin(coin.id, coin.symbol)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="text-xs text-muted-foreground pt-4 border-t">
          <p className="mb-1">💡 提示：</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>币对格式必须与币安期货一致，必须以USDT结尾（如: BTCUSDT, ETHUSDT）</li>
            <li>添加时会自动验证币对在币安合约市场是否存在</li>
            <li>新增币对后，点击"回填7天历史数据"按钮来获取过往数据</li>
            <li>定时任务每1分钟自动执行一次，持续积累数据</li>
            <li>可以随时暂停/启用单个币对的监控</li>
            <li>点击"清理无效币对"可自动删除在币安已下线的合约</li>
            <li>删除币对不会删除历史CVD数据</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
