import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Shield, DollarSign, Users, Building2, Trophy, Wrench, Dumbbell,
  Store, Handshake, Calendar, TrendingUp, Star, LogOut, Loader2,
  Swords, Brain, CircleDot, ArrowRight, Pencil, Upload, X,
} from 'lucide-react';
import { formatBRL } from '@/lib/formatting';
import { ClubCrest } from '@/components/ClubCrest';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { seededAppearance } from '@/lib/avatar';
import { ManagerClubIntroTour } from '@/components/tour/ManagerClubIntroTour';

const CREST_EMOJI_PRESETS = ['⚽', '🦁', '🦅', '🐺', '🐉', '🐻', '🐯', '🦈', '⭐', '🔥', '🛡️', '⚓', '👑', '🌪️', '🦊', '🐍'];

const FACILITY_ICONS: Record<string, typeof Store> = {
  souvenir_shop: Store,
  sponsorship: Handshake,
  training_center: Dumbbell,
  stadium: Building2,
};

const COACH_ICONS: Record<string, typeof Shield> = {
  defensive: Shield,
  offensive: Swords,
  technical: Brain,
  all_around: CircleDot,
  complete: CircleDot,
};

export default function ManagerClubPage() {
  const { t } = useTranslation('manager_club');
  const { current: lang } = useAppLanguage();
  const { managerProfile, club, refreshManagerProfile } = useAuth();
  const navigate = useNavigate();

  const [finance, setFinance] = useState<any>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [stadium, setStadium] = useState<any>(null);
  const [squadSize, setSquadSize] = useState(0);
  const [wageBill, setWageBill] = useState(0);
  const [formation, setFormation] = useState('4-4-2');
  const [standing, setStanding] = useState<any>(null);
  const [nextMatch, setNextMatch] = useState<any>(null);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editShort, setEditShort] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPrimary, setEditPrimary] = useState('');
  const [editSecondary, setEditSecondary] = useState('');
  const [editStadiumName, setEditStadiumName] = useState('');
  const [editCrestUrl, setEditCrestUrl] = useState<string | null>(null);
  const [crestUploading, setCrestUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const EDIT_COST = 500000;
  const PRESET_COLORS = [
    '#1a5276', '#c0392b', '#27ae60', '#f39c12', '#8e44ad',
    '#2c3e50', '#e74c3c', '#3498db', '#1abc9c', '#d35400',
    '#FF0000', '#0000FF', '#008000', '#FFD700', '#800080',
  ];

  useEffect(() => {
    if (!club) { setLoading(false); return; }
    fetchAll();
  }, [club]);

  async function fetchAll() {
    const clubId = club!.id;

    const [finRes, facRes, stadRes, conRes, setRes] = await Promise.all([
      supabase.from('club_finances').select('*').eq('club_id', clubId).maybeSingle(),
      supabase.from('club_facilities').select('facility_type, level').eq('club_id', clubId),
      supabase.from('stadiums').select('*').eq('club_id', clubId).maybeSingle(),
      supabase.from('contracts').select('weekly_salary').eq('club_id', clubId).eq('status', 'active'),
      supabase.from('club_settings').select('default_formation').eq('club_id', clubId).maybeSingle(),
    ]);

    setFinance(finRes.data);
    setFacilities((facRes.data || []) as any[]);
    setStadium(stadRes.data);
    setSquadSize((conRes.data || []).length);
    setWageBill((conRes.data || []).reduce((s: number, c: any) => s + Number(c.weekly_salary || 0), 0));
    setFormation(setRes.data?.default_formation || '4-4-2');

    // League standing
    const { data: season } = await supabase
      .from('league_seasons')
      .select('id')
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!season) {
      // Try scheduled season
      const { data: scheduledSeason } = await supabase
        .from('league_seasons')
        .select('id')
        .eq('status', 'scheduled')
        .order('season_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (scheduledSeason) {
        const { data: std } = await supabase
          .from('league_standings')
          .select('*, clubs(name)')
          .eq('season_id', scheduledSeason.id)
          .order('points', { ascending: false })
          .order('goals_for', { ascending: false });
        if (std) {
          const pos = std.findIndex((s: any) => s.club_id === clubId);
          if (pos >= 0) setStanding({ position: pos + 1, ...std[pos], total: std.length });
        }
      }
    } else {
      const { data: std } = await supabase
        .from('league_standings')
        .select('*, clubs(name)')
        .eq('season_id', season.id)
        .order('points', { ascending: false })
        .order('goals_for', { ascending: false });
      if (std) {
        const pos = std.findIndex((s: any) => s.club_id === clubId);
        if (pos >= 0) setStanding({ position: pos + 1, ...std[pos], total: std.length });
      }
    }

    // Next match
    const { data: nextMatches } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id, scheduled_at, status')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (nextMatches && nextMatches.length > 0) {
      const nm = nextMatches[0];
      const oppId = nm.home_club_id === clubId ? nm.away_club_id : nm.home_club_id;
      const { data: oppClub } = await supabase.from('clubs').select('name, short_name, primary_color, secondary_color, crest_url').eq('id', oppId).maybeSingle();
      setNextMatch({ ...nm, opponent: oppClub, isHome: nm.home_club_id === clubId });
    }

    // Recent results (last 5 finished matches)
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id, home_score, away_score, status')
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(5);

    if (recentMatches) {
      setRecentResults(recentMatches.map((m: any) => {
        const isHome = m.home_club_id === clubId;
        const myScore = isHome ? m.home_score : m.away_score;
        const oppScore = isHome ? m.away_score : m.home_score;
        const result = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
        return { ...m, result, myScore, oppScore };
      }));
    }

    setLoading(false);
  }

  async function handleLeaveClub() {
    if (!club || !managerProfile) return;
    setLeaving(true);
    try {
      // Release club to bot via server-side function (bypasses RLS + creates bot manager)
      const { error } = await supabase.rpc('release_club_to_bot', { p_club_id: club.id });
      if (error) throw error;

      await refreshManagerProfile();
      toast.success(t('toast.left'));
      navigate('/manager', { replace: true });
    } catch (err: any) {
      toast.error(err.message || t('toast.leave_error'));
    } finally {
      setLeaving(false);
      setLeaveOpen(false);
    }
  }

  function openEditDialog() {
    setEditName(club!.name);
    setEditShort(club!.short_name);
    setEditCity(club!.city || '');
    setEditPrimary(club!.primary_color);
    setEditSecondary(club!.secondary_color);
    setEditStadiumName(stadium?.name || '');
    setEditCrestUrl((club as any)!.crest_url || null);
    setEditOpen(true);
  }

  async function handleCrestUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !club) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('toast.image_too_big'));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      toast.error(t('toast.invalid_format'));
      return;
    }
    setCrestUploading(true);
    try {
      const path = `${club.id}/crest.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('club-crests')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('club-crests').getPublicUrl(path);
      setEditCrestUrl(`${pub.publicUrl}?v=${Date.now()}`);
      toast.success(t('toast.crest_uploaded'));
    } catch (err: any) {
      toast.error(err.message || t('toast.crest_error'));
    } finally {
      setCrestUploading(false);
    }
  }

  async function handleSaveEdit() {
    if (!club || !finance) return;
    const balance = Number(finance.balance ?? 0);
    if (balance < EDIT_COST) {
      toast.error(t('toast.insufficient_required', { cost: formatBRL(EDIT_COST) }));
      return;
    }
    setSaving(true);
    try {
      // Update club info
      const { error: clubErr } = await supabase.from('clubs').update({
        name: editName.trim(),
        short_name: editShort.trim().toUpperCase(),
        primary_color: editPrimary,
        secondary_color: editSecondary,
        city: editCity.trim() || null,
        crest_url: editCrestUrl,
      }).eq('id', club.id);
      if (clubErr) throw clubErr;

      // Update stadium name
      if (stadium && editStadiumName.trim() !== stadium.name) {
        await supabase.from('stadiums').update({ name: editStadiumName.trim() }).eq('id', stadium.id);
      }

      // Deduct cost
      await supabase.from('club_finances').update({
        balance: balance - EDIT_COST,
      }).eq('club_id', club.id);

      await refreshManagerProfile();
      toast.success(t('toast.saved', { cost: formatBRL(EDIT_COST) }));
      setEditOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || t('toast.save_error'));
    } finally {
      setSaving(false);
    }
  }

  if (!managerProfile) return null;

  if (!club) {
    return (
      <ManagerLayout>
        <div className="text-center py-12 space-y-3">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{t('no_club.message')}</p>
          <Link to="/league">
            <Button className="bg-tactical hover:bg-tactical/90 text-white">{t('no_club.see_league')}</Button>
          </Link>
        </div>
      </ManagerLayout>
    );
  }

  if (loading) {
    return (
      <ManagerLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ManagerLayout>
    );
  }

  const coachKey = (COACH_ICONS[managerProfile.coach_type] ? managerProfile.coach_type : 'all_around') as keyof typeof COACH_ICONS;
  const CoachIcon = COACH_ICONS[coachKey];
  const coachLabel = t(`coach_types.${coachKey}` as const);
  const balance = finance?.balance ?? 0;
  const weeklyRevenue = finance?.projected_income ?? 0;
  const weeklyExpense = (finance?.projected_expense ?? 0) + wageBill;
  const weeklyResult = weeklyRevenue - weeklyExpense;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <ManagerClubIntroTour enabled={!!club} />
        {/* Club header */}
        <div data-tour="manager-club-header" className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <ClubCrest
              crestUrl={(club as any).crest_url}
              primaryColor={club.primary_color}
              secondaryColor={club.secondary_color}
              shortName={club.short_name}
              className="w-20 h-20 rounded-xl text-2xl shadow-lg"
            />
            <div>
              <h1 className="font-display text-3xl font-bold">{club.name}</h1>
              <p className="text-muted-foreground text-sm">
                {club.short_name} {club.city && `• ${club.city}`}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <Badge variant="outline" className="text-xs">
                  <Star className="h-3 w-3 mr-1" /> {t('header.reputation', { value: club.reputation })}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <CoachIcon className="h-3 w-3 mr-1" /> {coachLabel}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {formation}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openEditDialog}
              className="text-xs"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> {t('header.edit_club')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeaveOpen(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> {t('header.leave_club')}
            </Button>
          </div>
        </div>

        {/* Top stats row */}
        <div data-tour="manager-club-shortcuts" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/manager/finance" className="stat-card hover:border-pitch/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" /> {t('stats.balance')}
            </div>
            <p className="font-display font-bold text-lg">{formatBRL(balance)}</p>
            <p className={`text-xs font-display ${weeklyResult >= 0 ? 'text-pitch' : 'text-destructive'}`}>
              {weeklyResult >= 0 ? '+' : ''}{t('stats.balance_per_week', { value: formatBRL(weeklyResult) })}
            </p>
          </Link>

          <Link to="/manager/squad" className="stat-card hover:border-pitch/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" /> {t('stats.squad')}
            </div>
            <p className="font-display font-bold text-lg">{t('stats.squad_count', { count: squadSize })}</p>
            <p className="text-xs text-muted-foreground">{t('stats.wage_bill', { value: formatBRL(wageBill) })}</p>
          </Link>

          <Link to="/manager/stadium" className="stat-card hover:border-pitch/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" /> {t('stats.stadium')}
            </div>
            <p className="font-display font-bold text-lg">{stadium?.name || '—'}</p>
            <p className="text-xs text-muted-foreground">
              {stadium ? t('stats.stadium_capacity', { capacity: stadium.capacity.toLocaleString(), quality: stadium.quality }) : '—'}
            </p>
          </Link>

          <Link to="/league" className="stat-card hover:border-pitch/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Trophy className="h-3.5 w-3.5" /> {t('stats.league')}
            </div>
            <p className="font-display font-bold text-lg">
              {standing ? t('stats.league_position', { position: standing.position }) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {standing ? t('stats.league_summary', { points: standing.points, played: standing.played }) : t('stats.no_data')}
            </p>
          </Link>
        </div>

        <div data-tour="manager-club-extras" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Manager & Identity */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-sm mb-3">{t('identity.title')}</h3>
            <div className="grid grid-cols-[auto_1fr] gap-4">
              {/* Full-body coach avatar on the left */}
              <div className="w-28 h-56 flex items-end justify-center bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg">
                <PlayerAvatar
                  appearance={(managerProfile as any).appearance ?? seededAppearance(managerProfile.id || managerProfile.full_name)}
                  variant="full-front"
                  playerName={managerProfile.full_name}
                  fallbackSeed={managerProfile.id || managerProfile.full_name}
                  outfit="coach"
                  className="w-full h-full"
                />
              </div>

              <div className="space-y-2 text-sm min-w-0">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('identity.manager')}</p>
                  <p className="font-display font-bold truncate">{managerProfile.full_name}</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('identity.coach_type')}</span>
                  <span className="font-bold flex items-center gap-1">
                    <CoachIcon className="h-3.5 w-3.5 text-tactical" /> {coachLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('identity.manager_rep')}</span>
                  <span className="font-display font-bold">{managerProfile.reputation}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('identity.club_rep')}</span>
                  <span className="font-display font-bold text-tactical">{club.reputation}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('identity.formation')}</span>
                  <span className="font-display font-bold">{formation}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('identity.colors')}</span>
                  <div className="flex gap-2">
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: club.primary_color }} />
                    <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: club.secondary_color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Facilities */}
          <div className="stat-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm">{t('facilities.title')}</h3>
              <Link to="/manager/facilities" className="text-xs text-tactical hover:underline flex items-center gap-0.5">
                {t('facilities.see')} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {facilities.map((f: any) => {
                const Icon = FACILITY_ICONS[f.facility_type];
                if (!Icon) return null;
                return (
                  <div key={f.facility_type} className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{t(`facility_labels.${f.facility_type}` as const)}</span>
                        <span className="font-display font-bold">{t('facilities.level', { level: f.level })}</span>
                      </div>
                      <Progress value={(f.level / (f.facility_type === 'stadium' ? 10 : 5)) * 100} className="h-1.5" />
                    </div>
                  </div>
                );
              })}
              {facilities.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('facilities.empty')}</p>
              )}
            </div>
          </div>

          {/* Next match */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">{t('next_match.title')}</h3>
            {nextMatch ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-bold">
                      {nextMatch.isHome ? t('next_match.home') : t('next_match.away')} {t('next_match.vs')} {nextMatch.opponent?.name || t('next_match.tbd')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(new Date(nextMatch.scheduled_at), lang, 'datetime_short')}
                    </p>
                  </div>
                </div>
                {nextMatch.opponent && (
                  <ClubCrest
                    crestUrl={nextMatch.opponent.crest_url}
                    primaryColor={nextMatch.opponent.primary_color}
                    secondaryColor={nextMatch.opponent.secondary_color}
                    shortName={nextMatch.opponent.short_name}
                    className="w-8 h-8 rounded text-[8px]"
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('next_match.empty')}</p>
            )}
          </div>

          {/* Recent results */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-sm">{t('recent_results.title')}</h3>
            {recentResults.length > 0 ? (
              <div className="flex gap-2">
                {recentResults.map((r: any) => {
                  const resultKey = r.result === 'V' ? 'win' : r.result === 'D' ? 'loss' : 'draw';
                  return (
                    <div
                      key={r.id}
                      className={`flex-1 text-center p-2 rounded text-xs font-display font-bold ${
                        r.result === 'V' ? 'bg-pitch/15 text-pitch' :
                        r.result === 'D' ? 'bg-destructive/15 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="text-lg">{t(`recent_results.${resultKey}` as const)}</div>
                      <div className="text-[10px] opacity-70">{r.myScore}-{r.oppScore}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('recent_results.empty')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit club dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{t('edit_dialog.title')}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="edit_dialog.description"
                values={{ cost: formatBRL(EDIT_COST) }}
                components={{ strong: <strong className="text-destructive" /> }}
              />
              {finance && Number(finance.balance) < EDIT_COST && (
                <span className="block mt-1 text-destructive font-semibold">
                  {t('edit_dialog.insufficient_balance', { balance: formatBRL(Number(finance.balance)) })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Badge preview */}
            <div className="flex justify-center">
              <ClubCrest
                crestUrl={editCrestUrl}
                primaryColor={editPrimary}
                secondaryColor={editSecondary}
                shortName={editShort.toUpperCase() || t('edit_dialog.short_placeholder')}
                className="h-16 w-16 rounded-lg text-xl"
              />
            </div>

            {/* Crest chooser */}
            <div className="space-y-2">
              <Label>{t('edit_dialog.crest_label')}</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditCrestUrl(null)}
                  title={t('edit_dialog.crest_default_title')}
                  className={`h-9 w-9 rounded border flex items-center justify-center text-[10px] font-display font-bold ${!editCrestUrl ? 'border-tactical bg-tactical/10 text-tactical' : 'border-border text-muted-foreground hover:border-tactical/40'}`}
                >
                  {t('edit_dialog.crest_default_letters')}
                </button>
                {CREST_EMOJI_PRESETS.map(e => {
                  const val = `emoji:${e}`;
                  const active = editCrestUrl === val;
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEditCrestUrl(val)}
                      className={`h-9 w-9 rounded border flex items-center justify-center text-lg ${active ? 'border-tactical bg-tactical/10' : 'border-border hover:border-tactical/40'}`}
                    >
                      {e}
                    </button>
                  );
                })}
                <label className={`h-9 px-2 rounded border flex items-center gap-1 text-xs cursor-pointer ${crestUploading ? 'opacity-60 pointer-events-none' : 'border-border hover:border-tactical/40'}`}>
                  {crestUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{t('edit_dialog.crest_upload')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleCrestUpload} />
                </label>
                {editCrestUrl && (
                  <button
                    type="button"
                    onClick={() => setEditCrestUrl(null)}
                    className="h-9 w-9 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    title={t('edit_dialog.crest_remove')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{t('edit_dialog.crest_help')}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('edit_dialog.name_label')}</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={40} />
            </div>

            <div className="space-y-2">
              <Label>{t('edit_dialog.short_label')}</Label>
              <Input value={editShort} onChange={e => setEditShort(e.target.value.slice(0, 3).toUpperCase())} maxLength={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('edit_dialog.primary_color_label')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      className={`h-6 w-6 rounded-full border-2 ${editPrimary === c ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditPrimary(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('edit_dialog.secondary_color_label')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {['#FFFFFF', '#000000', '#FFD700', '#FF6347', '#00FA9A', '#FF4500'].map(c => (
                    <button
                      key={c}
                      className={`h-6 w-6 rounded-full border-2 ${editSecondary === c ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditSecondary(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('edit_dialog.city_label')}</Label>
              <Input value={editCity} onChange={e => setEditCity(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('edit_dialog.stadium_name_label')}</Label>
              <Input value={editStadiumName} onChange={e => setEditStadiumName(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('edit_dialog.cancel')}</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editName.trim() || editShort.trim().length !== 3 || (finance && Number(finance.balance) < EDIT_COST)}
              className="bg-tactical hover:bg-tactical/90 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('edit_dialog.save', { cost: formatBRL(EDIT_COST) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave club dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">{t('leave_dialog.title')}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="leave_dialog.description"
                values={{ club: club.name }}
                components={{ strong: <strong /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>{t('leave_dialog.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={handleLeaveClub}
              disabled={leaving}
            >
              {leaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('leave_dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
