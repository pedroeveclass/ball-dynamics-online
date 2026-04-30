import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, UserCircle, Briefcase } from 'lucide-react';

interface SlotChoiceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional callback when "Create Player" is chosen. Defaults to navigating to /onboarding/player. */
  onChoosePlayer?: () => void;
  /** Optional callback when "Create Manager" is chosen. Defaults to navigating to /onboarding/manager. */
  onChooseManager?: () => void;
}

/**
 * Dialog presenting a choice between creating a new Player or a new Manager
 * for a fresh slot. Reused across PlayerProfilePage and ManagerDashboard.
 *
 * i18n strings live in `common.json` under `slot_choice.*`.
 */
export function SlotChoiceDialog({
  open,
  onClose,
  onChoosePlayer,
  onChooseManager,
}: SlotChoiceDialogProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const handlePlayer = () => {
    onClose();
    if (onChoosePlayer) onChoosePlayer();
    else navigate('/onboarding/player');
  };

  const handleManager = () => {
    onClose();
    if (onChooseManager) onChooseManager();
    else navigate('/onboarding/manager');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="h-5 w-5 text-tactical" /> {t('slot_choice.title')}
          </DialogTitle>
          <DialogDescription>
            {t('slot_choice.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <button
            onClick={handlePlayer}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted hover:border-tactical transition-all p-4 text-center"
          >
            <div className="h-12 w-12 rounded-full bg-tactical/10 flex items-center justify-center">
              <UserCircle className="h-7 w-7 text-tactical" />
            </div>
            <p className="text-sm font-display font-bold">{t('slot_choice.player_title')}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t('slot_choice.player_desc')}
            </p>
          </button>
          <button
            onClick={handleManager}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted hover:border-tactical transition-all p-4 text-center"
          >
            <div className="h-12 w-12 rounded-full bg-tactical/10 flex items-center justify-center">
              <Briefcase className="h-7 w-7 text-tactical" />
            </div>
            <p className="text-sm font-display font-bold">{t('slot_choice.manager_title')}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t('slot_choice.manager_desc')}
            </p>
          </button>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('slot_choice.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SlotChoiceDialog;
