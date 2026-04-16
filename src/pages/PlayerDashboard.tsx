import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { EnergyBar } from '@/components/EnergyBar';
import { PositionBadge } from '@/components/PositionBadge';
import { ClubCrest } from '@/components/ClubCrest';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Zap, DollarSign, Star, Bell, Swords, CalendarClock, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getNotificationLink } from '@/lib/notificationLinks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/lib/formatting';

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'bg-secondary text-secondary-foreground' },
  waiting: { label: 'Aguardando', className: 'bg-warning/20 text-warning border-warning/30' },
  live: { label: '🔴 Ao Vivo', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  finished: { label: 'Encerrada', className: 'bg-muted text-muted-foreground' },
};

interface NextMatch {
  id: string;
  status: string;
  scheduled_at: string;
  home_club: { name: string; short_name: string; primary_color: string; secondary_color: string };
  away_club: { name: string; short_name: string; primary_color: string; secondary_color: string };
}

export default function PlayerDashboard() {
  const { user, playerProfile } = useAuth();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Tables<'contracts'> | null>(null);
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([]);
  const [attributes, setAttributes] = useState<Tables<'player_attributes'> | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null);

  useEffect(() => {
    if (!playerProfile) return;

    const fetchData = async () => {
      const [contractRes, notifRes, attrRes] = await Promise.all([
        supabase.from('contracts').select('*').eq('player_profile_id', playerProfile.id).order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('notifications').select('*').eq('user_id', user!.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).single(),
      ]);

      setContract(contractRes.data);
      setNotifications(notifRes.data || []);
      setAttributes(attrRes.data);

      if (playerProfile.club_id) {
        const { data: clubData } = await supabase.from('clubs').select('name').eq('id', playerProfile.club_id).single();
        setClubName(clubData?.name || null);
      } else {
        setClubName(null);
      }
    };

    const fetchNextMatch = async () => {
      if (!user) return;

      // Method 1: Direct participation via match_participants
      const { data: parts } = await supabase
        .from('match_participants')
        .select('match_id')
        .eq('connected_user_id', user.id)
        .eq('role_type', 'player');

      let directMatchIds = (parts || []).map(p => p.match_id);

      // Method 2: Club's scheduled league matches (player may not be in match_participants yet)
      let clubMatchIds: string[] = [];
      if (playerProfile.club_id) {
        const { data: clubMatches } = await supabase
          .from('matches')
          .select('id')
          .or(`home_club_id.eq.${playerProfile.club_id},away_club_id.eq.${playerProfile.club_id}`)
          .in('status', ['scheduled', 'waiting', 'live'])
          .order('scheduled_at', { ascending: true })
          .limit(5);
        clubMatchIds = (clubMatches || []).map(m => m.id);
      }

      // Merge and deduplicate
      const allMatchIds = [...new Set([...directMatchIds, ...clubMatchIds])];
      if (allMatchIds.length === 0) return;

      // Filter: only real matches (with lineups, not test/bot-only)
      const { data: allMatches } = await supabase
        .from('matches')
        .select('id, status, scheduled_at, home_club_id, away_club_id, home_lineup_id, away_lineup_id')
        .in('id', allMatchIds)
        .in('status', ['scheduled', 'waiting', 'live'])
        .order('scheduled_at', { ascending: true })
        .limit(5);
      const matchData = (allMatches || []).find((m: any) => m.home_lineup_id || m.away_lineup_id) || null;

      if (!matchData) return;

      const [homeRes, awayRes] = await Promise.all([
        supabase.from('clubs').select('name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.home_club_id).single(),
        supabase.from('clubs').select('name, short_name, primary_color, secondary_color, crest_url').eq('id', matchData.away_club_id).single(),
      ]);

      if (homeRes.data && awayRes.data) {
        setNextMatch({
          id: matchData.id,
          status: matchData.status,
          scheduled_at: matchData.scheduled_at,
          home_club: homeRes.data,
          away_club: awayRes.data,
        });
      }
    };

    fetchData();
    fetchNextMatch();
  }, [playerProfile, user]);

  if (!playerProfile) return null;

  const p = playerProfile;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">{p.full_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <PositionBadge position={p.primary_position} />
              {p.secondary_position && <PositionBadge position={p.secondary_position} />}
              <span className="text-sm text-muted-foreground">{p.archetype}</span>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{p.dominant_foot === 'right' ? 'Pé Direito' : 'Pé Esquerdo'}</span>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{p.age} anos</span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-display text-4xl font-extrabold text-tactical">{p.overall}</span>
            <p className="text-xs text-muted-foreground">OVR</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Reputação" value={p.reputation} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Dinheiro" value={formatBRL(p.money)} icon={<DollarSign className="h-5 w-5" />} />
          <StatCard label="Salario/Sem" value={contract?.status === 'active' ? formatBRL(contract.weekly_salary) : 'Sem contrato'} />
          <StatCard label="Clube" value={clubName || 'Sem clube'} subtitle={!p.club_id ? 'Agente Livre' : undefined} />
        </div>

        {/* Energy */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-warning" />
            <span className="font-display font-semibold text-sm">Estado Físico</span>
          </div>
          <EnergyBar current={p.energy_current} max={p.energy_max} />
          <p className="mt-2 text-xs text-muted-foreground">
            {p.energy_current >= 80 ? 'Pronto para jogar' : p.energy_current >= 50 ? 'Considere descansar' : 'Necessita recuperação'}
          </p>
        </div>

        {/* Next match */}
        {nextMatch ? (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Swords className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Próxima Partida</span>
              <Badge variant="outline" className={`text-xs ml-auto ${STATUS_INFO[nextMatch.status]?.className || ''}`}>
                {STATUS_INFO[nextMatch.status]?.label || nextMatch.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <ClubCrest crestUrl={(nextMatch.home_club as any).crest_url} primaryColor={nextMatch.home_club.primary_color} secondaryColor={nextMatch.home_club.secondary_color} shortName={nextMatch.home_club.short_name} className="w-8 h-8 rounded text-xs shrink-0" />
                <span className="font-display font-bold text-sm hidden sm:block truncate">{nextMatch.home_club.name}</span>
              </div>
              <span className="font-display font-bold text-muted-foreground shrink-0">vs</span>
              <div className="flex items-center gap-2 min-w-0">
                <ClubCrest crestUrl={(nextMatch.away_club as any).crest_url} primaryColor={nextMatch.away_club.primary_color} secondaryColor={nextMatch.away_club.secondary_color} shortName={nextMatch.away_club.short_name} className="w-8 h-8 rounded text-xs shrink-0" />
                <span className="font-display font-bold text-sm hidden sm:block truncate">{nextMatch.away_club.name}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="h-3 w-3" />
                {format(new Date(nextMatch.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
              <Link to={`/match/${nextMatch.id}`}>
                <Button size="sm" className="text-xs font-display bg-pitch text-pitch-foreground hover:bg-pitch/90">
                  <Play className="h-3 w-3 mr-1" />
                  {nextMatch.status === 'live' || nextMatch.status === 'waiting' ? 'Entrar na Partida' : 'Ver Partida'}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Swords className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Próxima Partida</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Nenhuma partida agendada.</p>
              <Link to="/player/matches" className="text-xs text-tactical hover:underline">
                Ver todas →
              </Link>
            </div>
          </div>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Notificações</span>
            </div>
            <div className="space-y-2">
              {notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={async () => {
                    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
                    navigate(getNotificationLink(n));
                  }}
                  className="w-full flex items-start gap-2 text-sm text-left hover:bg-muted/40 rounded-md px-1 py-1 -mx-1 transition-colors"
                >
                  <span className="h-2 w-2 rounded-full bg-tactical mt-1.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Attributes */}
        {attributes && (
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-semibold text-sm">Atributos Principais</span>
              <Link to="/player/attributes" className="text-xs text-tactical hover:underline">Ver todos →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: 'Velocidade', val: attributes.velocidade },
                { label: 'Controle', val: attributes.controle_bola },
                { label: 'Visão', val: attributes.visao_jogo },
                { label: 'Passe Baixo', val: attributes.passe_baixo },
              ].map(a => (
                <div key={a.label}>
                  <p className="font-display text-2xl font-bold text-foreground">{a.val}</p>
                  <p className="text-xs text-muted-foreground">{a.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
