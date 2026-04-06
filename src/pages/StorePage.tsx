import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Store, ShoppingBag, Footprints, Zap, Shield, GraduationCap,
  Heart, Gift, CreditCard, Check, ShoppingCart,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatting';

interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  level: number | null;
  max_level: number | null;
  bonus_type: string | null;
  bonus_value: number | null;
  price: number;
  price_real: number | null;
  duration: string | null;
  monthly_cost: number | null;
  is_available: boolean;
  sort_order: number;
}

interface Purchase {
  id: string;
  store_item_id: string;
  player_profile_id: string;
  status: string;
  level: number;
  created_at: string;
}

const DISPLAY_CATEGORIES: Record<string, string> = {
  cosmetic: 'cosmeticos', boots: 'chuteiras', gloves: 'luvas',
  consumable: 'consumiveis', trainer: 'servicos', physio: 'servicos',
  donation: 'outros', currency: 'outros',
};

const CATEGORY_TAB_LABELS: Record<string, string> = {
  cosmeticos: 'Cosméticos', chuteiras: 'Chuteiras', luvas: 'Luvas de Goleiro',
  consumiveis: 'Consumíveis', servicos: 'Serviços', outros: 'Outros',
};

function getItemIcon(category: string) {
  if (category === 'trainer') return <GraduationCap className="h-5 w-5 text-muted-foreground" />;
  if (category === 'physio') return <Heart className="h-5 w-5 text-muted-foreground" />;
  if (category === 'donation') return <Gift className="h-5 w-5 text-muted-foreground" />;
  if (category === 'currency') return <CreditCard className="h-5 w-5 text-muted-foreground" />;
  if (category === 'boots') return <Footprints className="h-5 w-5 text-muted-foreground" />;
  if (category === 'gloves') return <Shield className="h-5 w-5 text-muted-foreground" />;
  if (category === 'consumable') return <Zap className="h-5 w-5 text-muted-foreground" />;
  if (category === 'cosmetic') return <ShoppingBag className="h-5 w-5 text-muted-foreground" />;
  return <Store className="h-5 w-5 text-muted-foreground" />;
}

function getDurationLabel(duration: string | null): string | null {
  if (!duration) return null;
  switch (duration) {
    case 'permanent': return 'Permanente';
    case 'monthly': return 'Mensal';
    case 'single_use': return 'Uso Único';
    case 'daily': return '1x por dia';
    case 'seasonal': return '1 Temporada';
    default: return duration;
  }
}

