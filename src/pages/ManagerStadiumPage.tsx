import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Star, Wrench, DollarSign, TrendingUp, Save, Loader2, BarChart3, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatting';
import { PitchSVG, DEFAULT_STADIUM_STYLE, type StadiumStyle } from '@/components/PitchSVG';
import type { TFunction } from 'i18next';
import { ManagerStadiumIntroTour } from '@/components/tour/ManagerStadiumIntroTour';

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

// ─── Style editor constants ──────────────────────────────────────────
const PITCH_PATTERN_VALUES = [
  'stripes_vertical_thin',
  'stripes_vertical_thick',
  'stripes_horizontal_thin',
  'stripes_horizontal_thick',
  'checkered_small',
  'checkered_large',
  'concentric_circles',
  'diagonal',
  'uniform',
] as const;

const LIGHTING_VALUES = ['neutral', 'warm', 'cold', 'night'] as const;
const NET_PATTERN_VALUES = ['checkered', 'diamond'] as const;
const NET_STYLE_VALUES = ['classic', 'veil'] as const;

const STYLE_COLORS = [
  'hsl(140,10%,15%)', 'hsl(220,15%,18%)', 'hsl(0,0%,12%)', 'hsl(0,0%,20%)',
  'hsl(210,20%,25%)', 'hsl(30,10%,20%)', 'hsl(350,30%,20%)', 'hsl(200,40%,20%)',
  'hsl(160,30%,18%)', 'hsl(270,20%,20%)', 'hsl(40,30%,25%)', 'hsl(0,50%,25%)',
  'hsl(220,50%,25%)', 'hsl(120,30%,20%)', 'hsl(45,60%,30%)', 'hsl(0,0%,30%)',
];

function StyleOptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
        selected
          ? 'bg-pitch text-white border-pitch'
          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-7 h-7 rounded-md border-2 transition-all ${
        selected ? 'border-pitch scale-110 ring-1 ring-pitch/50' : 'border-transparent hover:border-muted-foreground/30'
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

function StadiumStyleEditor({
  editedStyle,
  setEditedStyle,
  hasStyleChanges,
  savingStyle,
  onSave,
  t,
}: {
  editedStyle: StadiumStyle;
  setEditedStyle: React.Dispatch<React.SetStateAction<StadiumStyle>>;
  hasStyleChanges: boolean;
  savingStyle: boolean;
  onSave: () => void;
  t: TFunction;
}) {
  const updateField = <K extends keyof StadiumStyle>(key: K, value: StadiumStyle[K]) => {
    setEditedStyle(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-pitch" />
          <h2 className="font-display font-semibold text-sm">{t('style.title')}</h2>
        </div>
        {hasStyleChanges && (
          <Button
            size="sm"
            onClick={onSave}
            disabled={savingStyle}
            className="bg-pitch hover:bg-pitch/90 text-white"
          >
            {savingStyle ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {t('style.save')}
          </Button>
        )}
      </div>

      {/* Live preview */}
      <div className="mb-5 flex justify-center">
        <div style={{ width: 700, maxWidth: '100%' }}>
          <PitchSVG style={editedStyle} />
        </div>
      </div>

      <div className="space-y-4">
        {/* Pitch pattern */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.pitch')}</label>
          <div className="flex flex-wrap gap-1.5">
            {PITCH_PATTERN_VALUES.map(value => (
              <StyleOptionButton
                key={value}
                selected={editedStyle.pitch_pattern === value}
                onClick={() => updateField('pitch_pattern', value)}
              >
                {t(`pitch_patterns.${value}`)}
              </StyleOptionButton>
            ))}
          </div>
        </div>

        {/* Border color */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.border')}</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_COLORS.map(color => (
              <ColorSwatch
                key={color}
                color={color}
                selected={editedStyle.border_color === color}
                onClick={() => updateField('border_color', color)}
              />
            ))}
          </div>
        </div>

        {/* Lighting */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.lighting')}</label>
          <div className="flex flex-wrap gap-1.5">
            {LIGHTING_VALUES.map(value => (
              <StyleOptionButton
                key={value}
                selected={editedStyle.lighting === value}
                onClick={() => updateField('lighting', value)}
              >
                {t(`lighting.${value}`)}
              </StyleOptionButton>
            ))}
          </div>
        </div>

        {/* Net pattern + style */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.net_pattern')}</label>
            <div className="flex flex-wrap gap-1.5">
              {NET_PATTERN_VALUES.map(value => (
                <StyleOptionButton
                  key={value}
                  selected={editedStyle.net_pattern === value}
                  onClick={() => updateField('net_pattern', value)}
                >
                  {t(`net_patterns.${value}`)}
                </StyleOptionButton>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.net_style')}</label>
            <div className="flex flex-wrap gap-1.5">
              {NET_STYLE_VALUES.map(value => (
                <StyleOptionButton
                  key={value}
                  selected={editedStyle.net_style === value}
                  onClick={() => updateField('net_style', value)}
                >
                  {t(`net_styles.${value}`)}
                </StyleOptionButton>
              ))}
            </div>
          </div>
        </div>

        {/* Ad board color */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.ad_boards')}</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_COLORS.map(color => (
              <ColorSwatch
                key={color}
                color={color}
                selected={editedStyle.ad_board_color === color}
                onClick={() => updateField('ad_board_color', color)}
              />
            ))}
          </div>
        </div>

        {/* Bench color */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t('style.bench')}</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_COLORS.map(color => (
              <ColorSwatch
                key={color}
                color={color}
                selected={editedStyle.bench_color === color}
                onClick={() => updateField('bench_color', color)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagerStadiumPage() {
  const { t } = useTranslation('manager_stadium');
  const { club } = useAuth();
  const [stadium, setStadium] = useState<any>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [revenuePreview, setRevenuePreview] = useState<RevenuePreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [editedStyle, setEditedStyle] = useState<StadiumStyle>({ ...DEFAULT_STADIUM_STYLE });
  const [savedStyle, setSavedStyle] = useState<StadiumStyle>({ ...DEFAULT_STADIUM_STYLE });
  const [savingStyle, setSavingStyle] = useState(false);

  const hasChanges = Object.keys(editedPrices).some(
    id => editedPrices[id] !== sectors.find(s => s.id === id)?.ticket_price
  );

  const hasStyleChanges = JSON.stringify(editedStyle) !== JSON.stringify(savedStyle);

  useEffect(() => {
    if (!club) return;
    fetchData();
    fetchStadiumStyle();
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

  async function fetchStadiumStyle() {
    if (!club) return;
    const { data } = await supabase
      .from('stadium_styles')
      .select('*')
      .eq('club_id', club.id)
      .maybeSingle();
    if (data) {
      const loaded: StadiumStyle = {
        pitch_pattern: data.pitch_pattern ?? DEFAULT_STADIUM_STYLE.pitch_pattern,
        border_color: data.border_color ?? DEFAULT_STADIUM_STYLE.border_color,
        lighting: data.lighting ?? DEFAULT_STADIUM_STYLE.lighting,
        net_pattern: data.net_pattern ?? DEFAULT_STADIUM_STYLE.net_pattern,
        net_style: data.net_style ?? DEFAULT_STADIUM_STYLE.net_style,
        ad_board_color: data.ad_board_color ?? DEFAULT_STADIUM_STYLE.ad_board_color,
        bench_color: data.bench_color ?? DEFAULT_STADIUM_STYLE.bench_color,
      };
      setEditedStyle(loaded);
      setSavedStyle(loaded);
    }
  }

  async function handleSaveStyle() {
    if (!club) return;
    setSavingStyle(true);
    try {
      const { error } = await supabase.from('stadium_styles').upsert(
        {
          club_id: club.id,
          ...editedStyle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'club_id' }
      );
      if (error) throw error;
      setSavedStyle({ ...editedStyle });
      toast.success(t('toast.style_saved'));
    } catch (err: any) {
      toast.error(err.message || t('toast.style_error'));
    } finally {
      setSavingStyle(false);
    }
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
      toast.success(t('toast.prices_saved'));
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || t('toast.prices_error'));
    } finally {
      setSaving(false);
    }
  }

  if (!club || !stadium) {
    return (
      <ManagerLayout>
        <p className="text-muted-foreground">{t('loading')}</p>
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
        <ManagerStadiumIntroTour enabled={!!stadium} />
        <h1 className="font-display text-2xl font-bold">{stadium.name}</h1>

        {/* Stats */}
        <div data-tour="stadium-header" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('stats.capacity')} value={totalCapacity.toLocaleString()} icon={<Users className="h-5 w-5" />} />
          <StatCard label={t('stats.quality')} value={`${stadium.quality}/100`} icon={<Building2 className="h-5 w-5" />} />
          <StatCard label={t('stats.avg_occupancy')} value={`${avgOccupancy.toFixed(0)}%`} icon={<BarChart3 className="h-5 w-5" />} />
          <StatCard label={t('stats.matchday_revenue')} value={formatBRL(totalExpectedRevenue)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>

        {/* Revenue preview banner */}
        <div className="stat-card bg-gradient-to-r from-pitch/10 to-tactical/10 border-pitch/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm">{t('preview.title')}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('preview.attendance')} <span className="font-semibold text-foreground">{totalExpectedAttendance.toLocaleString()}</span> / {totalCapacity.toLocaleString()}
                {' '}({totalCapacity > 0 ? ((totalExpectedAttendance / totalCapacity) * 100).toFixed(0) : 0}%)
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-pitch">{formatBRL(totalExpectedRevenue)}</p>
              <p className="text-xs text-muted-foreground">{t('preview.estimated_revenue')}</p>
            </div>
          </div>
        </div>

        {/* Sectors */}
        <div data-tour="stadium-sectors" className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-sm">{t('sectors.title')}</h2>
            {hasChanges && (
              <Button
                size="sm"
                onClick={handleSavePrices}
                disabled={saving}
                className="bg-pitch hover:bg-pitch/90 text-white"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {t('sectors.save_prices')}
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
                        {t('sectors.seats', { count: sec.capacity.toLocaleString() })}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <span className="text-muted-foreground">{t('sectors.revenue_label')}</span>
                      <span className="font-display font-bold text-pitch">{formatBRL(revenue)}</span>
                    </div>
                  </div>

                  {/* Occupancy bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t('sectors.audience_label', { attendance: attendance.toLocaleString(), capacity: sec.capacity.toLocaleString() })}
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
            <p className="text-sm text-muted-foreground text-center py-4">{t('sectors.empty')}</p>
          )}
        </div>

        {/* Stadium Style Editor */}
        <div data-tour="stadium-style">
        <StadiumStyleEditor
          editedStyle={editedStyle}
          setEditedStyle={setEditedStyle}
          hasStyleChanges={hasStyleChanges}
          savingStyle={savingStyle}
          onSave={handleSaveStyle}
          t={t}
        />
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1 px-1">
          <p>{t('info.line1')}</p>
          <p>{t('info.line2')}</p>
          <p>{t('info.line3')}</p>
        </div>
      </div>
    </ManagerLayout>
  );
}
