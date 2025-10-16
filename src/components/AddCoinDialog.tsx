import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { addCoin } from '@/utils/storage';
import { fetchPriceData } from '@/utils/binance';
import { toast } from 'sonner';

interface AddCoinDialogProps {
  onCoinAdded: () => void;
}

export function AddCoinDialog({ onCoinAdded }: AddCoinDialogProps) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const [binance, setBinance] = useState('');
  const [validating, setValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!base || !binance) {
      toast.error('请填写所有必填字段');
      return;
    }

    const symbolToAdd = binance.toUpperCase();
    setValidating(true);

    try {
      // 先验证symbol是否有效
      const priceData = await fetchPriceData(symbolToAdd);
      
      if (!priceData) {
        toast.error(`${symbolToAdd} 不是有效的币安合约交易对，请检查后重试`);
        setValidating(false);
        return;
      }

      // 验证通过，添加到列表
      addCoin({ base: base.toUpperCase(), binance: symbolToAdd });
      toast.success(`已添加 ${base.toUpperCase()} 到监控列表`);
      setBase('');
      setBinance('');
      setOpen(false);
      onCoinAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败');
    } finally {
      setValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          添加币种
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加新币种</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base">币种符号</Label>
            <Input
              id="base"
              placeholder="例如：APE"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="binance">币安交易对</Label>
            <Input
              id="binance"
              placeholder="例如：APEUSDT"
              value={binance}
              onChange={(e) => setBinance(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={validating}>
              取消
            </Button>
            <Button type="submit" disabled={validating}>
              {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {validating ? '验证中...' : '添加'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
