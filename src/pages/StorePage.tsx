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
  sub_category: string | null;
  level: number | null;
  bonus_attribute: string | null;
  bonus_value: number | null;
  price: number | null;
  price_type: string | null;
  duration: string | null;
  is_available: boolean;
  sort_order: number | null;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  cosmeticos: <ShoppingBag className="h-4 w-4" />,
  chuteiras: <Footprints className="h-4 w-4" />,
  consumiveis: <Zap className="h-4 w-4" />,
  servicos: <GraduationCap className="h-4 w-4" />,
  outros: <Gift className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  cosmeticos: 'Cosméticos',
  chuteiras: 'Chuteiras',
  consumiveis: 'Consumíveis',
  servicos: 'Serviços',
  outros: 'Outros',
};

function getItemIcon(category: string, subCategory: string | null) {
  if (subCategory === 'trainer') return <GraduationCap className="h-5 w-5 text-muted-foreground" />;
  if (subCategory === 'physio') return <Heart className="h-5 w-5 text-muted-foreground" />;
  if (subCategory === 'donation') return <Gift className="h-5 w-5 text-muted-foreground" />;
  if (subCategory === 'currency') return <CreditCard className="h-5 w-5 text-muted-foreground" />;
  if (category === 'chuteiras') return <Footprints className="h-5 w-5 text-muted-foreground" />;
  if (category === 'consumiveis') return <Zap className="h-5 w-5 text-muted-foreground" />;
  if (category === 'cosmeticos') return <ShoppingBag className="h-5 w-5 text-muted-foreground" />;
  return <Store className="h-5 w-5 text-muted-foreground" />;
}

function getDurationLabel(duration: string | null): string | null {
  if (!duration) return null;
  switch (duration) {
    case 'permanent': return 'Permanente';
    case 'monthly': return 'Mensal';
    case 'single_use': return 'Uso Único';
    case 'daily': return '1x por dia';
    default: return duration;
  }
}

function formatPrice(price: number | null, priceType: string | null): string {
  if (priceType === 'real_money') return 'Dinheiro Real';
  if (price == null) return '—';
  return `R$ ${price.toLocaleString('pt-BR')}`;
}

function StoreItemCard({ item }: { item: StoreItem }) {
  const durationLabel = getDurationLabel(item.duration);

  return (
    <Card className="relative opacity-50 overflow-hidden">
      {/* Unavailable overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
        <div className="flex flex-col items-center gap-1">
          <Lock className="h-6 w-6 text-muted-foreground" />
          <span className="font-display text-sm font-bold text-muted-foreground tracking-wide">
            INDISPONÍVEL
          </span>
        </div>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {getItemIcon(item.category, item.sub_category)}
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

        {item.bonus_attribute && item.bonus_value != null && (
          <Badge variant="secondary" className="text-[10px]">
            +{item.bonus_value} {item.bonus_attribute}
          </Badge>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="font-display text-sm font-bold">
            {formatPrice(item.price, item.price_type)}
          </span>
          <Button size="sm" disabled className="text-xs h-7 px-3">
            Comprar
          </Button>
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
    const cat = item.category || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['cosmeticos', 'chuteiras', 'consumiveis', 'servicos', 'outros'];
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
                  {CATEGORY_ICONS[cat]}
                  {CATEGORY_LABELS[cat]}
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categoryOrder.map((cat) => {
            const catItems = grouped[cat];
            if (!catItems?.length) return null;
            return (
              <TabsContent key={cat} value={cat} className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {catItems.map((item) => (
                    <StoreItemCard key={item.id} item={item} />
                  ))}
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
