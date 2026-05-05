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
  AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Wallet, Landmark, Trash2,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatting';
import { getStoreItemName, getStoreItemDescription } from '@/lib/storeItemLabel';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { ATTR_LABELS } from '@/lib/attributes';
import { formatDate as formatDateI18n } from '@/lib/formatDate';
import { StoreIntroTour } from '@/components/tour/StoreIntroTour';
import { StoreManagerIntroTour } from '@/components/tour/StoreManagerIntroTour';
import { ItemColorPickerDialog, ColorSlot, ColorValues } from '@/components/store/ItemColorPickerDialog';
import { EquipSideDialog, EquipChoice, EquipChoiceKind } from '@/components/store/EquipSideDialog';
import { CosmeticPurchaseDialog, CosmeticKind, PurchaseValues } from '@/components/store/CosmeticPurchaseDialog';
import { BackgroundPickerDialog } from '@/components/store/BackgroundPickerDialog';
import type { BackgroundVariant } from '@/lib/cosmetics';

interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  name_pt: string | null;
  name_en: string | null;
  description_pt: string | null;
  description_en: string | null;
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
  // Cosmetic customizations picked at purchase / equip time. Cleats use all
  // three; everything else uses just `color` (or none for items like the
  // long-sock toggle that have no color of their own).
  color: string | null;
  color2: string | null;
  color3: string | null;
  side: string | null;
}

const DISPLAY_CATEGORIES: Record<string, string> = {
  cosmetic: 'cosmeticos', boots: 'chuteiras', gloves: 'luvas',
  consumable: 'consumiveis', trainer: 'servicos', physio: 'servicos',
  donation: 'outros', currency: 'outros',
};

function categoryTabLabel(key: string): string {
  return i18n.t(`store:tabs.${key}`, { defaultValue: key });
}

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
  const known = ['permanent', 'monthly', 'single_use', 'daily', 'seasonal'];
  if (known.includes(duration)) {
    return i18n.t(`store:duration.${duration}`, { defaultValue: duration });
  }
  return duration;
}

