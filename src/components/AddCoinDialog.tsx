import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { addCoin } from '@/utils/storage';
import { toast } from 'sonner';

interface AddCoinDialogProps {
  onCoinAdded: () => void;
}

export function AddCoinDialog({ onCoinAdded }: AddCoinDialogProps) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const [binance, setBinance] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!base || !binance) {
      toast.error('请填写所有必填字段');
      return;
    }

    try {
      addCoin({ base: base.toUpperCase(), binance: binance.toUpperCase() });
      toast.success(`已添加 ${base.toUpperCase()} 到监控列表`);
      setBase('');
      setBinance('');
      setOpen(false);
      onCoinAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败');
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit">添加</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
