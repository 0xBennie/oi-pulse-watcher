import { useCoinMonitor } from '@/hooks/useCoinMonitor';
import { MonitorTable } from '@/components/MonitorTable';
import { AddCoinDialog } from '@/components/AddCoinDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const Index = () => {
  const { monitorData, loading, lastUpdate, refresh } = useCoinMonitor(10000);

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">OI & Volume Monitor</h1>
              <p className="text-muted-foreground">
                Real-time Binance perpetual futures monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AddCoinDialog onCoinAdded={refresh} />
            <Button
              onClick={refresh}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Coins Monitored
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{monitorData.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {monitorData.filter((d) => d.alertLevel !== 'NONE').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last Update
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono-number">
                {formatLastUpdate(lastUpdate)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monitor Dashboard</CardTitle>
            <CardDescription>
              Auto-refreshes every 10 seconds. STRONG alerts: OI Δ ≥10% & 5m% ≥2% | MEDIUM: OI Δ
              ≥8% & 5m% ≥1.5% | WEAK: OI Δ ≥5% or 5m% ≥1%
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && monitorData.length === 0 ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <MonitorTable data={monitorData} onCoinRemoved={refresh} />
            )}
          </CardContent>
        </Card>

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>Data from Binance Futures API • Updates every 10 seconds</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
