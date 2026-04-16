import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Swords, CalendarClock, Bot, User, Play, Radio, ChevronDown, RotateCcw, FlaskConical, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ClubCrest } from '@/components/ClubCrest';

interface MatchEntry {
  match_id: string;
  is_bot: boolean;
  match: {
    id: string; status: string; home_score: number; away_score: number;
    scheduled_at: string; started_at: string | null;
    home_club_id: string; away_club_id: string;
    current_phase: string | null; current_turn_number: number;
  };
  home_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
  away_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'bg-secondary text-secondary-foreground' },
  live: { label: '🔴 Ao Vivo', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  finished: { label: 'Encerrada', className: 'bg-muted text-muted-foreground border-border' },
};

export default function PlayerMatchesPage() {
  const { user, playerProfile } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating5v5, setCreating5v5] = useState(false);

  const loadMatches = useCallback(async () => {
    if (!user) return;

    // Method 1: Direct participation via match_participants
    const { data: parts } = await supabase.from('match_participants').select('match_id, is_bot').eq('connected_user_id', user.id).eq('role_type', 'player');
    const directMatchIds = [...new Set((parts || []).map(p => p.match_id))];

    // Method 2: Club's league matches (player may not be in match_participants yet)
    let clubMatchIds: string[] = [];
    if (playerProfile?.club_id) {
      const { data: clubMatches } = await supabase
        .from('matches')
        .select('id')
        .or(`home_club_id.eq.${playerProfile.club_id},away_club_id.eq.${playerProfile.club_id}`)
        .order('scheduled_at', { ascending: false })
        .limit(50);
      clubMatchIds = (clubMatches || []).map(m => m.id);
    }

    // Merge and deduplicate
    const allMatchIds = [...new Set([...directMatchIds, ...clubMatchIds])];
    if (allMatchIds.length === 0) { setLoading(false); return; }

    const { data: rawMatchData } = await supabase.from('matches')
      .select('id, status, home_score, away_score, scheduled_at, started_at, home_club_id, away_club_id, current_phase, current_turn_number, home_lineup_id, away_lineup_id')
      .in('id', allMatchIds).order('scheduled_at', { ascending: false });
    if (!rawMatchData) { setLoading(false); return; }
    // Filter out test matches (3x3 and bot-only with no lineups)
    const matchData = rawMatchData.filter((m: any) => m.home_lineup_id || m.away_lineup_id);
    const clubIds = [...new Set(matchData.flatMap(m => [m.home_club_id, m.away_club_id]))];
    const { data: clubData } = await supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').in('id', clubIds);
    const clubMap = new Map((clubData || []).map(c => [c.id, c]));
    const partMap = new Map((parts || []).map(p => [p.match_id, p]));
    setMatches(matchData.map(m => ({
      match_id: m.id, is_bot: partMap.get(m.id)?.is_bot ?? true, match: m,
      home_club: clubMap.get(m.home_club_id), away_club: clubMap.get(m.away_club_id),
    })));
    setLoading(false);
  }, [user, playerProfile]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const liveOrSoon = matches
    .filter(m => m.match.status === 'live' || (m.match.status === 'scheduled' && new Date(m.match.scheduled_at).getTime() - now <= oneHour))
    .sort((a, b) => new Date(a.match.scheduled_at).getTime() - new Date(b.match.scheduled_at).getTime());
  const upcoming = matches
    .filter(m => m.match.status === 'scheduled' && new Date(m.match.scheduled_at).getTime() - now > oneHour)
    .sort((a, b) => new Date(a.match.scheduled_at).getTime() - new Date(b.match.scheduled_at).getTime()); // nearest first
  const past = matches
    .filter(m => m.match.status === 'finished')
    .sort((a, b) => new Date(b.match.scheduled_at).getTime() - new Date(a.match.scheduled_at).getTime()); // most recent first

  const handleCreate5v5 = async () => {
    if (!user || !playerProfile) { toast.error('Perfil de jogador não encontrado'); return; }
    setCreating5v5(true);
    try {
      const clubId = playerProfile.club_id;
      // Pick a random bot-managed club as home (if player has no club) and as opponent
      const { data: botClubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('is_bot_managed', true)
        .limit(20);
      if (!botClubs || botClubs.length < 2) { toast.error('Times insuficientes disponíveis'); return; }
      const available = clubId ? botClubs.filter(c => c.id !== clubId) : botClubs;
      const homeClubId = clubId || available.splice(Math.floor(Math.random() * available.length), 1)[0].id;
      const opponentId = available[Math.floor(Math.random() * available.length)].id;

      // Create the match (5v5 test — no lineup IDs, engine treats as test match)
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: homeClubId,
        away_club_id: opponentId,
        home_lineup_id: null,
        away_lineup_id: null,
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 5000).toISOString(),
      }).select('id').single();
      if (matchError || !match) throw matchError || new Error('Falha ao criar partida');

      // Create 5 home participants: the human player + 4 bots
      const homeParticipants: any[] = [];

      // The human player as participant
      homeParticipants.push({
        match_id: match.id,
        player_profile_id: playerProfile.id,
        club_id: homeClubId,
        role_type: 'player',
        is_bot: false,
        is_ready: false,
        connected_user_id: user.id,
        pos_x: 5, pos_y: 50, // GK position or first position
      });

      // 4 bot teammates
      const botPositions = [
        { x: 25, y: 25 }, { x: 25, y: 75 },
        { x: 40, y: 35 }, { x: 40, y: 65 },
      ];
      for (const pos of botPositions) {
        homeParticipants.push({
          match_id: match.id,
          club_id: homeClubId,
          role_type: 'player',
          is_bot: true,
          is_ready: false,
          connected_user_id: null,
          pos_x: pos.x, pos_y: pos.y,
        });
      }

      // 5 away bots
      const awayPositions = [
        { x: 95, y: 50 },
        { x: 75, y: 25 }, { x: 75, y: 75 },
        { x: 60, y: 35 }, { x: 60, y: 65 },
      ];
      for (const pos of awayPositions) {
        homeParticipants.push({
          match_id: match.id,
          club_id: opponentId,
          role_type: 'player',
          is_bot: true,
          is_ready: false,
          connected_user_id: null,
          pos_x: pos.x, pos_y: pos.y,
        });
      }

      await supabase.from('match_participants').insert(homeParticipants);

      await supabase.from('match_event_logs').insert({
        match_id: match.id, event_type: 'system',
        title: '⚽ Teste 5v5',
        body: `Partida teste 5 contra 5 — você controla seu jogador!`,
      });

      toast.success('Teste 5v5 criado!');
      navigate(`/match/${match.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar teste 5v5');
    } finally {
      setCreating5v5(false);
    }
  };

  if (loading) return <AppLayout><div className="space-y-3">{[1,2,3].map(i => <div key={i} className="stat-card h-20 animate-pulse bg-muted" />)}</div></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-tactical" /> Minhas Partidas
          </h1>
          <Button size="sm" variant="outline" onClick={handleCreate5v5} disabled={creating5v5}
            className="font-display text-xs border-warning/40 text-warning hover:bg-warning/10">
            {creating5v5 ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />}
            {creating5v5 ? 'Criando...' : 'Teste 5v5'}
          </Button>
        </div>

        {matches.length === 0 && (
          <div className="stat-card text-center py-12">
            <Swords className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-display font-bold text-muted-foreground">Nenhuma partida ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Quando seu clube for escalado em uma partida, ela aparecerá aqui.</p>
          </div>
        )}

        {liveOrSoon.length > 0 && (
          <section>
            <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">🔴 Ao Vivo / Em Breve</h2>
            <div className="space-y-3">{liveOrSoon.map(e => <MatchCard key={e.match_id} entry={e} />)}</div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">Próximas Partidas</h2>
            <div className="space-y-3">{upcoming.map(e => <MatchCard key={e.match_id} entry={e} />)}</div>
          </section>
        )}

        {past.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide hover:text-foreground transition-colors">
              <ChevronDown className="h-4 w-4" /> Partidas Encerradas ({past.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3">{past.map(e => <MatchCard key={e.match_id} entry={e} />)}</div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </AppLayout>
  );
}

function MatchCard({ entry }: { entry: MatchEntry }) {
  const { match: m, home_club, away_club, is_bot } = entry;
  const statusInfo = STATUS_INFO[m.status] || { label: m.status, className: 'bg-muted text-muted-foreground' };
  const isLive = m.status === 'live';

  return (
    <div className={`stat-card space-y-3 ${isLive ? 'border-pitch/30' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ClubMini club={home_club} />
          <div className="text-center shrink-0">
            <div className="font-display text-lg font-extrabold">
              {m.status === 'finished' || isLive ? `${m.home_score} – ${m.away_score}` : <span className="text-muted-foreground text-sm">vs</span>}
            </div>
          </div>
          <ClubMini club={away_club} />
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${statusInfo.className}`}>{statusInfo.label}</Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            {format(new Date(m.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
          </div>
          {is_bot ? (
            <span className="flex items-center gap-1 text-xs text-amber-500"><Bot className="h-3 w-3" /> Bot</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-pitch"><User className="h-3 w-3" /> Você</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {m.status === 'finished' && (
            <Link to={`/match/${m.id}/replay`}>
              <Button size="sm" variant="outline" className="text-xs font-display">
                <RotateCcw className="h-3 w-3 mr-1" />Replay
              </Button>
            </Link>
          )}
          <Link to={`/match/${m.id}`}>
            <Button size="sm" variant={isLive ? 'default' : 'outline'}
              className={`text-xs font-display ${isLive ? 'bg-pitch text-pitch-foreground hover:bg-pitch/90' : ''}`}>
              {isLive ? <Radio className="h-3 w-3 mr-1 animate-pulse" /> : <Play className="h-3 w-3 mr-1" />}
              {isLive ? 'Entrar' : m.status === 'finished' ? 'Ver' : 'Acompanhar'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ClubMini({ club }: { club?: { name: string; short_name: string; primary_color: string; secondary_color: string; crest_url?: string | null } }) {
  if (!club) return <div className="w-8 h-8 rounded bg-muted animate-pulse shrink-0" />;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <ClubCrest crestUrl={club.crest_url} primaryColor={club.primary_color} secondaryColor={club.secondary_color} shortName={club.short_name} className="w-8 h-8 rounded text-xs shrink-0" />
      <span className="font-display font-bold text-sm truncate hidden sm:block">{club.name}</span>
    </div>
  );
}
