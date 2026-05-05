import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Store, Handshake, Dumbbell, Building2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ManagerFacilitiesIntroTour } from '@/components/tour/ManagerFacilitiesIntroTour';
import { PageNavTabs } from '@/components/PageNavTabs';

const MAX_LEVEL: Record<string, number> = {
  souvenir_shop: 5,
  sponsorship: 5,
  training_center: 5,
  stadium: 10,
};

const FACILITY_STATS: Record<string, Record<number, { rev: number; cost: number; boost?: number }>> = {
  souvenir_shop: {
    1: { rev: 3000, cost: 500 },
    2: { rev: 6000, cost: 1000 },
    3: { rev: 12000, cost: 2000 },
    4: { rev: 22000, cost: 4000 },
    5: { rev: 40000, cost: 7000 },
  },
  sponsorship: {
    1: { rev: 5000, cost: 800 },
    2: { rev: 10000, cost: 1500 },
    3: { rev: 20000, cost: 3000 },
    4: { rev: 38000, cost: 6000 },
    5: { rev: 70000, cost: 10000 },
  },
  training_center: {
    1: { rev: 0, cost: 700, boost: 5 },
    2: { rev: 0, cost: 1500, boost: 10 },
    3: { rev: 0, cost: 3000, boost: 18 },
    4: { rev: 0, cost: 6000, boost: 28 },
    5: { rev: 0, cost: 10000, boost: 40 },
  },
  stadium: {
    1: { rev: 0, cost: 2000 },
    2: { rev: 0, cost: 3500 },
    3: { rev: 0, cost: 5500 },
    4: { rev: 0, cost: 8000 },
    5: { rev: 0, cost: 12000 },
    6: { rev: 0, cost: 18000 },
    7: { rev: 0, cost: 25000 },
    8: { rev: 0, cost: 35000 },
    9: { rev: 0, cost: 48000 },
    10: { rev: 0, cost: 65000 },
  },
};

const UPGRADE_COSTS: Record<number, number> = {
  1: 50000,
  2: 150000,
  3: 400000,
  4: 1000000,
  5: 2500000,
  6: 5000000,
  7: 10000000,
  8: 20000000,
  9: 50000000,
};

const FACILITY_META: { key: string; icon: React.ElementType }[] = [
  { key: 'souvenir_shop', icon: Store },
  { key: 'sponsorship', icon: Handshake },
  { key: 'training_center', icon: Dumbbell },
  { key: 'stadium', icon: Building2 },
];

import { formatBRL } from '@/lib/formatting';
const formatCurrency = formatBRL;