export default function StorePage() {
  const { profile, playerProfile, managerProfile, club, refreshPlayerProfile } = useAuth();
  const { current: lang } = useAppLanguage();
  const { t } = useTranslation('store');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [acting, setActing] = useState(false);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [filterBonus, setFilterBonus] = useState<string | null>(null);
  const [playerPurchases, setPlayerPurchases] = useState<(Purchase & { item?: StoreItem })[]>([]);
  // "Meus Itens" filters: 'all' | 'active' | 'inventory' | 'cancelling' for status,
  // 'all' | display-category key for category. Combined with AND.
  const [myStatusFilter, setMyStatusFilter] = useState<'all' | 'active' | 'inventory' | 'cancelling'>('all');
  const [myCategoryFilter, setMyCategoryFilter] = useState<string>('all');

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

  // Color picker dialog. Boots / gloves / visual cosmetics prompt the buyer
  // for a custom color before the RPC fires; the picked hex is persisted on
  // store_purchases and consumed by the player avatar.
  const [colorPick, setColorPick] = useState<null | {
    item: StoreItem;
    buyerType: 'player' | 'club';
    targetPlayerId?: string;
  }>(null);

  // Equip-time choice dialog. Wristband / biceps band ask which arm; winter
  // glove asks long-vs-short sleeve. The user re-picks every time they
  // equip so changing variant doesn't require re-buying the item.
  const [sidePick, setSidePick] = useState<null | { purchaseId: string; itemName: string; kind: EquipChoiceKind }>(null);

  // Delete-confirmation dialog. Letting the player permanently throw away
  // an owned item so they can re-buy it (e.g. swap a black wristband for
  // a white one). No refund — discarding is intentional.
  const [deleteTarget, setDeleteTarget] = useState<null | { purchaseId: string; itemName: string }>(null);

  // Background-picker dialog (visual background cosmetic). Tabbed UI for
  // solid / gradient / pattern / image instead of the simpler color picker.
  const [bgPick, setBgPick] = useState<null | { item: StoreItem; buyerType: 'player' | 'club'; targetPlayerId?: string }>(null);
  // V2 cosmetic purchases (tattoo/glasses/jewelry/etc) that need the
  // configurator dialog with live avatar preview. The kind drives which
  // controls render (see CosmeticPurchaseDialog).
  const [cosmeticPick, setCosmeticPick] = useState<null | {
    item: StoreItem; kind: CosmeticKind; buyerType: 'player' | 'club'; targetPlayerId?: string;
  }>(null);

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;
  // Club balance for the manager view — comes from club_finances and is
  // refetched whenever fetchData runs so a purchase reflects in the header.
  const [clubBalance, setClubBalance] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
    // Refetch when the active player changes — purchases are per-player,
    // so swapping characters must reload "owned" / active subscriptions.
  }, [playerProfile?.id]);

  async function fetchData() {
    setLoading(true);
    const activePlayerId = playerProfile?.id;
    const purchasesPromise = activePlayerId
      ? supabase
          .from('store_purchases')
          .select('*')
          .eq('player_profile_id', activePlayerId)
          .in('status', ['active', 'inventory', 'cancelling'])
      : Promise.resolve({ data: [] as Purchase[] });
    const [itemsRes, purchasesRes] = await Promise.all([
      (supabase as any).from('store_items').select('*').eq('is_available', true).order('sort_order'),
      purchasesPromise,
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

    // Club balance for the manager — same source the finance page uses.
    if (isManager && club?.id) {
      const { data: fin } = await supabase
        .from('club_finances')
        .select('balance')
        .eq('club_id', club.id)
        .maybeSingle();
      setClubBalance(typeof fin?.balance === 'number' ? Number(fin.balance) : null);
    } else {
      setClubBalance(null);
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

  // Items that require the buyer to pick a custom color before the purchase
  // RPC runs. Boots / GK gloves always do; cosmetics opt in by name for the
  // visuals the avatar actually renders today. Cosmetics not in this list
  // (e.g. items without a visual) skip the picker and auto-purchase.
  const COLOR_PICK_COSMETICS = new Set([
    'Luva de Inverno', 'Winter Gloves',
    'Munhequeira', 'Wristband',
    'Biceps Band', 'Bicep Band', 'Braçadeira de Bíceps',
    'Caneleira Personalizada', 'Custom Shin Guards',
    'Camiseta Segunda Pele', 'Compression Top',
    'Calça Segunda Pele', 'Compression Tights',
  ]);
  // V2-only cosmetics — each one renders a CosmeticPurchaseDialog with a
  // live avatar preview + the controls the item needs (variant, color, side).
  // The cosmetic kind drives which inputs the dialog shows and which RPC
  // params get filled. Map by canonical name (PT / EN both supported).
  const COSMETIC_PURCHASE_KIND: Record<string, CosmeticKind> = {
    'Tatuagem': 'tattoo', 'Tattoo': 'tattoo',
    'Pintura Facial': 'face_paint', 'Face Paint': 'face_paint',
    'Brinco': 'earring', 'Earring': 'earring',
    'Headband': 'headband',
    'Bandana': 'bandana',
    'Cordão de Prata': 'cordao_prata', 'Silver Necklace': 'cordao_prata',
    'Cordão de Ouro': 'cordao_ouro',  'Gold Necklace':   'cordao_ouro',
    'Pulseira de Prata': 'pulseira_prata', 'Silver Bracelet': 'pulseira_prata',
    'Pulseira de Ouro':  'pulseira_ouro',  'Gold Bracelet':   'pulseira_ouro',
    'Modo Sem Camisa': 'shirtless', 'Shirtless Mode': 'shirtless',
    'Óculos': 'glasses', 'Glasses': 'glasses',
  };
  function cosmeticKindFor(item: StoreItem): CosmeticKind | null {
    if (item.category !== 'cosmetic') return null;
    return COSMETIC_PURCHASE_KIND[item.name]
      ?? (item.name_pt ? COSMETIC_PURCHASE_KIND[item.name_pt] : undefined)
      ?? (item.name_en ? COSMETIC_PURCHASE_KIND[item.name_en] : undefined)
      ?? null;
  }

  // Cosmetics that route to the dedicated background picker instead of the
  // generic color picker (tabbed UI for solid / gradient / pattern / image).
  const BACKGROUND_COSMETICS = new Set(['Fundo do Visual', 'Visual Background']);
  function isBackgroundItem(item: StoreItem): boolean {
    return item.category === 'cosmetic' && (
      BACKGROUND_COSMETICS.has(item.name)
      || (item.name_pt != null && BACKGROUND_COSMETICS.has(item.name_pt))
      || (item.name_en != null && BACKGROUND_COSMETICS.has(item.name_en))
    );
  }
  function needsColorPick(item: StoreItem): boolean {
    if (item.category === 'boots' || item.category === 'gloves') return true;
    if (item.category !== 'cosmetic') return false;
    return COLOR_PICK_COSMETICS.has(item.name)
      || (item.name_pt != null && COLOR_PICK_COSMETICS.has(item.name_pt))
      || (item.name_en != null && COLOR_PICK_COSMETICS.has(item.name_en));
  }

  async function handleBuy(
    item: StoreItem,
    buyerType: 'player' | 'club',
    targetPlayerId?: string,
    confirmReplace = false,
    colors?: ColorValues,
    bg?: { variant: BackgroundVariant; imageUrl: string | null },
    cosmetic?: PurchaseValues,
  ) {
    setBuying(true);
    try {
      const playerId = targetPlayerId || playerProfile?.id;
      if (!playerId) { toast.error(t('errors.no_player')); return; }

      // Multi-color items (boots) ship 3 hexes; single-color items use just
      // the first slot. Background cosmetic also rides on this RPC with
      // bg_variant + bg_image_url so we don't need a separate one.
      const { data, error } = await (supabase as any).rpc('purchase_store_item', {
        p_player_profile_id: playerId,
        p_store_item_id: item.id,
        p_buyer_type: buyerType,
        p_confirm_replace: confirmReplace,
        p_color: cosmetic?.color ?? colors?.color ?? null,
        p_color2: cosmetic?.color2 ?? colors?.color2 ?? null,
        p_color3: colors?.color3 ?? null,
        p_bg_variant: bg?.variant ?? null,
        p_bg_image_url: bg?.imageUrl ?? null,
        p_side: cosmetic?.side ?? null,
        p_tattoo_design: cosmetic?.tattoo_design ?? null,
        p_accessory_variant: cosmetic?.accessory_variant ?? null,
        p_face_paint_design: cosmetic?.face_paint_design ?? null,
        p_face_paint_color2: cosmetic?.color2 ?? null,
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
      toast.success(result?.message || t('errors.buy_success'));
      setGiftItem(null);
      setGiftPlayerId('');
      setSwapConflict(null);
      setColorPick(null);
      setBgPick(null);
      setCosmeticPick(null);
      await Promise.all([fetchData(), refreshPlayerProfile()]);
    } catch (e: any) {
      toast.error(e.message || t('errors.purchase_generic'));
    } finally {
      setBuying(false);
    }
  }

  // Wrapper that routes purchases to the right pre-buy dialog:
  //   - Visual background → tabbed BackgroundPickerDialog (mode + assets)
  //   - Boots / gloves / cosmetics with color → ItemColorPickerDialog
  //   - Everything else → straight to the RPC
  function startBuy(item: StoreItem, buyerType: 'player' | 'club', targetPlayerId?: string) {
    if (isBackgroundItem(item)) {
      setBgPick({ item, buyerType, targetPlayerId });
      return;
    }
    const kind = cosmeticKindFor(item);
    if (kind) {
      setCosmeticPick({ item, kind, buyerType, targetPlayerId });
      return;
    }
    if (needsColorPick(item)) {
      setColorPick({ item, buyerType, targetPlayerId });
      return;
    }
    handleBuy(item, buyerType, targetPlayerId);
  }

  // Cosmetics that take a left/right arm choice when equipping.
  const SIDE_AWARE_COSMETICS = new Set(['Munhequeira', 'Wristband', 'Biceps Band', 'Bicep Band', 'Braçadeira de Bíceps']);
  // Cosmetics that take a long/short sleeve choice instead (winter glove).
  const SLEEVE_AWARE_COSMETICS = new Set(['Luva de Inverno', 'Winter Gloves']);
  // Compression top / tights pick "both / right / left" at equip time.
  const LIMB_ARMS_COSMETICS = new Set(['Camiseta Segunda Pele', 'Compression Top']);
  const LIMB_LEGS_COSMETICS = new Set(['Calça Segunda Pele', 'Compression Tights']);
  function matchesName(item: StoreItem, set: Set<string>): boolean {
    return set.has(item.name)
      || (item.name_pt != null && set.has(item.name_pt))
      || (item.name_en != null && set.has(item.name_en));
  }
  function equipChoiceKind(item: StoreItem | undefined): EquipChoiceKind | null {
    if (!item || item.category !== 'cosmetic') return null;
    if (matchesName(item, SIDE_AWARE_COSMETICS)) return 'arm';
    if (matchesName(item, SLEEVE_AWARE_COSMETICS)) return 'sleeve';
    if (matchesName(item, LIMB_ARMS_COSMETICS)) return 'limbArms';
    if (matchesName(item, LIMB_LEGS_COSMETICS)) return 'limbLegs';
    return null;
  }

  async function handleReactivateSubscription(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('reactivate_store_subscription', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || t('errors.reactivate_success'));
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('errors.reactivate_error'));
    } finally {
      setActing(false);
    }
  }

  async function handleEquip(purchaseId: string, choice: EquipChoice | null = null) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('equip_store_item', {
        p_purchase_id: purchaseId,
        p_side: choice ?? null,
      });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || t('errors.equip_success'));
      setSidePick(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('errors.equip_error'));
    } finally {
      setActing(false);
    }
  }

  // Wrapper that gates cosmetics with equip-time choices behind the dialog.
  function startEquip(purchaseId: string, item: StoreItem | undefined) {
    const kind = equipChoiceKind(item);
    if (kind && item) {
      setSidePick({ purchaseId, itemName: getStoreItemName(item, lang), kind });
      return;
    }
    handleEquip(purchaseId, null);
  }

  async function handleUnequip(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('unequip_store_item', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || t('errors.unequip_success'));
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('errors.unequip_error'));
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
      toast.success(result?.message || t('errors.energetico_success'));
      await Promise.all([fetchData(), refreshPlayerProfile()]);
    } catch (e: any) {
      toast.error(e.message || t('errors.energetico_error'));
    } finally {
      setActing(false);
    }
  }

  async function handleDelete(purchaseId: string) {
    setActing(true);
    try {
      const { data, error } = await (supabase as any).rpc('delete_store_purchase', { p_purchase_id: purchaseId });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(result?.message || t('errors.delete_success'));
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('errors.delete_error'));
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
      toast.success(result?.message || t('errors.cancel_success'));
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('errors.cancel_error'));
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
    // Localize the bonus_type label (forca_chute -> "Shot Power"). Fallback
    // to the raw key if no translation exists so the badge is never empty.
    const bonusLabel = item.bonus_type ? (ATTR_LABELS[item.bonus_type] || item.bonus_type) : '';

    return (
      <Card key={item.id} className={`overflow-hidden ${owned ? 'border-pitch/50 bg-pitch/5' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {getItemIcon(item.category)}
              <CardTitle className="text-sm font-display leading-tight">
                {getStoreItemName(item, lang)}
                {item.level != null && <span className="ml-1.5 text-xs text-muted-foreground">{t('states.level_short', { value: item.level })}</span>}
              </CardTitle>
            </div>
            <div className="flex gap-1">
              {owned && <Badge className="bg-pitch text-[10px]"><Check className="h-3 w-3 mr-0.5" />{t('badges.active')}</Badge>}
              {durationLabel && <Badge variant="outline" className="text-[10px] shrink-0">{durationLabel}</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pb-3">
          {(() => { const d = getStoreItemDescription(item, lang); return d ? <p className="text-xs text-muted-foreground leading-relaxed">{d}</p> : null; })()}
          {item.bonus_type && item.bonus_value != null && (
            <Badge variant="secondary" className="text-[10px]">+{item.bonus_value} {bonusLabel}</Badge>
          )}
          <div className="flex items-center justify-between pt-1 gap-2">
            <span className="font-display text-sm font-bold">{formatBRL(item.price)}</span>
            <div className="flex gap-1">
              {!owned && item.category !== 'currency' && (
                <>
                  {!isManager && (
                    <Button size="sm" className="h-7 text-xs" disabled={buying} onClick={() => startBuy(item, 'player')}>
                      <ShoppingCart className="h-3 w-3 mr-1" />{t('actions.buy')}
                    </Button>
                  )}
                  {isManager && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={buying}
                        onClick={() => { setGiftItem(item); setGiftPlayerId(''); }}>
                        <Gift className="h-3 w-3 mr-1" />{t('actions.give')}
                      </Button>
                    </>
                  )}
                </>
              )}
              {owned && <span className="text-xs text-pitch font-medium">{t('badges.owned')}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-6">
      <StoreIntroTour enabled={!loading && items.length > 0} hasMyItemsTab={!isManager && playerPurchases.length > 0} />
      <StoreManagerIntroTour enabled={!loading && items.length > 0 && isManager} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-tactical" /> {t('header.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('header.subtitle')}
          </p>
        </div>
        {/* Saldo card — player view shows their personal money; manager view
            shows the club balance (which is what funds the gift purchases). */}
        {isManager ? (
          <div className="rounded-lg border border-tactical/30 bg-tactical/5 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
            <Landmark className="h-4 w-4 text-tactical" />
            <div className="text-right leading-tight">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('header.club_balance', { defaultValue: 'Saldo do clube' })}
              </p>
              <p className="font-display font-extrabold text-lg text-tactical tabular-nums">
                {clubBalance != null ? formatBRL(clubBalance) : '—'}
              </p>
            </div>
          </div>
        ) : playerProfile ? (
          <div className="rounded-lg border border-tactical/30 bg-tactical/5 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
            <Wallet className="h-4 w-4 text-tactical" />
            <div className="text-right leading-tight">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('header.your_balance', { defaultValue: 'Seu saldo' })}
              </p>
              <p className="font-display font-extrabold text-lg text-tactical tabular-nums">
                {formatBRL(playerProfile.money ?? 0)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{t('states.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{t('states.no_items')}</div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList data-tour="store-tabs" className="flex flex-wrap h-auto gap-1">
            {!isManager && playerPurchases.length > 0 && (
              <TabsTrigger data-tour="store-my-items" value="meus_itens" className="flex items-center gap-1 text-xs">
                <Package className="h-3 w-3" />
                {categoryTabLabel('meus_itens')}
                <span className="text-[10px] text-muted-foreground">({playerPurchases.length})</span>
              </TabsTrigger>
            )}
            {categoryOrder.filter(c => c !== 'meus_itens').map(cat => {
              const count = grouped[cat]?.length || 0;
              if (count === 0) return null;
              return (
                <TabsTrigger key={cat} value={cat} className="flex items-center gap-1 text-xs">
                  {categoryTabLabel(cat)}
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Meus Itens tab */}
          {!isManager && (() => {
            // Counters per chip — shown next to each filter so the user knows
            // how many items will remain before clicking. Computed off the
            // unfiltered list so the chip you're currently NOT on still shows
            // its real total.
            const statusCounts = {
              all: playerPurchases.length,
              active: playerPurchases.filter(p => p.status === 'active').length,
              inventory: playerPurchases.filter(p => p.status === 'inventory').length,
              cancelling: playerPurchases.filter(p => p.status === 'cancelling').length,
            };
            const categoryCounts: Record<string, number> = { all: playerPurchases.length };
            for (const p of playerPurchases) {
              const cat = p.item ? (DISPLAY_CATEGORIES[p.item.category] || 'outros') : 'outros';
              categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
            const filtered = playerPurchases.filter(p => {
              if (myStatusFilter !== 'all' && p.status !== myStatusFilter) return false;
              if (myCategoryFilter !== 'all') {
                const cat = p.item ? (DISPLAY_CATEGORIES[p.item.category] || 'outros') : 'outros';
                if (cat !== myCategoryFilter) return false;
              }
              return true;
            });
            // Hide the filter UI when there's nothing to filter (≤3 items) —
            // chip rows are noise on a small inventory.
            const showFilters = playerPurchases.length > 3;
            const statusChips: Array<{ id: typeof myStatusFilter; label: string; count: number }> = [
              { id: 'all',        label: t('my_filters.status_all'),        count: statusCounts.all },
              { id: 'active',     label: t('my_filters.status_active'),     count: statusCounts.active },
              { id: 'inventory',  label: t('my_filters.status_inventory'),  count: statusCounts.inventory },
              { id: 'cancelling', label: t('my_filters.status_cancelling'), count: statusCounts.cancelling },
            ];
            const categoryChips: Array<{ id: string; label: string; count: number }> = [
              { id: 'all', label: t('my_filters.category_all'), count: categoryCounts.all ?? 0 },
              ...['cosmeticos', 'chuteiras', 'luvas', 'consumiveis', 'servicos', 'outros']
                .filter(cat => (categoryCounts[cat] ?? 0) > 0)
                .map(cat => ({ id: cat, label: categoryTabLabel(cat), count: categoryCounts[cat] ?? 0 })),
            ];
            return (
            <TabsContent value="meus_itens" className="mt-4 space-y-4">
              {playerPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('states.empty_inventory')}</p>
              ) : (
                <>
                  {showFilters && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
                          {t('my_filters.status_label')}
                        </span>
                        {statusChips.map(chip => {
                          const active = myStatusFilter === chip.id;
                          const disabled = chip.count === 0 && chip.id !== 'all';
                          return (
                            <button
                              key={chip.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => setMyStatusFilter(chip.id)}
                              className={`text-xs rounded-full px-2.5 py-1 border transition ${
                                active
                                  ? 'bg-tactical text-tactical-foreground border-tactical'
                                  : 'bg-card border-border hover:border-tactical/40'
                              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              {chip.label}
                              <span className={`ml-1 text-[10px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                                ({chip.count})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
                          {t('my_filters.category_label')}
                        </span>
                        {categoryChips.map(chip => {
                          const active = myCategoryFilter === chip.id;
                          return (
                            <button
                              key={chip.id}
                              type="button"
                              onClick={() => setMyCategoryFilter(chip.id)}
                              className={`text-xs rounded-full px-2.5 py-1 border transition ${
                                active
                                  ? 'bg-tactical text-tactical-foreground border-tactical'
                                  : 'bg-card border-border hover:border-tactical/40'
                              }`}
                            >
                              {chip.label}
                              <span className={`ml-1 text-[10px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                                ({chip.count})
                              </span>
                            </button>
                          );
                        })}
                        {(myStatusFilter !== 'all' || myCategoryFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => { setMyStatusFilter('all'); setMyCategoryFilter('all'); }}
                            className="text-xs text-destructive hover:underline ml-1"
                          >
                            {t('filters.clear')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t('states.no_filter_match')}</p>
                  ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map(p => {
                    const item = p.item;
                    if (!item) return null;
                    const isEquipment = item.category === 'boots' || item.category === 'gloves' || item.category === 'cosmetic';
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
                                {getStoreItemName(item, lang)}
                                {item.level != null && <span className="ml-1.5 text-xs text-muted-foreground">{t('states.level_short', { value: item.level })}</span>}
                              </CardTitle>
                            </div>
                            {isActive && <Badge className="bg-pitch text-[10px]"><Check className="h-3 w-3 mr-0.5" />{t('badges.active')}</Badge>}
                            {isCancelling && <Badge className="bg-amber-600 text-[10px]">{t('badges.not_renewing')}</Badge>}
                            {isInventory && <Badge variant="outline" className="text-[10px]">{t('badges.inventory')}</Badge>}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-3">
                          {(() => { const d = getStoreItemDescription(item, lang); return d ? <p className="text-xs text-muted-foreground leading-relaxed">{d}</p> : null; })()}
                          {/* Color swatches — shows at a glance which hex(es) the
                              player picked. Cleats render up to 3 (upper / contour
                              / studs); everything else just one. */}
                          {(p.color || p.color2 || p.color3) && (
                            <div className="flex items-center gap-1.5" aria-label={t('badges.colors')}>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('badges.colors')}:</span>
                              {p.color && (
                                <span
                                  title={p.color}
                                  className="h-4 w-4 rounded border border-border shrink-0"
                                  style={{ backgroundColor: p.color }}
                                />
                              )}
                              {p.color2 && (
                                <span
                                  title={p.color2}
                                  className="h-4 w-4 rounded border border-border shrink-0"
                                  style={{ backgroundColor: p.color2 }}
                                />
                              )}
                              {p.color3 && (
                                <span
                                  title={p.color3}
                                  className="h-4 w-4 rounded border border-border shrink-0"
                                  style={{ backgroundColor: p.color3 }}
                                />
                              )}
                            </div>
                          )}
                          {item.bonus_type && item.bonus_value != null && (
                            <Badge variant="secondary" className="text-[10px]">+{item.bonus_value} {ATTR_LABELS[item.bonus_type] || item.bonus_type}</Badge>
                          )}
                          {p.expires_at && (
                            <p className="text-xs text-muted-foreground">{t('states.expires_at', { date: formatDateI18n(p.expires_at, lang, 'date_short') })}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {/* Equipment: equip/unequip */}
                            {isEquipment && isInventory && (
                              <Button size="sm" className="h-7 text-xs" disabled={acting}
                                onClick={() => startEquip(p.id, item)}>
                                <Check className="h-3 w-3 mr-1" />{t('actions.equip')}
                              </Button>
                            )}
                            {isEquipment && isActive && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={acting}
                                onClick={() => handleUnequip(p.id)}>
                                <XCircle className="h-3 w-3 mr-1" />{t('actions.unequip')}
                              </Button>
                            )}
                            {/* Discard a boots / gloves / cosmetic so the player can buy a different color. */}
                            {isEquipment && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" disabled={acting}
                                onClick={() => setDeleteTarget({ purchaseId: p.id, itemName: getStoreItemName(item, lang) })}>
                                <Trash2 className="h-3 w-3 mr-1" />{t('actions.delete')}
                              </Button>
                            )}
                            {/* Consumable: use */}
                            {isConsumable && (
                              <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" disabled={acting}
                                onClick={() => handleUseEnergetico(p.id)}>
                                <BatteryCharging className="h-3 w-3 mr-1" />{t('actions.use')}
                              </Button>
                            )}
                            {/* Monthly subscription: cancel renewal */}
                            {isMonthly && isActive && (
                              <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={acting}
                                onClick={() => handleCancelSubscription(p.id)}>
                                <XCircle className="h-3 w-3 mr-1" />{t('actions.cancel_renewal')}
                              </Button>
                            )}
                            {isCancelling && p.expires_at && (
                              <>
                                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" disabled={acting}
                                  onClick={() => handleReactivateSubscription(p.id)}>
                                  <RefreshCw className="h-3 w-3 mr-1" />{t('actions.reactivate')}
                                </Button>
                                <span className="text-xs text-amber-500">{t('states.active_until', { date: formatDateI18n(p.expires_at, lang, 'date_short') })}</span>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                  )}
                </>
              )}
            </TabsContent>
            );
          })()}

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
                      <option value="">{t('filters.all_levels')}</option>
                      {levels.map(l => <option key={l} value={l}>{t('filters.level', { value: l })}</option>)}
                    </select>
                    <select value={filterBonus ?? ''} onChange={e => setFilterBonus(e.target.value || null)} className="text-xs border rounded px-2 py-1 bg-card">
                      <option value="">{t('filters.all_skills')}</option>
                      {bonusTypes.map(b => <option key={b} value={b!}>{ATTR_LABELS[b!] || b}</option>)}
                    </select>
                    {(filterLevel != null || filterBonus) && (
                      <button onClick={() => { setFilterLevel(null); setFilterBonus(null); }} className="text-xs text-destructive hover:underline">{t('filters.clear')}</button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {catItems.map(item => renderItemCard(item))}
                  {catItems.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">{t('states.no_filter_match')}</p>}
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
              {swapConflict?.item.category === 'trainer' ? t('swap.title_trainer') : t('swap.title_physio')}
            </DialogTitle>
          </DialogHeader>
          {swapConflict && (() => {
            const curLvl = swapConflict.currentLevel ?? 0;
            const newLvl = swapConflict.newLevel ?? 0;
            const isUpgrade = newLvl > curLvl;
            const isDowngrade = newLvl < curLvl;
            return (
              <div className="space-y-4">
                <p
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{
                    __html: swapConflict.item.category === 'trainer'
                      ? t('swap.exclusive_player_trainer')
                      : t('swap.exclusive_player_physio'),
                  }}
                />

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('swap.current')}</span>
                    <span className="font-medium">
                      {swapConflict.currentName}
                      {swapConflict.currentLevel != null && ` — ${t('states.level_short', { value: swapConflict.currentLevel })}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('swap.new')}</span>
                    <span className="font-medium flex items-center gap-1">
                      {isUpgrade && <TrendingUp className="h-3.5 w-3.5 text-pitch" />}
                      {isDowngrade && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                      {swapConflict.newName}
                      {swapConflict.newLevel != null && ` — ${t('states.level_short', { value: swapConflict.newLevel })}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">{t('swap.new_cost')}</span>
                    <span className="font-display font-bold">{formatBRL(swapConflict.newPrice)}</span>
                  </div>
                </div>

                {isDowngrade && (
                  <div
                    className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
                    dangerouslySetInnerHTML={{ __html: t('swap.downgrade_warning', { level: curLvl }) }}
                  />
                )}
                <p
                  className="text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: t('swap.no_refund') }}
                />

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={buying}
                    onClick={() => setSwapConflict(null)}>
                    {t('actions.cancel')}
                  </Button>
                  <Button variant={isDowngrade ? 'destructive' : 'default'} className="flex-1" disabled={buying}
                    onClick={() => handleBuy(swapConflict.item, swapConflict.buyerType, swapConflict.targetPlayerId, true)}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {buying ? t('actions.processing') : t('actions.confirm_swap')}
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
            <DialogTitle>
              {t('gift.title', {
                name: giftItem ? getStoreItemName(giftItem, lang) : '',
                level: giftItem?.level ? t('states.level_short', { value: giftItem.level }) : '',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('gift.description', { price: giftItem ? formatBRL(giftItem.price) : '' })}
            </p>
            <Select value={giftPlayerId} onValueChange={setGiftPlayerId}>
              <SelectTrigger><SelectValue placeholder={t('gift.select_player')} /></SelectTrigger>
              <SelectContent>
                {teamPlayers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="w-full" disabled={!giftPlayerId || buying} onClick={() => giftItem && startBuy(giftItem, 'club', giftPlayerId)}>
              <Gift className="h-4 w-4 mr-2" />{t('gift.buy_and_give')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Color picker dialog for boots / gloves / visual cosmetics. Boots
          render 3 slots (upper, sole/contour, studs); everything else uses
          the default single-slot layout. */}
      {colorPick && (() => {
        const slots: ColorSlot[] | undefined = colorPick.item.category === 'boots'
          ? [
              { id: 'color', label: t('boots_colors.primary'), hint: t('boots_colors.primary_hint'), defaultValue: '#ef4444' },
              { id: 'color2', label: t('boots_colors.secondary'), hint: t('boots_colors.secondary_hint'), defaultValue: '#0a0a0a' },
              { id: 'color3', label: t('boots_colors.studs'), hint: t('boots_colors.studs_hint'), defaultValue: '#000000' },
            ]
          : undefined;
        return (
          <ItemColorPickerDialog
            open={!!colorPick}
            onOpenChange={(open) => { if (!open && !buying) setColorPick(null); }}
            itemName={getStoreItemName(colorPick.item, lang)}
            slots={slots}
            busy={buying}
            onConfirm={(picked) => handleBuy(colorPick.item, colorPick.buyerType, colorPick.targetPlayerId, false, picked)}
          />
        );
      })()}

      {/* Equip-time choice dialog (arm side or sleeve length) */}
      {sidePick && (
        <EquipSideDialog
          open={!!sidePick}
          onOpenChange={(open) => { if (!open && !acting) setSidePick(null); }}
          itemName={sidePick.itemName}
          kind={sidePick.kind}
          busy={acting}
          onConfirm={(picked) => handleEquip(sidePick.purchaseId, picked)}
        />
      )}

      {/* Visual-background picker for the "Fundo do Visual" cosmetic */}
      {bgPick && (
        <BackgroundPickerDialog
          open={!!bgPick}
          onOpenChange={(open) => { if (!open && !buying) setBgPick(null); }}
          itemName={getStoreItemName(bgPick.item, lang)}
          busy={buying}
          onConfirm={(payload) => handleBuy(
            bgPick.item, bgPick.buyerType, bgPick.targetPlayerId, false,
            { color: payload.color ?? '', color2: payload.color2 ?? '', color3: '' },
            { variant: payload.variant, imageUrl: payload.imageUrl },
          )}
        />
      )}

      {/* V2 cosmetic configurator with live avatar preview */}
      {cosmeticPick && (
        <CosmeticPurchaseDialog
          open={!!cosmeticPick}
          onOpenChange={(open) => { if (!open && !buying) setCosmeticPick(null); }}
          kind={cosmeticPick.kind}
          itemName={getStoreItemName(cosmeticPick.item, lang)}
          appearance={(playerProfile as any)?.appearance ?? null}
          clubPrimaryColor={null}
          clubSecondaryColor={null}
          position={(playerProfile as any)?.primary_position ?? null}
          jerseyPattern={null}
          busy={buying}
          onConfirm={(payload) => handleBuy(
            cosmeticPick.item, cosmeticPick.buyerType, cosmeticPick.targetPlayerId,
            false, undefined, undefined, payload,
          )}
        />
      )}

      {/* Delete confirmation — discards an owned item so the player can re-buy. */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !acting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('delete.title')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('delete.body', { item: deleteTarget?.itemName ?? '' })}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" disabled={acting}
              onClick={() => setDeleteTarget(null)}>
              {t('actions.cancel')}
            </Button>
            <Button variant="destructive" className="flex-1" disabled={acting}
              onClick={() => deleteTarget && handleDelete(deleteTarget.purchaseId)}>
              <Trash2 className="h-4 w-4 mr-1" />
              {acting ? t('actions.processing') : t('delete.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return <Layout>{content}</Layout>;
}
