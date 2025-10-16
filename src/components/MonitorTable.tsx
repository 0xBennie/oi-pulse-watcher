import { useState, useMemo } from 'react';
import { MonitorData, SortField, SortDirection } from '@/types/coin';
import { AlertBadge } from './AlertBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeCoin } from '@/utils/storage';
import { toast } from 'sonner';

interface MonitorTableProps {
  data: MonitorData[];
  onCoinRemoved: () => void;
}

export function MonitorTable({ data, onCoinRemoved }: MonitorTableProps) {
  const [sortField, setSortField] = useState<SortField>('alert');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'symbol':
          aValue = a.coin.base;
          bValue = b.coin.base;
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case '24h%':
          aValue = a.priceChangePercent24h;
          bValue = b.priceChangePercent24h;
          break;
        case '5m%':
          aValue = Math.abs(a.priceChangePercent5m);
          bValue = Math.abs(b.priceChangePercent5m);
          break;
        case 'oi':
          aValue = a.openInterest;
          bValue = b.openInterest;
          break;
        case 'oiChange':
          aValue = Math.abs(a.openInterestChangePercent5m);
          bValue = Math.abs(b.openInterestChangePercent5m);
          break;
        case 'alert':
          const alertOrder = { STRONG: 3, MEDIUM: 2, WEAK: 1, NONE: 0 };
          aValue = alertOrder[a.alertLevel];
          bValue = alertOrder[b.alertLevel];
          break;
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  }, [data, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toFixed(decimals);
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return formatNumber(price, 0);
    if (price >= 1) return formatNumber(price, 2);
    if (price >= 0.01) return formatNumber(price, 4);
    return formatNumber(price, 6);
  };

  const handleRemoveCoin = (base: string) => {
    try {
      removeCoin(base);
      toast.success(`Removed ${base} from monitor list`);
      onCoinRemoved();
    } catch (error) {
      toast.error('Failed to remove coin');
    }
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No coins to monitor. Add some coins to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-[100px]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('symbol')}
                className="h-8 px-2 gap-1"
              >
                Symbol
                <SortIcon field="symbol" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('price')}
                className="h-8 px-2 gap-1"
              >
                Price
                <SortIcon field="price" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('24h%')}
                className="h-8 px-2 gap-1"
              >
                24h %
                <SortIcon field="24h%" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('5m%')}
                className="h-8 px-2 gap-1"
              >
                5m %
                <SortIcon field="5m%" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('oi')}
                className="h-8 px-2 gap-1"
              >
                OI (USD)
                <SortIcon field="oi" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('oiChange')}
                className="h-8 px-2 gap-1"
              >
                OI Δ5m %
                <SortIcon field="oiChange" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('alert')}
                className="h-8 px-2 gap-1"
              >
                Alert
                <SortIcon field="alert" />
              </Button>
            </TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((item) => (
            <TableRow
              key={item.coin.base}
              className={cn(
                'border-border hover:bg-secondary/50 transition-colors',
                item.alertLevel === 'STRONG' && 'bg-alert-strong/5',
                item.alertLevel === 'MEDIUM' && 'bg-alert-medium/5',
                item.alertLevel === 'WEAK' && 'bg-alert-weak/5'
              )}
            >
              <TableCell className="font-semibold">{item.coin.base}</TableCell>
              <TableCell className="text-right font-mono-number">
                ${formatPrice(item.price)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-mono-number font-semibold',
                  item.priceChangePercent24h > 0 ? 'text-success' : 'text-danger'
                )}
              >
                {item.priceChangePercent24h > 0 ? '+' : ''}
                {formatNumber(item.priceChangePercent24h)}%
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-mono-number font-semibold',
                  item.priceChangePercent5m > 0 ? 'text-success' : 'text-danger'
                )}
              >
                {item.priceChangePercent5m > 0 ? '+' : ''}
                {formatNumber(item.priceChangePercent5m)}%
              </TableCell>
              <TableCell className="text-right font-mono-number">
                {item.openInterest > 0
                  ? `$${(item.openInterest / 1_000_000).toFixed(2)}M`
                  : '-'}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-mono-number font-semibold',
                  item.openInterestChangePercent5m > 0 ? 'text-success' : 'text-danger'
                )}
              >
                {item.openInterestChangePercent5m > 0 ? '+' : ''}
                {formatNumber(item.openInterestChangePercent5m)}%
              </TableCell>
              <TableCell>
                <AlertBadge level={item.alertLevel} />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveCoin(item.coin.base)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