export default function ManagerFacilitiesPage() {
  const { t } = useTranslation('manager_facilities');
  const { t: tNav } = useTranslation('nav');
  const { club } = useAuth();
  const [facilities, setFacilities] = useState<any[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [financeId, setFinanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    facilityKey: string;
    facilityId: string;
    currentLevel: number;
    upgradeCost: number;
  }>({ open: false, facilityKey: '', facilityId: '', currentLevel: 0, upgradeCost: 0 });

  const fetchData = useCallback(async () => {
    if (!club) return;
    const [facRes, finRes] = await Promise.all([
      supabase.from('club_facilities').select('*').eq('club_id', club.id),
      supabase.from('club_finances').select('*').eq('club_id', club.id).single(),
    ]);
    setFacilities(facRes.data || []);
    if (finRes.data) {
      setBalance(finRes.data.balance);
      setFinanceId(finRes.data.id);
    }
    setLoading(false);
  }, [club]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getFacilityLevel = (key: string): number => {
    const fac = facilities.find((f) => f.facility_type === key);
    return fac?.level ?? 1;
  };

  const getFacilityId = (key: string): string => {
    const fac = facilities.find((f) => f.facility_type === key);
    return fac?.id ?? '';
  };

  const getStats = (key: string) => {
    const level = getFacilityLevel(key);
    return FACILITY_STATS[key]?.[level] ?? { rev: 0, cost: 0 };
  };

  const totalRevenue = FACILITY_META.reduce((sum, m) => sum + getStats(m.key).rev, 0);
  const totalCost = FACILITY_META.reduce((sum, m) => sum + getStats(m.key).cost, 0);
  const netIncome = totalRevenue - totalCost;

  const openUpgradeDialog = (key: string) => {
    const currentLevel = getFacilityLevel(key);
    const upgradeCost = UPGRADE_COSTS[currentLevel];
    const facilityId = getFacilityId(key);
    if (!upgradeCost || !facilityId) return;
    setConfirmDialog({ open: true, facilityKey: key, facilityId, currentLevel, upgradeCost });
  };

  const handleUpgrade = async () => {
    const { facilityKey, upgradeCost } = confirmDialog;
    if (!club) return;

    if (balance < upgradeCost) {
      toast.error(t('toast.insufficient'));
      setConfirmDialog((prev) => ({ ...prev, open: false }));
      return;
    }

    setUpgrading(true);
    try {
      const { data, error } = await supabase.rpc('upgrade_facility', {
        p_club_id: club.id,
        p_facility_type: facilityKey,
      });

      if (error) throw error;

      const result = data as { facility_type: string; new_level: number };
      const label = t(`facilities.${facilityKey}`);
      toast.success(t('toast.upgrade_ok', { label, level: result.new_level }));
      await fetchData();
    } catch (err: any) {
      toast.error(t('toast.upgrade_error', { message: err.message }));
    } finally {
      setUpgrading(false);
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    }
  };

  if (!club || loading) {
    return (
      <ManagerLayout>
        <p className="text-muted-foreground">{t('loading')}</p>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <PageNavTabs
          tabs={[
            { to: '/manager/stadium', label: tNav('tabs.manager_stadium') },
            { to: '/manager/facilities', label: tNav('tabs.manager_facilities') },
          ]}
        />
        <ManagerFacilitiesIntroTour enabled={true} />
        <h1 className="font-display text-2xl font-bold">{t('title')}</h1>

        {/* Summary bar */}
        <div data-tour="facilities-summary" className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4">{t('summary.title')}</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex flex-col items-center gap-1">
              <TrendingUp className="h-4 w-4 text-pitch" />
              <span className="text-muted-foreground">{t('summary.total_revenue')}</span>
              <span className="font-display font-bold text-pitch">{formatCurrency(totalRevenue)}{t('summary.per_week')}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">{t('summary.total_cost')}</span>
              <span className="font-display font-bold text-destructive">{formatCurrency(totalCost)}{t('summary.per_week')}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DollarSign className={`h-4 w-4 ${netIncome >= 0 ? 'text-pitch' : 'text-destructive'}`} />
              <span className="text-muted-foreground">{t('summary.net_income')}</span>
              <span className={`font-display font-bold ${netIncome >= 0 ? 'text-pitch' : 'text-destructive'}`}>
                {formatCurrency(netIncome)}{t('summary.per_week')}
              </span>
            </div>
          </div>
        </div>

        {/* Facility cards grid */}
        <div data-tour="facilities-list" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FACILITY_META.map((meta) => {
            const Icon = meta.icon;
            const level = getFacilityLevel(meta.key);
            const stats = getStats(meta.key);
            const netProfit = stats.rev - stats.cost;
            const maxLvl = MAX_LEVEL[meta.key] || 5;
            const isMaxLevel = level >= maxLvl;
            const upgradeCost = UPGRADE_COSTS[level];
            const canAfford = upgradeCost ? balance >= upgradeCost : false;
            const label = t(`facilities.${meta.key}`);

            return (
              <Card key={meta.key} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-tactical" />
                      <CardTitle className="font-display text-base">{label}</CardTitle>
                    </div>
                    {isMaxLevel && (
                      <Badge variant="secondary" className="bg-pitch/20 text-pitch border-pitch/30">
                        {t('card.max_level')}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Level progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{t('card.level')}</span>
                      <span className="font-display font-bold">
                        {level} / {maxLvl}
                      </span>
                    </div>
                    <Progress value={(level / maxLvl) * 100} className="h-2" />
                  </div>

                  {/* Stats */}
                  <div className="space-y-2 text-sm">
                    {stats.rev > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('card.revenue')}</span>
                        <span className="font-display font-bold text-pitch">
                          {formatCurrency(stats.rev)}{t('card.per_week_long')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('card.cost')}</span>
                      <span className="font-display font-bold text-destructive">
                        {formatCurrency(stats.cost)}{t('card.per_week_long')}
                      </span>
                    </div>
                    {stats.boost != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('card.training_boost')}</span>
                        <span className="font-display font-bold text-tactical">+{stats.boost}%</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="text-muted-foreground font-semibold">{t('card.net_profit')}</span>
                      <span
                        className={`font-display font-bold ${netProfit >= 0 ? 'text-pitch' : 'text-destructive'}`}
                      >
                        {formatCurrency(netProfit)}{t('card.per_week_long')}
                      </span>
                    </div>
                  </div>

                  {/* Upgrade button */}
                  {!isMaxLevel && upgradeCost != null && (
                    <Button
                      className="w-full"
                      variant={canAfford ? 'default' : 'secondary'}
                      disabled={!canAfford || upgrading}
                      onClick={() => openUpgradeDialog(meta.key)}
                    >
                      {canAfford
                        ? t('card.upgrade_cta', { level: level + 1, cost: formatCurrency(upgradeCost) })
                        : t('card.insufficient_balance', { cost: formatCurrency(upgradeCost) })}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t('dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.description', { cost: formatCurrency(confirmDialog.upgradeCost) })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
              disabled={upgrading}
            >
              {t('dialog.cancel')}
            </Button>
            <Button onClick={handleUpgrade} disabled={upgrading}>
              {upgrading ? t('dialog.submitting') : t('dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
