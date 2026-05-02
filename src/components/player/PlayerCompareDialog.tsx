import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { RatingChip } from './RatingChip';

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePlayerId: string;
  basePlayerName: string;
}

interface PlayerHit {
  id: string;
  full_name: string;
  primary_position: string | null;
  overall: number;
  appearance: any;
  club_id: string | null;
}

interface AggregatedStats {
  gp: number;
  avgRating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passesCompleted: number;
  passesAttempted: number;
  tackles: number;
  interceptions: number;
  gkSaves: number;
  cleanSheets: number;
}

async function loadAggregates(playerProfileId: string): Promise<AggregatedStats> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('rating, goals, assists, shots, shots_on_target, passes_completed, passes_attempted, tackles, interceptions, gk_saves, clean_sheet')
    .eq('player_profile_id', playerProfileId);
  const rows = (data || []) as any[];
  const init = {
    gp: 0, avgRating: null as number | null, goals: 0, assists: 0,
    shots: 0, shotsOnTarget: 0, passesCompleted: 0, passesAttempted: 0,
    tackles: 0, interceptions: 0, gkSaves: 0, cleanSheets: 0,
  };
  let ratedSum = 0, ratedCount = 0;
  for (const r of rows) {
    init.gp += 1;
    init.goals += r.goals || 0;
    init.assists += r.assists || 0;
    init.shots += r.shots || 0;
    init.shotsOnTarget += r.shots_on_target || 0;
    init.passesCompleted += r.passes_completed || 0;
    init.passesAttempted += r.passes_attempted || 0;
    init.tackles += r.tackles || 0;
    init.interceptions += r.interceptions || 0;
    init.gkSaves += r.gk_saves || 0;
    if (r.clean_sheet) init.cleanSheets += 1;
    if (r.rating !== null && r.rating !== undefined) {
      ratedSum += Number(r.rating);
      ratedCount += 1;
    }
  }
  init.avgRating = ratedCount > 0 ? Math.round((ratedSum / ratedCount) * 10) / 10 : null;
  return init;
}

export function PlayerCompareDialog({ open, onOpenChange, basePlayerId, basePlayerName }: CompareDialogProps) {
  const { t } = useTranslation('public_player');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<PlayerHit | null>(null);
  const [baseStats, setBaseStats] = useState<AggregatedStats | null>(null);
  const [oppStats, setOppStats] = useState<AggregatedStats | null>(null);

  useEffect(() => {
    if (!open) return;
    setOpponentId(null);
    setOpponent(null);
    setSearch('');
    setOppStats(null);
    setHits([]);
    loadAggregates(basePlayerId).then(setBaseStats);
  }, [open, basePlayerId]);

  useEffect(() => {
    if (!search.trim()) { setHits([]); return; }
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('player_profiles')
        .select('id, full_name, primary_position, overall, appearance, club_id')
        .ilike('full_name', `%${search.trim()}%`)
        .neq('id', basePlayerId)
        .limit(8);
      setHits((data || []) as PlayerHit[]);
    }, 200);
    return () => clearTimeout(handle);
  }, [search, basePlayerId]);

  useEffect(() => {
    if (!opponentId) { setOpponent(null); setOppStats(null); return; }
    (async () => {
      const { data } = await supabase
        .from('player_profiles')
        .select('id, full_name, primary_position, overall, appearance, club_id')
        .eq('id', opponentId)
        .maybeSingle();
      setOpponent((data || null) as PlayerHit | null);
      setOppStats(await loadAggregates(opponentId));
    })();
  }, [opponentId]);

  const rows = useMemo(() => {
    if (!baseStats || !oppStats) return [];
    const passPct = (s: AggregatedStats) => s.passesAttempted ? (s.passesCompleted / s.passesAttempted) * 100 : 0;
    return [
      { label: t('stats.compare.row_matches'), a: baseStats.gp, b: oppStats.gp },
      { label: t('stats.compare.row_avg_rating'), a: baseStats.avgRating ?? 0, b: oppStats.avgRating ?? 0, isRating: true },
      { label: t('stats.compare.row_goals'), a: baseStats.goals, b: oppStats.goals },
      { label: t('stats.compare.row_assists'), a: baseStats.assists, b: oppStats.assists },
      { label: t('stats.compare.row_shots_on_target'), a: baseStats.shotsOnTarget, b: oppStats.shotsOnTarget },
      { label: t('stats.compare.row_pass_accuracy'), a: Math.round(passPct(baseStats)), b: Math.round(passPct(oppStats)), suffix: '%' },
      { label: t('stats.compare.row_tackles'), a: baseStats.tackles, b: oppStats.tackles },
      { label: t('stats.compare.row_interceptions'), a: baseStats.interceptions, b: oppStats.interceptions },
      { label: t('stats.compare.row_gk_saves'), a: baseStats.gkSaves, b: oppStats.gkSaves },
      { label: t('stats.compare.row_clean_sheets'), a: baseStats.cleanSheets, b: oppStats.cleanSheets },
    ];
  }, [baseStats, oppStats, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('stats.compare.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">{basePlayerName}</div>
            </div>
            <div className="text-center">
              {opponent ? (
                <div className="flex items-center gap-2 justify-center">
                  <PlayerAvatar appearance={opponent.appearance} variant="face" playerName={opponent.full_name} className="h-8 w-8" fallbackSeed={opponent.id} />
                  <div className="text-sm font-display font-bold truncate">{opponent.full_name}</div>
                  <button onClick={() => setOpponentId(null)} className="text-xs text-muted-foreground hover:text-destructive">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('stats.compare.search_placeholder')}
                    className="pl-7 h-8 text-sm"
                  />
                  {hits.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                      {hits.map(h => (
                        <button
                          key={h.id}
                          onClick={() => { setOpponentId(h.id); setSearch(''); setHits([]); }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted text-left text-sm"
                        >
                          <PlayerAvatar appearance={h.appearance} variant="face" playerName={h.full_name} className="h-6 w-6 shrink-0" fallbackSeed={h.id} />
                          <span className="truncate flex-1">{h.full_name}</span>
                          <span className="text-xs text-muted-foreground">{h.primary_position}</span>
                          <span className="text-xs font-display font-bold">{h.overall}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stat rows */}
          {opponent && rows.length > 0 ? (
            <div className="space-y-1">
              {rows.map(r => {
                const aBetter = Number(r.a) > Number(r.b);
                const bBetter = Number(r.b) > Number(r.a);
                return (
                  <div key={r.label} className="grid grid-cols-2 gap-4 items-center py-1 border-b border-border/40 last:border-b-0">
                    <div className={`flex items-center gap-2 ${aBetter ? 'font-bold' : ''}`}>
                      {(r as any).isRating ? <RatingChip rating={Number(r.a)} size="sm" /> : (
                        <span className={`font-display tabular-nums ${aBetter ? 'text-green-600 dark:text-green-400' : ''}`}>{r.a}{r.suffix ?? ''}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                    </div>
                    <div className={`flex items-center gap-2 justify-end ${bBetter ? 'font-bold' : ''}`}>
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                      {(r as any).isRating ? <RatingChip rating={Number(r.b)} size="sm" /> : (
                        <span className={`font-display tabular-nums ${bBetter ? 'text-green-600 dark:text-green-400' : ''}`}>{r.b}{r.suffix ?? ''}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : opponent && (!baseStats || !oppStats) ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <p className="text-center text-xs text-muted-foreground py-4">{t('stats.compare.select_player')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