export default function StorePage() {
  const { profile, playerProfile, managerProfile, club } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [filterBonus, setFilterBonus] = useState<string | null>(null);

  // Gift dialog state (for managers)
  const [giftItem, setGiftItem] = useState<StoreItem | null>(null);
  const [giftPlayerId, setGiftPlayerId] = useState<string>('');
  const [teamPlayers, setTeamPlayers] = useState<Array<{ id: string; name: string }>>([]);

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [itemsRes, purchasesRes] = await Promise.all([
      (supabase as any).from('store_items').select('*').eq('is_available', true).order('sort_order'),
      supabase.from('store_purchases').select('*').eq('user_id', (await supabase.auth.getUser()).data.user?.id || '').eq('status', 'active'),
    ]);
    setItems((itemsRes.data || []) as StoreItem[]);
    setPurchases((purchasesRes.data || []) as Purchase[]);

    // Load team players for gift (manager only)
    if (isManager && club) {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('player_profile_id')
        .eq('club_id', club.id)
        .eq('status', 'active');
      if (contracts) {
        const playerIds = contracts.map(c => c.player_profile_id);
        const { data: players } = await (supabase as any)
          .from('player_profiles')
          .select('id, full_name')
          .in('id', playerIds);
        setTeamPlayers((players || []).map((p: any) => ({ id: p.id, name: p.full_name || 'Sem nome' })));
      }
    }
    setLoading(false);
  }

  function isOwned(itemId: string): boolean {
    return purchases.some(p => p.store_item_id === itemId && p.status === 'active');
  }

  async function handleBuy(item: StoreItem, buyerType: 'player' | 'club', targetPlayerId?: string) {
    setBuying(true);
    try {
      const playerId = targetPlayerId || playerProfile?.id;
      if (!playerId) { toast.error('Jogador não encontrado'); return; }

      const { data, error } = await (supabase as any).rpc('purchase_store_item', {
        p_player_profile_id: playerId,
        p_store_item_id: item.id,
        p_buyer_type: buyerType,
      });

      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Compra realizada!');
      setGiftItem(null);
      setGiftPlayerId('');
      fetchData(); // Refresh
    } catch (e: any) {
      toast.error(e.message || 'Erro na compra');
    } finally {
      setBuying(false);
    }
  }

  const grouped = items.reduce<Record<string, StoreItem[]>>((acc, item) => {
    const cat = DISPLAY_CATEGORIES[item.category] || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['cosmeticos', 'chuteiras', 'luvas', 'consumiveis', 'servicos', 'outros'];
  const availableCategories = categoryOrder.filter(c => grouped[c]?.length);
  const defaultTab = availableCategories[0] || 'cosmeticos';

  function renderItemCard(item: StoreItem) {
    const owned = isOwned(item.id);
    const durationLabel = getDurationLabel(item.duration);

    return (
      <Card key={item.id} className={`overflow-hidden ${owned ? 'border-pitch/50 bg-pitch/5' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {getItemIcon(item.category)}
              <CardTitle className="text-sm font-display leading-tight">
                {item.name}
                {item.level != null && <span className="ml-1.5 text-xs text-muted-foreground">Nv. {item.level}</span>}
              </CardTitle>
            </div>
            <div className="flex gap-1">
              {owned && <Badge className="bg-pitch text-[10px]"><Check className="h-3 w-3 mr-0.5" />Ativo</Badge>}
              {durationLabel && <Badge variant="outline" className="text-[10px] shrink-0">{durationLabel}</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pb-3">
          {item.description && <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>}
          {item.bonus_type && item.bonus_value != null && (
            <Badge variant="secondary" className="text-[10px]">+{item.bonus_value} {item.bonus_type}</Badge>
          )}
          <div className="flex items-center justify-between pt-1 gap-2">
            <span className="font-display text-sm font-bold">{formatBRL(item.price)}</span>
            <div className="flex gap-1">
              {!owned && item.category !== 'currency' && (
                <>
                  {!isManager && (
                    <Button size="sm" className="h-7 text-xs" disabled={buying} onClick={() => handleBuy(item, 'player')}>
                      <ShoppingCart className="h-3 w-3 mr-1" />Comprar
                    </Button>
                  )}
                  {isManager && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={buying}
                        onClick={() => { setGiftItem(item); setGiftPlayerId(''); }}>
                        <Gift className="h-3 w-3 mr-1" />Dar
                      </Button>
                    </>
                  )}
                </>
              )}
              {owned && <span className="text-xs text-pitch font-medium">Adquirido</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6 text-tactical" /> Loja
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compre itens para melhorar seus jogadores!
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando itens...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Nenhum item disponível.</div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            {categoryOrder.map(cat => {
              const count = grouped[cat]?.length || 0;
              if (count === 0) return null;
              return (
                <TabsTrigger key={cat} value={cat} className="flex items-center gap-1 text-xs">
                  {CATEGORY_TAB_LABELS[cat] || cat}
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categoryOrder.map(cat => {
            let catItems = grouped[cat];
            if (!catItems?.length) return null;
            const hasFilters = cat === 'chuteiras' || cat === 'luvas';
            const bonusTypes = hasFilters ? [...new Set(catItems.map(i => i.bonus_type).filter(Boolean))] : [];
            const levels = hasFilters ? [...new Set(catItems.map(i => i.level).filter((l): l is number => l != null))].sort((a, b) => a - b) : [];
            if (hasFilters) {
              if (filterLevel != null) catItems = catItems.filter(i => i.level === filterLevel);
              if (filterBonus) catItems = catItems.filter(i => i.bonus_type === filterBonus);
            }
            return (
              <TabsContent key={cat} value={cat} className="mt-4 space-y-4">
                {hasFilters && (
                  <div className="flex flex-wrap gap-2">
                    <select value={filterLevel ?? ''} onChange={e => setFilterLevel(e.target.value ? Number(e.target.value) : null)} className="text-xs border rounded px-2 py-1 bg-card">
                      <option value="">Todos os Níveis</option>
                      {levels.map(l => <option key={l} value={l}>Nível {l}</option>)}
                    </select>
                    <select value={filterBonus ?? ''} onChange={e => setFilterBonus(e.target.value || null)} className="text-xs border rounded px-2 py-1 bg-card">
                      <option value="">Todas as Habilidades</option>
                      {bonusTypes.map(b => <option key={b} value={b!}>{b}</option>)}
                    </select>
                    {(filterLevel != null || filterBonus) && (
                      <button onClick={() => { setFilterLevel(null); setFilterBonus(null); }} className="text-xs text-destructive hover:underline">Limpar</button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {catItems.map(item => renderItemCard(item))}
                  {catItems.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum item com esses filtros.</p>}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Gift dialog for managers */}
      <Dialog open={!!giftItem} onOpenChange={open => { if (!open) setGiftItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar {giftItem?.name} {giftItem?.level ? `Nv.${giftItem.level}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione o jogador que vai receber o item. O custo ({giftItem ? formatBRL(giftItem.price) : ''}) será debitado do caixa do clube.</p>
            <Select value={giftPlayerId} onValueChange={setGiftPlayerId}>
              <SelectTrigger><SelectValue placeholder="Selecione um jogador" /></SelectTrigger>
              <SelectContent>
                {teamPlayers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="w-full" disabled={!giftPlayerId || buying} onClick={() => giftItem && handleBuy(giftItem, 'club', giftPlayerId)}>
              <Gift className="h-4 w-4 mr-2" />Comprar e Dar ao Jogador
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return <Layout>{content}</Layout>;
}
