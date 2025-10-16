import { useCoinMonitor } from '@/hooks/useCoinMonitor';
import { AddCoinDialog } from '@/components/AddCoinDialog';
import { MonitorGrid } from '@/components/MonitorGrid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, AlertTriangle, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const Index = () => {
  const { monitorData, loading, lastUpdate, coins, refresh } = useCoinMonitor(10000);

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
            <h1 className="text-4xl font-bold tracking-tight">持仓量与涨幅监控</h1>
            <p className="text-muted-foreground mt-2">
              币安永续合约实时监控面板
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <AddCoinDialog onCoinAdded={refresh} />
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

        <Card>
          <CardHeader>
            <CardTitle>监控面板</CardTitle>
            <CardDescription>
              每10秒自动刷新 • 强告警：持仓量Δ ≥10% 且 5m涨幅 ≥2% | 中告警：持仓量Δ ≥8% 且 5m涨幅 ≥1.5% | 弱告警：持仓量Δ ≥5% 或 5m涨幅 ≥1%
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !lastUpdate ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            ) : (
              <MonitorGrid data={monitorData} onCoinRemoved={refresh} />
            )}
          </CardContent>
        </Card>

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>数据来源：币安永续合约 API • 每10秒更新一次</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
