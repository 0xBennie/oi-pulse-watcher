import { useState, useEffect } from 'react';
import { useCoinMonitor } from '@/hooks/useCoinMonitor';
import { CoinCard } from '@/components/CoinCard';
import { CoinManagement } from '@/components/CoinManagement';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Activity, AlertTriangle, Clock, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const { monitorData, loading, lastUpdate, coins, refresh } = useCoinMonitor();
  const [selectedCoin, setSelectedCoin] = useState<string>('');
  const [unsentCount, setUnsentCount] = useState<number>(0);
  const [pushing, setPushing] = useState(false);
  const { toast } = useToast();

  // 自动选择第一个币种
  useEffect(() => {
    if (monitorData.length > 0) {
      // 如果没有选中币种，或选中的币种不在列表中，选择第一个
      if (!selectedCoin || !monitorData.find(d => d.coin.base === selectedCoin)) {
        setSelectedCoin(monitorData[0].coin.base);
      }
    }
  }, [monitorData]);

  // 获取未发送警报数量
  useEffect(() => {
    const fetchUnsentCount = async () => {
      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .is('telegram_sent', null);
      
      setUnsentCount(count || 0);
    };

    fetchUnsentCount();
    const interval = setInterval(fetchUnsentCount, 30000); // 每30秒更新一次
    return () => clearInterval(interval);
  }, []);

  // 手动触发Telegram推送
  const handlePushAlerts = async () => {
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-alert');
      
      if (error) throw error;
      
      toast({
        title: '✅ 推送成功',
        description: `已发送 ${data?.sent || 0} 条消息到 ${data?.subscribers || 0} 个订阅者`,
      });
      
      // 刷新未发送数量
      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .is('telegram_sent', null);
      setUnsentCount(count || 0);
      
    } catch (error) {
      console.error('Push error:', error);
      toast({
        title: '❌ 推送失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setPushing(false);
    }
  };

  // 获取选中的币种数据
  const selectedCoinData = monitorData.find(d => d.coin.base === selectedCoin);

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return '从未';
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">CVD与价格监控</h1>
            <p className="text-muted-foreground mt-2">
              每1分钟自动刷新 • 强告警: 持仓量Δ ≥10% 且 5m涨幅 ≥2% | 中告警: 持仓量Δ ≥8% 且 5m涨幅 ≥1.5% | 弱告警: 持仓量Δ ≥5% 或 5m涨幅 ≥1%
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePushAlerts}
              disabled={pushing || unsentCount === 0}
              className="gap-2"
            >
              <Send className={`w-4 h-4 ${pushing ? 'animate-pulse' : ''}`} />
              立即推送警报 {unsentCount > 0 && `(${unsentCount})`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">监控币种</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading && !lastUpdate ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{coins.length}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">活跃告警</CardTitle>
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading && !lastUpdate ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">
                  {monitorData.filter((d) => d.alertLevel !== 'NONE').length}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">最后更新</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading && !lastUpdate ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold font-mono-number">
                  {formatLastUpdate(lastUpdate)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 币对管理 */}
        <CoinManagement />

        {/* 实时监控 */}
        <Card>
          <CardHeader>
            <CardTitle>实时监控</CardTitle>
            <CardDescription>
              24/7自动监控 • 每1分钟更新 • 橙色线: CVD累积量 • 紫色虚线: 价格走势
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {monitorData.length > 0 && (
                <div className="flex justify-end">
                  <Select value={selectedCoin} onValueChange={setSelectedCoin}>
                    <SelectTrigger className="w-48 bg-card border-border">
                      <SelectValue placeholder="选择币种" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {monitorData.map((data) => (
                        <SelectItem 
                          key={data.coin.base} 
                          value={data.coin.base}
                          className="hover:bg-muted focus:bg-muted cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{data.coin.base}</span>
                            <span className="text-xs text-muted-foreground">
                              ${data.price.toFixed(4)}
                            </span>
                            {data.alertLevel !== 'NONE' && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                data.alertLevel === 'STRONG_BREAKOUT' ? 'bg-green-500/10 text-green-500' :
                                data.alertLevel === 'ACCUMULATION' ? 'bg-blue-500/10 text-blue-500' :
                                data.alertLevel === 'DISTRIBUTION_WARN' ? 'bg-orange-500/10 text-orange-500' :
                                data.alertLevel === 'SHORT_CONFIRM' ? 'bg-red-500/10 text-red-500' :
                                'bg-yellow-500/10 text-yellow-500'
                              }`}>
                                {data.alertLevel}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {loading && !lastUpdate ? (
                <div className="max-w-4xl mx-auto">
                  <Skeleton className="h-[600px] w-full" />
                </div>
              ) : monitorData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="mb-2">暂无监控币种</p>
                  <p className="text-sm">请在上方"币对管理"中添加要监控的币对</p>
                </div>
              ) : selectedCoinData ? (
                <div className="max-w-4xl mx-auto">
                  <CoinCard 
                    data={selectedCoinData} 
                    onRemove={() => {
                      refresh();
                      setSelectedCoin('');
                    }} 
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>正在加载数据...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>数据来源：币安永续合约 API • 每1分钟更新一次 • CVD = 累积买卖量差</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
