import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Store,
  ShoppingBag,
  Footprints,
  Zap,
  Shield,
  GraduationCap,
  Heart,
  Gift,
  CreditCard,
  Lock,
} from 'lucide-react';

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

const DISPLAY_CATEGORIES: Record<string, string> = {
  cosmetic: 'cosmeticos',
  boots: 'chuteiras',
  gloves: 'luvas',
  consumable: 'consumiveis',
  trainer: 'servicos',
  physio: 'servicos',
  donation: 'outros',
  currency: 'outros',
};

const CATEGORY_TAB_LABELS: Record<string, string> = {
  cosmeticos: 'Cosméticos',
  chuteiras: 'Chuteiras',
  luvas: 'Luvas de Goleiro',
  consumiveis: 'Consumíveis',
  servicos: 'Serviços',
  outros: 'Outros',
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

const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function StoreItemCard({ item }: { item: StoreItem }) {
  const durationLabel = getDurationLabel(item.duration);

  return (
    <Card className="overflow-hidden">

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {getItemIcon(item.category)}
            <CardTitle className="text-sm font-display leading-tight">
              {item.name}
              {item.level != null && (
                <span className="ml-1.5 text-xs text-muted-foreground">Nv. {item.level}</span>
              )}
            </CardTitle>
          </div>
          {durationLabel && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {durationLabel}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-3">
        {item.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        )}

        {item.bonus_type && item.bonus_value != null && (
          <Badge variant="secondary" className="text-[10px]">
            +{item.bonus_value} {item.bonus_type}
          </Badge>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="font-display text-sm font-bold">
            {item.price_real ? 'Dinheiro Real' : formatBRL(item.price)}
          </span>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Em breve
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StorePage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isManager = profile?.role_selected === 'manager';
  const Layout = isManager ? ManagerLayout : AppLayout;

  // Filters for boots/gloves
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [filterBonus, setFilterBonus] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItems() {
      const { data, error } = await (supabase as any)
        .from('store_items')
        .select('*')
        .order('sort_order');
      if (!error && data) {
        setItems(data as StoreItem[]);
      }
      setLoading(false);
    }
    fetchItems();
  }, []);

  const grouped = items.reduce<Record<string, StoreItem[]>>((acc, item) => {
    const cat = DISPLAY_CATEGORIES[item.category] || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['cosmeticos', 'chuteiras', 'luvas', 'consumiveis', 'servicos', 'outros'];
  const availableCategories = categoryOrder.filter((c) => grouped[c]?.length);
  const defaultTab = availableCategories[0] || 'cosmeticos';

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6 text-tactical" /> Loja
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Em breve — todos os itens estarão disponíveis em breve!
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando itens...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Nenhum item cadastrado na loja ainda.
        </div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            {categoryOrder.map((cat) => {
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

          {categoryOrder.map((cat) => {
            let catItems = grouped[cat];
            if (!catItems?.length) return null;

            const hasFilters = cat === 'chuteiras' || cat === 'luvas';
            const bonusTypes = hasFilters ? [...new Set(catItems.map(i => i.bonus_type).filter(Boolean))] : [];
            const levels = hasFilters ? [...new Set(catItems.map(i => i.level).filter((l): l is number => l != null))].sort((a, b) => a - b) : [];

            // Apply filters
            if (hasFilters) {
              if (filterLevel != null) catItems = catItems.filter(i => i.level === filterLevel);
              if (filterBonus) catItems = catItems.filter(i => i.bonus_type === filterBonus);
            }

            return (
              <TabsContent key={cat} value={cat} className="mt-4 space-y-4">
                {hasFilters && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={filterLevel ?? ''}
                      onChange={e => setFilterLevel(e.target.value ? Number(e.target.value) : null)}
                      className="text-xs border rounded px-2 py-1 bg-card"
                    >
                      <option value="">Todos os Níveis</option>
                      {levels.map(l => <option key={l} value={l}>Nível {l}</option>)}
                    </select>
                    <select
                      value={filterBonus ?? ''}
                      onChange={e => setFilterBonus(e.target.value || null)}
                      className="text-xs border rounded px-2 py-1 bg-card"
                    >
                      <option value="">Todas as Habilidades</option>
                      {bonusTypes.map(b => <option key={b} value={b!}>{b}</option>)}
                    </select>
                    {(filterLevel != null || filterBonus) && (
                      <button onClick={() => { setFilterLevel(null); setFilterBonus(null); }} className="text-xs text-destructive hover:underline">
                        Limpar filtros
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {catItems.map((item) => (
                    <StoreItemCard key={item.id} item={item} />
                  ))}
                  {catItems.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum item com esses filtros.</p>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );

  return <Layout>{content}</Layout>;
}
