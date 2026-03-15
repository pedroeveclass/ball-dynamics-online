import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Swords, CalendarClock, Bot, User, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MatchEntry {
  match_id: string;
  is_bot: boolean;
  is_ready: boolean;
  match: {
    id: string;
    status: string;
    home_score: number;
    away_score: number;
    scheduled_at: string;
    started_at: string | null;
    home_club_id: string;
    away_club_id: string;
    current_phase: string | null;
  };
  home_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
  away_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'bg-secondary text-secondary-foreground' },
  waiting: { label: 'Aguardando', className: 'bg-warning/20 text-warning border-warning/30' },
  live: { label: '🔴 Ao Vivo', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  finished: { label: 'Encerrada', className: 'bg-muted text-muted-foreground border-border' },
};

export default function PlayerMatchesPage() {
  const { user, playerProfile } = useAuth();
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(async () => {
    if (!user) return;

    // Get all match_participants for this user
    const { data: parts } = await supabase
      .from('match_participants')
      .select('match_id, is_bot, is_ready')
      .eq('connected_user_id', user.id)
      .eq('role_type', 'player');

    if (!parts || parts.length === 0) { setLoading(false); return; }

    const matchIds = [...new Set(parts.map(p => p.match_id))];

    // Fetch matches
    const { data: matchData } = await supabase
      .from('matches')
      .select('id, status, home_score, away_score, scheduled_at, started_at, home_club_id, away_club_id, current_phase')
      .in('id', matchIds)
      .order('scheduled_at', { ascending: false });

    if (!matchData) { setLoading(false); return; }

    // Fetch club info
    const clubIds = [...new Set(matchData.flatMap(m => [m.home_club_id, m.away_club_id]))];
    const { data: clubData } = await supabase
      .from('clubs')
      .select('id, name, short_name, primary_color, secondary_color')
      .in('id', clubIds);
    const clubMap = new Map((clubData || []).map(c => [c.id, c]));

    const partMap = new Map(parts.map(p => [p.match_id, p]));

    const enriched: MatchEntry[] = matchData.map(m => ({
      match_id: m.id,
      is_bot: partMap.get(m.id)?.is_bot ?? true,
      is_ready: partMap.get(m.id)?.is_ready ?? false,
      match: m,
      home_club: clubMap.get(m.home_club_id),
      away_club: clubMap.get(m.away_club_id),
    }));

    setMatches(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const liveMatches = matches.filter(m => m.match.status === 'live' || m.match.status === 'waiting');
  const upcomingMatches = matches.filter(m => m.match.status === 'scheduled');
  const pastMatches = matches.filter(m => m.match.status === 'finished');

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="stat-card h-20 animate-pulse bg-muted" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Swords className="h-6 w-6 text-tactical" /> Minhas Partidas
        </h1>

        {matches.length === 0 && (
          <div className="stat-card text-center py-12">
            <Swords className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-display font-bold text-muted-foreground">Nenhuma partida ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Quando seu clube for escalado em uma partida, ela aparecerá aqui.
            </p>
          </div>
        )}

        {liveMatches.length > 0 && (
          <MatchSection title="Ao Vivo / Aguardando" matches={liveMatches} />
        )}
        {upcomingMatches.length > 0 && (
          <MatchSection title="Próximas Partidas" matches={upcomingMatches} />
        )}
        {pastMatches.length > 0 && (
          <MatchSection title="Partidas Encerradas" matches={pastMatches} />
        )}
      </div>
    </AppLayout>
  );
}

function MatchSection({ title, matches }: { title: string; matches: MatchEntry[] }) {
  return (
    <section>
      <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
        {title}
      </h2>
      <div className="space-y-3">
        {matches.map(entry => (
          <MatchCard key={entry.match_id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function MatchCard({ entry }: { entry: MatchEntry }) {
  const { match: m, home_club, away_club, is_bot, is_ready } = entry;
  const statusInfo = STATUS_INFO[m.status] || { label: m.status, className: 'bg-muted text-muted-foreground' };
  const isLiveOrWaiting = m.status === 'live' || m.status === 'waiting';

  return (
    <div className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        {/* Clubs & Score */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ClubMini club={home_club} />
          <div className="text-center shrink-0">
            <div className="font-display text-lg font-extrabold">
              {m.status === 'finished' || m.status === 'live'
                ? `${m.home_score} – ${m.away_score}`
                : <span className="text-muted-foreground text-sm">vs</span>
              }
            </div>
          </div>
          <ClubMini club={away_club} />
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${statusInfo.className}`}>
          {statusInfo.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          {format(new Date(m.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>
        <div className="flex items-center gap-2">
          {is_bot ? (
            <span className="flex items-center gap-1 text-xs text-amber-500">
              <Bot className="h-3 w-3" /> Bot
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-pitch">
              <User className="h-3 w-3" /> {is_ready ? 'Pronto' : 'Aguardando'}
            </span>
          )}
          <Link to={`/match/${m.id}`}>
            <Button size="sm" className={`text-xs font-display ${isLiveOrWaiting ? 'bg-pitch text-pitch-foreground hover:bg-pitch/90' : ''}`}
              variant={isLiveOrWaiting ? 'default' : 'outline'}>
              <Play className="h-3 w-3 mr-1" />
              {isLiveOrWaiting ? 'Entrar' : 'Ver'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ClubMini({ club }: { club?: { name: string; short_name: string; primary_color: string; secondary_color: string } }) {
  if (!club) return <div className="w-8 h-8 rounded bg-muted animate-pulse" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="w-8 h-8 rounded flex items-center justify-center font-display text-xs font-bold shrink-0"
        style={{ backgroundColor: club.primary_color, color: club.secondary_color }}
      >
        {club.short_name}
      </div>
      <span className="font-display font-bold text-sm truncate hidden sm:block">{club.name}</span>
    </div>
  );
}
