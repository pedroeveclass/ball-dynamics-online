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
  Heart, Gift, CreditCard, Check, ShoppingCart, Package, XCircle, BatteryCharging,
  AlertTriangle, RefreshCw, TrendingUp, TrendingDown,
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
  last_used_at: string | null;
  expires_at: string | null;
}

const DISPLAY_CATEGORIES: Record<string, string> = {
  cosmetic: 'cosmeticos', boots: 'chuteiras', gloves: 'luvas',
  consumable: 'consumiveis', trainer: 'servicos', physio: 'servicos',
  donation: 'outros', currency: 'outros',
};

const CATEGORY_TAB_LABELS: Record<string, string> = {
  meus_itens: 'Meus Itens', cosmeticos: 'Cosméticos', chuteiras: 'Chuteiras', luvas: 'Luvas de Goleiro',
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
  const { profile, playerProfile, managerProfile, club, refreshPlayerProfile } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [acting, setActing] = useState(false);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [filterBonus, setFilterBonus] = useState<string | null>(null);
  const [playerPurchases, setPlayerPurchases] = useState<(Purchase & { item?: StoreItem })[]>([]);

  // Gift dialog state (for managers)
  const [giftItem, setGiftItem] = useState<StoreItem | null>(null);
  const [giftPlayerId, setGiftPlayerId] = useState<string>('');
  const [teamPlayers, setTeamPlayers] = useState<Array<{ id: string; name: string }>>([]);

  // Swap confirmation dialog (trainer / physio conflict at purchase time)
  const [swapConflict, setSwapConflict] = useState<null | {
    item: StoreItem;
    buyerType: 'player' | 'club';
    targetPlayerId?: string;
    currentName: string;
    currentLevel: number | null;
    newName: string;
    newLevel: number | null;
    newPrice: number;
  }>(null);

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const userId = (await supabase.auth.getUser()).data.user?.id || '';
    const [itemsRes, purchasesRes] = await Promise.all([
      (supabase as any).from('store_items').select('*').eq('is_available', true).order('sort_order'),
      supabase.from('store_purchases').select('*').eq('user_id', userId).in('status', ['active', 'inventory', 'cancelling']),
    ]);
    const allItems = (itemsRes.data || []) as StoreItem[];
    setItems(allItems);
    setPurchases((purchasesRes.data || []) as Purchase[]);

    // Fetch player's active purchases (includes gifted items by player_profile_id)
    if (playerProfile?.id) {
      const { data: playerPurchs } = await supabase
        .from('store_purchases')
        .select('*')
        .eq('player_profile_id', playerProfile.id)
        .in('status', ['active', 'inventory', 'cancelling']);

      const itemMap = new Map(allItems.map(i => [i.id, i]));
      // If some items not in available list, fetch them separately
      const missingIds = (playerPurchs || [])
        .map(p => p.store_item_id)
        .filter(id => !itemMap.has(id));
      if (missingIds.length > 0) {
        const { data: extraItems } = await (supabase as any)
          .from('store_items')
          .select('*')
          .in('id', missingIds);
        for (const ei of (extraItems || [])) itemMap.set(ei.id, ei as StoreItem);
      }

      setPlayerPurchases(
        ((playerPurchs || []) as Purchase[]).map(p => ({
          ...p,
          item: itemMap.get(p.store_item_id),
        }))
      );
    }

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
    // Consumables are stackable per day — keep the Buy button visible; the RPC
    // enforces the per-item daily purchase limit.
    const item = items.find(i => i.id === itemId);
    if (item?.category === 'consumable') return false;
    return purchases.some(p => p.store_item_id === itemId && (p.status === 'active' || p.status === 'inventory' || p.status === 'cancelling'));
  }

  async function handleBuy(item: StoreItem, buyerType: 'player' | 'club', targetPlayerId?: string, confirmReplace = false) {
    setBuying(true);
    try {
      const playerId = targetPlayerId || playerProfile?.id;
      if (!playerId) { toast.error('Jogador não encontrado'); return; }

      const { data, error } = await (supabase as any).rpc('purchase_store_item', {
        p_player_profile_id: playerId,
        p_store_item_id: item.id,
        p_buyer_type: buyerType,
        p_confirm_replace: confirmReplace,
      });

      if (error) { toast.error(error.message); return; }
      const result = data as any;

      // RPC returned a conflict signal — open the swap dialog instead of charging.
      if (result?.conflict) {
        setSwapConflict({
          item,
          buyerType,
          targetPlayerId,
          currentName: result.current_item_name,
          currentLevel: result.current_item_level,
          newName: result.new_item_name,
          newLevel: result.new_item_level,
          newPrice: Number(result.new_item_price),
        });
        return;
      }

      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Compra realizada!');
      setGiftItem(null);
      setGiftPlayerId('');
      setSwapConflict(null);
      await Promise.all([fetchData(), refreshPlayerProfile()]);
    } catch (e: any) {
      toast.error(e.message || 'Erro na compra');
    } finally {
      setBuying(false);
    }
  }

  async function handleReactivateSubscription(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('reactivate_store_subscription', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Renovação reativada!');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reativar');
    } finally {
      setActing(false);
    }
  }

  async function handleEquip(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('equip_store_item', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Item equipado!');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao equipar');
    } finally {
      setActing(false);
    }
  }

  async function handleUnequip(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('unequip_store_item', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Item desequipado!');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao desequipar');
    } finally {
      setActing(false);
    }
  }

  async function handleUseEnergetico(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('use_energetico', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Energético usado!');
      await Promise.all([fetchData(), refreshPlayerProfile()]);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao usar energético');
    } finally {
      setActing(false);
    }
  }

  async function handleCancelSubscription(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('cancel_store_subscription', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || 'Assinatura cancelada!');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar');
    } finally {
      setActing(false);
    }
  }

  const grouped = items.reduce<Record<string, StoreItem[]>>((acc, item) => {
    const cat = DISPLAY_CATEGORIES[item.category] || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['meus_itens', 'cosmeticos', 'chuteiras', 'luvas', 'consumiveis', 'servicos', 'outros'];
  const defaultTab = playerPurchases.length > 0 ? 'meus_itens' : (Object.keys(grouped).find(k => grouped[k]?.length) || 'cosmeticos');

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
            {!isManager && playerPurchases.length > 0 && (
              <TabsTrigger value="meus_itens" className="flex items-center gap-1 text-xs">
                <Package className="h-3 w-3" />
                {CATEGORY_TAB_LABELS['meus_itens']}
                <span className="text-[10px] text-muted-foreground">({playerPurchases.length})</span>
              </TabsTrigger>
            )}
            {categoryOrder.filter(c => c !== 'meus_itens').map(cat => {
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

          {/* Meus Itens tab */}
          {!isManager && (
            <TabsContent value="meus_itens" className="mt-4 space-y-4">
              {playerPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum item no inventário.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {playerPurchases.map(p => {
                    const item = p.item;
                    if (!item) return null;
                    const isEquipment = item.category === 'boots' || item.category === 'gloves';
                    const isConsumable = item.category === 'consumable' && item.bonus_type === 'energy';
                    const isMonthly = item.duration === 'monthly';
                    const isActive = p.status === 'active';
                    const isInventory = p.status === 'inventory';
                    const isCancelling = p.status === 'cancelling';

                    return (
                      <Card key={p.id} className={`overflow-hidden ${isActive || isCancelling ? 'border-pitch/50 bg-pitch/5' : 'border-muted'}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {getItemIcon(item.category)}
                              <CardTitle className="text-sm font-display leading-tight">
                                {item.name}
                                {item.level != null && <span className="ml-1.5 text-xs text-muted-foreground">Nv. {item.level}</span>}
                              </CardTitle>
                            </div>
                            {isActive && <Badge className="bg-pitch text-[10px]"><Check className="h-3 w-3 mr-0.5" />Ativo</Badge>}
                            {isCancelling && <Badge className="bg-amber-600 text-[10px]">Não renova</Badge>}
                            {isInventory && <Badge variant="outline" className="text-[10px]">Inventário</Badge>}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-3">
                          {item.description && <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>}
                          {item.bonus_type && item.bonus_value != null && (
                            <Badge variant="secondary" className="text-[10px]">+{item.bonus_value} {item.bonus_type}</Badge>
                          )}
                          {p.expires_at && (
                            <p className="text-xs text-muted-foreground">Expira: {new Date(p.expires_at).toLocaleDateString('pt-BR')}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {/* Equipment: equip/unequip */}
                            {isEquipment && isInventory && (
                              <Button size="sm" className="h-7 text-xs" disabled={acting}
                                onClick={() => handleEquip(p.id)}>
                                <Check className="h-3 w-3 mr-1" />Equipar
                              </Button>
                            )}
                            {isEquipment && isActive && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={acting}
                                onClick={() => handleUnequip(p.id)}>
                                <XCircle className="h-3 w-3 mr-1" />Desequipar
                              </Button>
                            )}
                            {/* Consumable: use */}
                            {isConsumable && (
                              <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" disabled={acting}
                                onClick={() => handleUseEnergetico(p.id)}>
                                <BatteryCharging className="h-3 w-3 mr-1" />Usar
                              </Button>
                            )}
                            {/* Monthly subscription: cancel renewal */}
                            {isMonthly && isActive && (
                              <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={acting}
                                onClick={() => handleCancelSubscription(p.id)}>
                                <XCircle className="h-3 w-3 mr-1" />Cancelar renovação
                              </Button>
                            )}
                            {isCancelling && p.expires_at && (
                              <>
                                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" disabled={acting}
                                  onClick={() => handleReactivateSubscription(p.id)}>
                                  <RefreshCw className="h-3 w-3 mr-1" />Reativar renovação
                                </Button>
                                <span className="text-xs text-amber-500">Ativo até {new Date(p.expires_at).toLocaleDateString('pt-BR')}</span>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          )}

          {categoryOrder.filter(c => c !== 'meus_itens').map(cat => {
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

      {/* Swap confirmation dialog (trainer / physio) */}
      <Dialog open={!!swapConflict} onOpenChange={(open) => { if (!open && !buying) setSwapConflict(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {swapConflict?.item.category === 'trainer' ? 'Trocar Treinador?' : 'Trocar Fisioterapeuta?'}
            </DialogTitle>
          </DialogHeader>
          {swapConflict && (() => {
            const curLvl = swapConflict.currentLevel ?? 0;
            const newLvl = swapConflict.newLevel ?? 0;
            const isUpgrade = newLvl > curLvl;
            const isDowngrade = newLvl < curLvl;
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Você só pode ter <strong>um {swapConflict.item.category === 'trainer' ? 'treinador' : 'fisioterapeuta'}</strong> ativo por vez.
                </p>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Atual:</span>
                    <span className="font-medium">
                      {swapConflict.currentName}
                      {swapConflict.currentLevel != null && ` — Nv.${swapConflict.currentLevel}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Novo:</span>
                    <span className="font-medium flex items-center gap-1">
                      {isUpgrade && <TrendingUp className="h-3.5 w-3.5 text-pitch" />}
                      {isDowngrade && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                      {swapConflict.newName}
                      {swapConflict.newLevel != null && ` — Nv.${swapConflict.newLevel}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">Custo do novo:</span>
                    <span className="font-display font-bold">{formatBRL(swapConflict.newPrice)}</span>
                  </div>
                </div>

                {isDowngrade && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    <strong>Atenção:</strong> você está trocando para um nível <strong>INFERIOR</strong>. O bônus atual (Nv.{curLvl}) será perdido.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  O item atual será substituído imediatamente. <strong>O valor já pago pelo item atual não é reembolsado.</strong>
                </p>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={buying}
                    onClick={() => setSwapConflict(null)}>
                    Cancelar
                  </Button>
                  <Button variant={isDowngrade ? 'destructive' : 'default'} className="flex-1" disabled={buying}
                    onClick={() => handleBuy(swapConflict.item, swapConflict.buyerType, swapConflict.targetPlayerId, true)}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {buying ? 'Processando...' : 'Confirmar troca'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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
