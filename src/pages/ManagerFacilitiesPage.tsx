import { useEffect, useState, useCallback } from 'react';
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

const FACILITY_META: { key: string; label: string; icon: React.ElementType }[] = [
  { key: 'souvenir_shop', label: 'Loja de Souvenirs', icon: Store },
  { key: 'sponsorship', label: 'Patrocínios', icon: Handshake },
  { key: 'training_center', label: 'Centro de Treinamento', icon: Dumbbell },
  { key: 'stadium', label: 'Estádio', icon: Building2 },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function ManagerFacilitiesPage() {
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
    const { facilityId, facilityKey, currentLevel, upgradeCost } = confirmDialog;
    if (!financeId) return;

    if (balance < upgradeCost) {
      toast.error('Saldo insuficiente para essa melhoria.');
      setConfirmDialog((prev) => ({ ...prev, open: false }));
      return;
    }

    setUpgrading(true);
    try {
      const newLevel = currentLevel + 1;

      const { error: facError } = await supabase
        .from('club_facilities')
        .update({ level: newLevel })
        .eq('id', facilityId);

      if (facError) throw facError;

      const { error: finError } = await supabase
        .from('club_finances')
        .update({ balance: balance - upgradeCost })
        .eq('id', financeId);

      if (finError) throw finError;

      const meta = FACILITY_META.find((m) => m.key === facilityKey);
      toast.success(`${meta?.label} melhorado para Nível ${newLevel}!`);
      await fetchData();
    } catch (err: any) {
      toast.error(`Erro ao melhorar: ${err.message}`);
    } finally {
      setUpgrading(false);
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    }
  };

  if (!club || loading) {
    return (
      <ManagerLayout>
        <p className="text-muted-foreground">Carregando instalações...</p>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Instalações do Clube</h1>

        {/* Summary bar */}
        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4">Resumo Semanal das Instalações</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex flex-col items-center gap-1">
              <TrendingUp className="h-4 w-4 text-pitch" />
              <span className="text-muted-foreground">Receita Total</span>
              <span className="font-display font-bold text-pitch">{formatCurrency(totalRevenue)}/sem</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">Custo Total</span>
              <span className="font-display font-bold text-destructive">{formatCurrency(totalCost)}/sem</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DollarSign className={`h-4 w-4 ${netIncome >= 0 ? 'text-pitch' : 'text-destructive'}`} />
              <span className="text-muted-foreground">Lucro Líquido</span>
              <span className={`font-display font-bold ${netIncome >= 0 ? 'text-pitch' : 'text-destructive'}`}>
                {formatCurrency(netIncome)}/sem
              </span>
            </div>
          </div>
        </div>

        {/* Facility cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FACILITY_META.map((meta) => {
            const Icon = meta.icon;
            const level = getFacilityLevel(meta.key);
            const stats = getStats(meta.key);
            const netProfit = stats.rev - stats.cost;
            const maxLvl = MAX_LEVEL[meta.key] || 5;
            const isMaxLevel = level >= maxLvl;
            const upgradeCost = UPGRADE_COSTS[level];
            const canAfford = upgradeCost ? balance >= upgradeCost : false;

            return (
              <Card key={meta.key} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-tactical" />
                      <CardTitle className="font-display text-base">{meta.label}</CardTitle>
                    </div>
                    {isMaxLevel && (
                      <Badge variant="secondary" className="bg-pitch/20 text-pitch border-pitch/30">
                        Nível Máximo
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Level progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Nível</span>
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
                        <span className="text-muted-foreground">Receita</span>
                        <span className="font-display font-bold text-pitch">
                          {formatCurrency(stats.rev)}/semana
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Custo</span>
                      <span className="font-display font-bold text-destructive">
                        {formatCurrency(stats.cost)}/semana
                      </span>
                    </div>
                    {stats.boost != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Boost de treino</span>
                        <span className="font-display font-bold text-tactical">+{stats.boost}%</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="text-muted-foreground font-semibold">Lucro Líquido</span>
                      <span
                        className={`font-display font-bold ${netProfit >= 0 ? 'text-pitch' : 'text-destructive'}`}
                      >
                        {formatCurrency(netProfit)}/semana
                      </span>
                    </div>
                  </div>

                  {/* Upgrade button */}
                  {!isMaxLevel && upgradeCost && (
                    <Button
                      className="w-full"
                      variant={canAfford ? 'default' : 'secondary'}
                      disabled={!canAfford || upgrading}
                      onClick={() => openUpgradeDialog(meta.key)}
                    >
                      {canAfford
                        ? `Melhorar → Nível ${level + 1} (${formatCurrency(upgradeCost)})`
                        : `Saldo insuficiente (${formatCurrency(upgradeCost)})`}
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
            <DialogTitle className="font-display">Confirmar Melhoria</DialogTitle>
            <DialogDescription>
              Tem certeza? Custo: {formatCurrency(confirmDialog.upgradeCost)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
              disabled={upgrading}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpgrade} disabled={upgrading}>
              {upgrading ? 'Melhorando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
