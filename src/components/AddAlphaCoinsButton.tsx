import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sparkles, Loader2 } from 'lucide-react';
import { addMultipleCoins, clearAllCoins } from '@/utils/storage';
import { BINANCE_ALPHA_COINS } from '@/utils/alphaCoins';
import { toast } from 'sonner';

interface AddAlphaCoinsButtonProps {
  onCoinsAdded: () => void;
}

export function AddAlphaCoinsButton({ onCoinsAdded }: AddAlphaCoinsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAddAlphaCoins = async () => {
    setLoading(true);
    try {
      // Clear existing coins first
      clearAllCoins();
      
      // Add all alpha coins
      const addedCount = addMultipleCoins(BINANCE_ALPHA_COINS);
      
      toast.success(`成功添加 ${BINANCE_ALPHA_COINS.length} 个Alpha币种到监控列表`);
      setOpen(false);
      onCoinsAdded();
    } catch (error) {
      toast.error('添加失败，请重试');
      console.error('Error adding alpha coins:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <Sparkles className="w-4 h-4" />
          添加Alpha币种
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>添加所有Binance Alpha币种？</AlertDialogTitle>
          <AlertDialogDescription>
            这将清除当前所有监控币种，并添加 {BINANCE_ALPHA_COINS.length} 个热门的Binance Alpha项目到监控列表。
            <br />
            <br />
            包括：APE, PENDLE, WLD, TIA, SEI, BLUR, MEME, JTO, PYTH, WIF, BOME, ENA, NOT, DOGS, TON, NEIRO, PNUT 等等。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleAddAlphaCoins();
            }}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            确认添加
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
