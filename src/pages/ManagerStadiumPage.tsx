import { useEffect, useState, useCallback } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Star, Wrench, DollarSign, TrendingUp, Save, Loader2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Sector {
  id: string;
  sector_type: string;
  sector_label: string | null;
  capacity: number;
  ticket_price: number;
  min_price: number;
  max_price: number;
}

interface RevenuePreview {
  sector_type: string;
  sector_label: string;
  capacity: number;
  ticket_price: number;
  expected_attendance: number;
  occupancy_pct: number;
  sector_revenue: number;
}

export default function ManagerStadiumPage() {
  const { club } = useAuth();
  const [stadium, setStadium] = useState<any>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [revenuePreview, setRevenuePreview] = useState<RevenuePreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const hasChanges = Object.keys(editedPrices).some(
    id => editedPrices[id] !== sectors.find(s => s.id === id)?.ticket_price
  );

  useEffect(() => {
    if (!club) return;
    fetchData();
  }, [club]);

  async function fetchData() {
    const { data: s } = await supabase.from('stadiums').select('*').eq('club_id', club!.id).maybeSingle();
    setStadium(s);
    if (s) {
      const { data: sec } = await supabase.from('stadium_sectors').select('*').eq('stadium_id', s.id).order('capacity', { ascending: false });
      const sectorData = (sec || []) as Sector[];
      setSectors(sectorData);
      // Initialize edited prices
      const prices: Record<string, number> = {};
      sectorData.forEach(sc => { prices[sc.id] = sc.ticket_price; });
      setEditedPrices(prices);
    }
    fetchRevenuePreview();
  }

  async function fetchRevenuePreview() {
    if (!club) return;
    setLoadingPreview(true);
    const { data, error } = await supabase.rpc('calculate_matchday_revenue', {
      p_club_id: club.id,
      p_opponent_reputation: 20,
    });
    if (data) setRevenuePreview(data as RevenuePreview[]);
    if (error) console.error('Revenue preview error:', error);
    setLoadingPreview(false);
  }

  function handlePriceChange(sectorId: string, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setEditedPrices(prev => ({ ...prev, [sectorId]: num }));
    }
  }

  async function handleSavePrices() {
    setSaving(true);
    try {
      const updates = Object.entries(editedPrices).map(([id, price]) => {
        const sector = sectors.find(s => s.id === id);
        if (!sector) return null;
        const clampedPrice = Math.max(sector.min_price, Math.min(sector.max_price, price));
        return supabase.from('stadium_sectors')
          .update({ ticket_price: clampedPrice })
          .eq('id', id);
      }).filter(Boolean);

      await Promise.all(updates);
      toast.success('Preços atualizados com sucesso!');
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar preços');
    } finally {
      setSaving(false);
    }
  }

  if (!club || !stadium) {
    return (
      <ManagerLayout>
        <p className="text-muted-foreground">Carregando estádio...</p>
      </ManagerLayout>
    );
  }

  const totalCapacity = sectors.reduce((sum, s) => sum + s.capacity, 0);
  const totalExpectedAttendance = revenuePreview.reduce((sum, r) => sum + r.expected_attendance, 0);
  const totalExpectedRevenue = revenuePreview.reduce((sum, r) => sum + Number(r.sector_revenue), 0);
  const avgOccupancy = revenuePreview.length > 0
    ? revenuePreview.reduce((sum, r) => sum + Number(r.occupancy_pct), 0) / revenuePreview.length
    : 0;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">{stadium.name}</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Capacidade" value={totalCapacity.toLocaleString()} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Qualidade" value={`${stadium.quality}/100`} icon={<Building2 className="h-5 w-5" />} />
          <StatCard label="Ocupação Média" value={`${avgOccupancy.toFixed(0)}%`} icon={<BarChart3 className="h-5 w-5" />} />
          <StatCard label="Receita/Jogo (est.)" value={formatBRL(totalExpectedRevenue)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>

        {/* Revenue preview banner */}
        <div className="stat-card bg-gradient-to-r from-pitch/10 to-tactical/10 border-pitch/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm">Previsão por Jogo em Casa</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Público estimado: <span className="font-semibold text-foreground">{totalExpectedAttendance.toLocaleString()}</span> / {totalCapacity.toLocaleString()}
                {' '}({totalCapacity > 0 ? ((totalExpectedAttendance / totalCapacity) * 100).toFixed(0) : 0}%)
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-pitch">{formatBRL(totalExpectedRevenue)}</p>
              <p className="text-xs text-muted-foreground">receita estimada</p>
            </div>
          </div>
        </div>

        {/* Sectors */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-sm">Setores & Ingressos</h2>
            {hasChanges && (
              <Button
                size="sm"
                onClick={handleSavePrices}
                disabled={saving}
                className="bg-pitch hover:bg-pitch/90 text-white"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Salvar Preços
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {sectors.map(sec => {
              const preview = revenuePreview.find(r => r.sector_type === sec.sector_type);
              const currentPrice = editedPrices[sec.id] ?? sec.ticket_price;
              const occupancy = preview ? Number(preview.occupancy_pct) : 0;
              const attendance = preview ? preview.expected_attendance : 0;
              const revenue = preview ? Number(preview.sector_revenue) : 0;

              return (
                <div key={sec.id} className="p-4 rounded-lg bg-muted/50 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-foreground">
                        {sec.sector_label || sec.sector_type}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {sec.capacity.toLocaleString()} lugares
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <span className="text-muted-foreground">Receita: </span>
                      <span className="font-display font-bold text-pitch">{formatBRL(revenue)}</span>
                    </div>
                  </div>

                  {/* Occupancy bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Público: {attendance.toLocaleString()} / {sec.capacity.toLocaleString()}
                      </span>
                      <span className={`font-semibold ${occupancy >= 70 ? 'text-pitch' : occupancy >= 40 ? 'text-yellow-500' : 'text-destructive'}`}>
                        {occupancy.toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, occupancy)}
                      className="h-2"
                    />
                  </div>

                  {/* Price input */}
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <Input
                        type="number"
                        value={currentPrice}
                        onChange={e => handlePriceChange(sec.id, e.target.value)}
                        min={sec.min_price}
                        max={sec.max_price}
                        step={5}
                        className="h-8 text-sm"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatBRL(sec.min_price)} — {formatBRL(sec.max_price)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {sectors.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum setor configurado.</p>
          )}
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1 px-1">
          <p>* A previsão de público considera a reputação do seu time, qualidade do estádio e preço dos ingressos.</p>
          <p>* Preços mais baixos atraem mais público. Preços mais altos podem gerar mais receita se o time e estádio forem bons.</p>
          <p>* A receita real varia de acordo com o adversário — times com maior reputação atraem mais público.</p>
        </div>
      </div>
    </ManagerLayout>
  );
}
