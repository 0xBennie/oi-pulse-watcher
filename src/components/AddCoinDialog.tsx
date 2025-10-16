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
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      addCoin({ base: base.toUpperCase(), binance: binance.toUpperCase() });
      toast.success(`Added ${base.toUpperCase()} to monitor list`);
      setBase('');
      setBinance('');
      setOpen(false);
      onCoinAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add coin');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Coin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Coin</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base">Coin Symbol</Label>
            <Input
              id="base"
              placeholder="e.g., APE"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="binance">Binance Symbol</Label>
            <Input
              id="binance"
              placeholder="e.g., APEUSDT"
              value={binance}
              onChange={(e) => setBinance(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Coin</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
