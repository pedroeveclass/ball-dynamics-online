import { useEffect, useState, useCallback } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Swords, Clock, CheckCircle2, XCircle, Ban, Send, Plus, CalendarClock, FlaskConical, AlertCircle, Bot, Trophy, RotateCcw, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { FORMATION_POSITIONS, getFormationPositions } from '@/lib/formations';
import { ptBR } from 'date-fns/locale';

interface Challenge {
  id: string;
  challenger_club_id: string;
  challenged_club_id: string;
  challenger_manager_profile_id: string;
  challenged_manager_profile_id: string | null;
  scheduled_at: string;
  message: string | null;
  status: string;
  match_id: string | null;
  created_at: string;
  challenger_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
  challenged_club?: { name: string; short_name: string; primary_color: string; secondary_color: string };
}

interface ClubOption {
  id: string; name: string; short_name: string; primary_color: string; secondary_color: string; reputation: number;
}

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  proposed: { label: 'Aguardando', className: 'bg-warning/20 text-warning border-warning/30' },
  accepted: { label: 'Aceito', className: 'bg-pitch/20 text-pitch border-pitch/30' },
  rejected: { label: 'Recusado', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: 'Expirado', className: 'bg-muted text-muted-foreground border-border' },
};

export default function ManagerChallengesPage() {
  const { club, managerProfile } = useAuth();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [creatingTarget, setCreatingTarget] = useState<'match' | 'lab' | null>(null);

  // Inline challenge creation
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [awayClubId, setAwayClubId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasLineup, setHasLineup] = useState(false);

  // 3x3 challenge state
  const [matchType, setMatchType] = useState<'11x11' | '5x5'>('11x11');
  const [squad3v3, setSquad3v3] = useState<{ id: string; full_name: string; primary_position: string; overall: number }[]>([]);
  const [selected3v3, setSelected3v3] = useState<string[]>(['', '', '', '', '']);
  // Accept 3x3 dialog state
  const [accept3v3Challenge, setAccept3v3Challenge] = useState<Challenge | null>(null);
  const [accept3v3Selected, setAccept3v3Selected] = useState<string[]>(['', '', '', '', '']);
  const [accept3v3Squad, setAccept3v3Squad] = useState<{ id: string; full_name: string; primary_position: string; overall: number }[]>([]);

  // League matches
  const [leagueMatches, setLeagueMatches] = useState<any[]>([]);
  const [leagueFilter, setLeagueFilter] = useState<'upcoming' | 'finished' | 'all'>('upcoming');

  const loadLeagueMatches = useCallback(async () => {
    if (!club) return;
    try {
      // Load ALL league matches for this club (no limit)
      const { data } = await supabase
        .from('matches')
        .select('id, status, scheduled_at, home_score, away_score, home_club_id, away_club_id, home_club:clubs!matches_home_club_id_fkey(name, short_name, primary_color, secondary_color), away_club:clubs!matches_away_club_id_fkey(name, short_name, primary_color, secondary_color)')
        .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
        .in('status', ['scheduled', 'live', 'finished'])
        .order('scheduled_at', { ascending: true });
      // Filter to league matches (those linked in league_matches)
      if (data && data.length > 0) {
        const matchIds = data.map(m => m.id);
        const { data: leagueLinks } = await supabase
          .from('league_matches')
          .select('match_id')
          .in('match_id', matchIds);
        const leagueMatchIds = new Set((leagueLinks || []).map(l => l.match_id));
        setLeagueMatches(data.filter(m => leagueMatchIds.has(m.id)));
      }
    } catch { /* ignore */ }
  }, [club]);

  const loadChallenges = useCallback(async () => {
    if (!club) return;
    const { data } = await supabase.from('match_challenges').select('*').order('created_at', { ascending: false });
    if (!data) { setLoading(false); return; }
    const clubIds = [...new Set(data.flatMap(c => [c.challenger_club_id, c.challenged_club_id]))];
    const { data: clubsData } = await supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color').in('id', clubIds);
    const clubMap = new Map((clubsData || []).map(c => [c.id, c]));
    setChallenges(data.map(c => ({ ...c, challenger_club: clubMap.get(c.challenger_club_id), challenged_club: clubMap.get(c.challenged_club_id) })));
    setLoading(false);
  }, [club]);

  useEffect(() => { loadChallenges(); loadLeagueMatches(); }, [loadChallenges, loadLeagueMatches]);

  const fetchClubPlayers = async (clubId: string) => {
    const { data: contracts } = await supabase.from('contracts').select('player_profile_id').eq('club_id', clubId).eq('status', 'active');
    if (!contracts?.length) return [];
    const playerIds = contracts.map(c => c.player_profile_id);
    const { data: players } = await supabase.from('player_profiles').select('id, full_name, primary_position, overall').in('id', playerIds);
    return players || [];
  };

  const openCreateDialog = async () => {
    if (!club) return;
    const [clubsRes, lineupRes] = await Promise.all([
      supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, reputation').neq('id', club.id),
      supabase.from('lineups').select('id').eq('club_id', club.id).eq('is_active', true).limit(1),
    ]);
    setClubs(clubsRes.data || []);
    setHasLineup((lineupRes.data || []).length > 0);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(20, 0, 0, 0);
    setScheduledAt(tomorrow.toISOString().slice(0, 16));
    setAwayClubId(''); setMessage('');
    setMatchType('11x11');
    setSelected3v3(['', '', '', '', '']);
    const players = await fetchClubPlayers(club.id);
    setSquad3v3(players);
    setShowCreateDialog(true);
  };

  const handleSendChallenge = async () => {
    if (!club || !awayClubId || !scheduledAt || !managerProfile) return;
    if (matchType === '5x5' && selected3v3.some(id => !id)) { toast.error('Selecione 5 jogadores para o modo 5x5.'); return; }
    if (matchType === '5x5' && new Set(selected3v3).size !== 5) { toast.error('Selecione 5 jogadores diferentes.'); return; }
    setSending(true);
    try {
      const { data: awayClubData } = await supabase.from('clubs').select('manager_profile_id').eq('id', awayClubId).single();
      if (!awayClubData?.manager_profile_id) { toast.error('Clube adversário sem manager.'); setSending(false); return; }
      const { data: awayMgrData } = await supabase.from('manager_profiles').select('user_id').eq('id', awayClubData.manager_profile_id).single();

      let finalMessage = message.trim();
      if (matchType === '5x5') {
        finalMessage = `[5x5:${selected3v3.join(',')}] ${finalMessage}`.trim();
      }

      await supabase.from('match_challenges').insert({
        challenger_club_id: club.id, challenged_club_id: awayClubId,
        challenger_manager_profile_id: managerProfile.id,
        challenged_manager_profile_id: awayClubData.manager_profile_id,
        scheduled_at: new Date(scheduledAt).toISOString(),
        message: finalMessage || null, status: 'proposed',
      });

      if (awayMgrData?.user_id) {
        await supabase.from('notifications').insert({
          user_id: awayMgrData.user_id, title: '⚔️ Convite de Amistoso',
          body: `${club.name} quer jogar um amistoso contra você em ${new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
          type: 'match',
        });
      }

      toast.success('Convite enviado!');
      setShowCreateDialog(false);
      loadChallenges();
    } catch (err: any) { toast.error(err.message || 'Erro ao enviar convite'); }
    finally { setSending(false); }
  };

  const FRIENDLY_3V3_COORDS: Array<{ x: number; y: number; pos: 'GK' | 'CB' | 'ST' }> = [
    { x: 5, y: 50, pos: 'GK' },
    { x: 25, y: 50, pos: 'CB' },
    { x: 45, y: 50, pos: 'ST' },
  ];

  const getFriendlySlotRole = (slotPosition?: string | null): 'GK' | 'CB' | 'ST' | null => {
    if (!slotPosition) return null;
    if (slotPosition === 'GK') return 'GK';
    if (slotPosition.startsWith('CB')) return 'CB';
    if (slotPosition.startsWith('ST')) return 'ST';
    return null;
  };

  const pickFriendlySlots = <T extends { id: string; slot_position: string | null }>(clubSlots: T[]) => {
    const picked: T[] = [];
    const usedSlotIds = new Set<string>();

    for (const targetRole of ['GK', 'CB', 'CB', 'CM', 'ST'] as const) {
      const match = clubSlots.find(slot =>
        !usedSlotIds.has(slot.id) && getFriendlySlotRole(slot.slot_position) === targetRole,
      );
      if (!match) continue;
      picked.push(match);
      usedSlotIds.add(match.id);
    }

    return picked;
  };

  const parse3v3Message = (msg: string | null): { is3v3: boolean; playerIds: string[]; cleanMessage: string } => {
    if (!msg) return { is3v3: false, playerIds: [], cleanMessage: '' };
    const match = msg.match(/^\[5x5:([a-f0-9-,]+)\]\s*(.*)/);
    if (!match) return { is3v3: false, playerIds: [], cleanMessage: msg };
    return { is3v3: true, playerIds: match[1].split(','), cleanMessage: match[2] };
  };

  const handleAccept = async (challenge: Challenge) => {
    if (!club || !managerProfile) return;
    const parsed = parse3v3Message(challenge.message);
    if (parsed.is3v3) {
      // Show 3x3 accept dialog for the defender to pick their players
      const players = await fetchClubPlayers(club.id);
      setAccept3v3Squad(players);
      setAccept3v3Selected(['', '', '', '', '']);
      setAccept3v3Challenge(challenge);
      return;
    }
    await doAccept(challenge);
  };

  const doAccept3v3 = async () => {
    if (!accept3v3Challenge || !club || !managerProfile) return;
    if (accept3v3Selected.some(id => !id)) { toast.error('Selecione 5 jogadores.'); return; }
    if (new Set(accept3v3Selected).size !== 5) { toast.error('Selecione 5 jogadores diferentes.'); return; }
    const challenge = accept3v3Challenge;
    setAccept3v3Challenge(null);
    setActing(challenge.id);
    try {
      const parsed = parse3v3Message(challenge.message);
      const challengerPlayerIds = parsed.playerIds;
      const accepterPlayerIds = accept3v3Selected;

      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: challenge.challenger_club_id, away_club_id: challenge.challenged_club_id,
        status: 'scheduled', current_phase: 'pre_match', scheduled_at: challenge.scheduled_at,
      }).select('id').single();
      if (matchError) throw matchError;

      // Fetch player user mappings
      const allPlayerIds = [...challengerPlayerIds, ...accepterPlayerIds];
      const { data: players } = await supabase.from('player_profiles').select('id, user_id').in('id', allPlayerIds);
      const playerUserMap = new Map((players || []).map(p => [p.id, p.user_id]));

      const roles: Array<'GK' | 'CB' | 'ST'> = ['GK', 'CB', 'ST'];
      const homeParticipants = challengerPlayerIds.map((pid, i) => {
        const coords = FRIENDLY_3V3_COORDS[i];
        const userId = playerUserMap.get(pid) || null;
        return { match_id: match!.id, player_profile_id: pid, club_id: challenge.challenger_club_id, role_type: 'player', is_bot: !userId, is_ready: false, connected_user_id: userId, pos_x: coords.x, pos_y: coords.y };
      });
      const awayParticipants = accepterPlayerIds.map((pid, i) => {
        const coords = FRIENDLY_3V3_COORDS[i];
        const userId = playerUserMap.get(pid) || null;
        return { match_id: match!.id, player_profile_id: pid, club_id: challenge.challenged_club_id, role_type: 'player', is_bot: !userId, is_ready: false, connected_user_id: userId, pos_x: 100 - coords.x, pos_y: coords.y };
      });

      await supabase.from('match_participants').insert([...homeParticipants, ...awayParticipants]);

      // Manager participants
      const { data: challengerMgr } = await supabase.from('manager_profiles').select('user_id').eq('id', challenge.challenger_manager_profile_id).single();
      const managerParticipants: any[] = [];
      if (challengerMgr?.user_id) managerParticipants.push({ match_id: match!.id, club_id: challenge.challenger_club_id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: challengerMgr.user_id });
      managerParticipants.push({ match_id: match!.id, club_id: challenge.challenged_club_id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: (await supabase.auth.getUser()).data.user?.id || null });
      await supabase.from('match_participants').insert(managerParticipants);

      await supabase.from('match_event_logs').insert({ match_id: match!.id, event_type: 'system', title: '⚔️ Amistoso 5x5 agendado', body: `${challenge.challenger_club?.name} vs ${challenge.challenged_club?.name}` });
      await supabase.from('match_challenges').update({ status: 'accepted', match_id: match!.id }).eq('id', challenge.id);

      if (challengerMgr?.user_id) {
        await supabase.from('notifications').insert({ user_id: challengerMgr.user_id, title: '✅ Convite aceito!', body: `${challenge.challenged_club?.name} aceitou o amistoso 5x5.`, type: 'match' });
      }
      toast.success('Amistoso 5x5 aceito!');
      loadChallenges();
    } catch (err: any) { toast.error(err.message || 'Erro ao aceitar 5x5'); }
    finally { setActing(null); }
  };

  const doAccept = async (challenge: Challenge) => {
    if (!club || !managerProfile) return;
    setActing(challenge.id);
    try {
      // Try to get active lineups — if missing, we'll use null and fill with bots
      const [homeLineupRes, awayLineupRes] = await Promise.all([
        supabase.from('lineups').select('id').eq('club_id', challenge.challenger_club_id).eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('lineups').select('id').eq('club_id', challenge.challenged_club_id).eq('is_active', true).limit(1).maybeSingle(),
      ]);

      const homeLineupId = homeLineupRes.data?.id || null;
      const awayLineupId = awayLineupRes.data?.id || null;

      // Schedule 5s in future so engine doesn't pick up before participants are inserted
      const safeScheduledAt = new Date(Math.max(new Date(challenge.scheduled_at).getTime(), Date.now() + 5000)).toISOString();
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: challenge.challenger_club_id, away_club_id: challenge.challenged_club_id,
        home_lineup_id: homeLineupId, away_lineup_id: awayLineupId,
        status: 'scheduled', current_phase: 'pre_match', scheduled_at: safeScheduledAt,
      }).select('id').single();
      if (matchError) throw matchError;

      // Load ALL slots (starters + bench) for both teams
      const allLineupIds = [homeLineupId, awayLineupId].filter(Boolean) as string[];
      const { data: allSlots } = allLineupIds.length > 0
        ? await supabase.from('lineup_slots')
            .select('id, lineup_id, player_profile_id, slot_position, role_type, sort_order')
            .in('lineup_id', allLineupIds)
        : { data: [] };

      const allSlotsArr = allSlots || [];
      const playerIds = allSlotsArr.filter(s => s.player_profile_id).map(s => s.player_profile_id!);
      const { data: players } = playerIds.length > 0 ? await supabase.from('player_profiles').select('id, user_id').in('id', playerIds) : { data: [] };
      const playerUserMap = new Map((players || []).map(p => [p.id, p.user_id]));

      // Get formations for position placement
      const [{ data: homeLineupData }, { data: awayLineupData }] = await Promise.all([
        homeLineupId ? supabase.from('lineups').select('formation').eq('id', homeLineupId).maybeSingle() : Promise.resolve({ data: null }),
        awayLineupId ? supabase.from('lineups').select('formation').eq('id', awayLineupId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const homeFormation = homeLineupData?.formation || '4-4-2';
      const awayFormation = awayLineupData?.formation || '4-4-2';
      const homeFormPositions = getFormationPositions(homeFormation, true);
      const awayFormPositions = getFormationPositions(awayFormation, false);

      // Create participants from ALL lineup slots
      const allParticipants: any[] = [];

      const createTeamParticipants = (
        teamSlots: typeof allSlotsArr, clubId: string, isHome: boolean, formPositions: Array<{ x: number; y: number; pos: string }>
      ) => {
        const starters = teamSlots.filter(s => s.role_type === 'starter').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const bench = teamSlots.filter(s => s.role_type === 'bench');
        const usedPosIndices = new Set<number>();

        // Starters: place on field with formation positions
        for (const slot of starters) {
          const userId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
          const slotPos = (slot.slot_position || '').replace(/[0-9]/g, '').toUpperCase();

          // Match to formation position
          let fPos = { x: isHome ? 30 : 70, y: 50 };
          for (let fi = 0; fi < formPositions.length; fi++) {
            if (!usedPosIndices.has(fi) && formPositions[fi].pos.toUpperCase() === slotPos) {
              fPos = formPositions[fi]; usedPosIndices.add(fi); break;
            }
          }
          if (fPos.x === (isHome ? 30 : 70) && fPos.y === 50) {
            for (let fi = 0; fi < formPositions.length; fi++) {
              if (!usedPosIndices.has(fi)) { fPos = formPositions[fi]; usedPosIndices.add(fi); break; }
            }
          }

          allParticipants.push({
            match_id: match!.id, player_profile_id: slot.player_profile_id || null,
            club_id: clubId, lineup_slot_id: slot.id, role_type: 'player',
            is_bot: !userId, is_ready: false, connected_user_id: userId || null,
            pos_x: fPos.x, pos_y: fPos.y,
          });
        }

        // Bench: off-field participants
        for (const slot of bench) {
          const userId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
          allParticipants.push({
            match_id: match!.id, player_profile_id: slot.player_profile_id || null,
            club_id: clubId, lineup_slot_id: slot.id, role_type: 'bench',
            is_bot: !userId, is_ready: false, connected_user_id: userId || null,
            pos_x: null, pos_y: null,
          });
        }
      };

      const homeSlots = homeLineupId ? allSlotsArr.filter(s => s.lineup_id === homeLineupId) : [];
      const awaySlots = awayLineupId ? allSlotsArr.filter(s => s.lineup_id === awayLineupId) : [];
      createTeamParticipants(homeSlots, challenge.challenger_club_id, true, homeFormPositions);
      createTeamParticipants(awaySlots, challenge.challenged_club_id, false, awayFormPositions);

      // Engine will fill remaining bots to reach 11 per team
      if (allParticipants.length > 0) await supabase.from('match_participants').insert(allParticipants);

      const { data: challengerMgr } = await supabase.from('manager_profiles').select('user_id').eq('id', challenge.challenger_manager_profile_id).single();
      const managerParticipants: any[] = [];
      if (challengerMgr?.user_id) managerParticipants.push({ match_id: match!.id, club_id: challenge.challenger_club_id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: challengerMgr.user_id });
      managerParticipants.push({ match_id: match!.id, club_id: challenge.challenged_club_id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: (await supabase.auth.getUser()).data.user?.id || null });
      await supabase.from('match_participants').insert(managerParticipants);

      await supabase.from('match_event_logs').insert({ match_id: match!.id, event_type: 'system', title: '⚔️ Amistoso agendado', body: `${challenge.challenger_club?.name} vs ${challenge.challenged_club?.name}` });
      await supabase.from('match_challenges').update({ status: 'accepted', match_id: match!.id }).eq('id', challenge.id);

      if (challengerMgr?.user_id) {
        await supabase.from('notifications').insert({ user_id: challengerMgr.user_id, title: '✅ Convite aceito!', body: `${challenge.challenged_club?.name} aceitou o amistoso.`, type: 'match' });
      }
      toast.success('Amistoso aceito!');
      loadChallenges();
    } catch (err: any) { toast.error(err.message || 'Erro ao aceitar'); }
    finally { setActing(null); }
  };

  const handleReject = async (c: Challenge) => {
    setActing(c.id);
    try {
      await supabase.from('match_challenges').update({ status: 'rejected' }).eq('id', c.id);
      const { data: mgr } = await supabase.from('manager_profiles').select('user_id').eq('id', c.challenger_manager_profile_id).single();
      if (mgr?.user_id) await supabase.from('notifications').insert({ user_id: mgr.user_id, title: '❌ Convite recusado', body: `${c.challenged_club?.name} recusou o amistoso.`, type: 'match' });
      toast.success('Convite recusado.');
      loadChallenges();
    } catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setActing(null); }
  };

  const handleCancel = async (c: Challenge) => {
    setActing(c.id);
    try { await supabase.from('match_challenges').update({ status: 'cancelled' }).eq('id', c.id); toast.success('Cancelado.'); loadChallenges(); }
    catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setActing(null); }
  };

  const handleCreateTestMatch = async (target: 'match' | 'lab') => {
    if (!club || !managerProfile) return;
    setCreatingTarget(target);
    try {
      const { data: otherClubs } = await supabase.from('clubs').select('id').neq('id', club.id);
      if (!otherClubs?.length) { toast.error('Nenhum clube adversário encontrado.'); return; }
      const opponentId = otherClubs[Math.floor(Math.random() * otherClubs.length)].id;
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: club.id, away_club_id: opponentId, status: 'scheduled', scheduled_at: new Date().toISOString(), current_phase: 'pre_match',
      }).select('id').single();
      if (matchError || !match) throw matchError || new Error('Falha');
      const userId = (await supabase.auth.getUser()).data.user?.id;
      // 5v5 test: GK + 2CB + CM + ST per team
      const testHome = [{ x: 5, y: 50 }, { x: 22, y: 35 }, { x: 22, y: 65 }, { x: 38, y: 50 }, { x: 45, y: 50 }];
      const testAway = testHome.map(p => ({ x: 100 - p.x, y: p.y }));
      await supabase.from('match_participants').insert([
        ...testHome.map(p => ({ match_id: match.id, club_id: club.id, role_type: 'player', is_bot: true, is_ready: false, pos_x: p.x, pos_y: p.y })),
        ...testAway.map(p => ({ match_id: match.id, club_id: opponentId, role_type: 'player', is_bot: true, is_ready: false, pos_x: p.x, pos_y: p.y })),
        { match_id: match.id, club_id: club.id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: userId },
      ]);
      await supabase.from('match_event_logs').insert({ match_id: match.id, event_type: 'system', title: '🧪 Partida de teste criada', body: '5v5 — GK + 4 jogadores vs GK + 4 jogadores' });
      if (target === 'lab') { toast.success('Laboratório criado!'); navigate(`/match-lab/${match.id}`); }
      else { toast.success('Partida de teste criada!'); navigate(`/match/${match.id}`); }
    } catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setCreatingTarget(null); }
  };

  const [creatingBotMatch, setCreatingBotMatch] = useState(false);

  const handleCreateBotFriendly = async () => {
    if (!club || !managerProfile) return;
    setCreatingBotMatch(true);
    try {
      // Pick a random opponent club for the bot team
      const { data: otherClubs } = await supabase.from('clubs').select('id').neq('id', club.id);
      if (!otherClubs?.length) { toast.error('Nenhum clube adversário encontrado.'); return; }
      const opponentId = otherClubs[Math.floor(Math.random() * otherClubs.length)].id;

      // Get active lineup for user's club
      const { data: activeLineup } = await supabase.from('lineups')
        .select('id, formation').eq('club_id', club.id).eq('is_active', true).limit(1).maybeSingle();

      const homeLineupId = activeLineup?.id || null;
      const formation = activeLineup?.formation || '4-4-2';

      // Schedule 5s in future so engine doesn't pick up before participants are inserted
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: club.id, away_club_id: opponentId,
        home_lineup_id: homeLineupId, away_lineup_id: null,
        status: 'scheduled', scheduled_at: new Date(Date.now() + 5000).toISOString(), current_phase: 'pre_match',
      }).select('id').single();
      if (matchError || !match) throw matchError || new Error('Falha ao criar partida');

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const participantsToInsert: any[] = [];

      // Load lineup slots if lineup exists
      if (homeLineupId) {
        const { data: slots } = await supabase.from('lineup_slots')
          .select('id, player_profile_id, slot_position, role_type')
          .eq('lineup_id', homeLineupId);

        const allSlots = slots || [];
        const starterSlots = allSlots.filter(s => s.role_type === 'starter');
        const benchSlots = allSlots.filter(s => s.role_type === 'bench');
        const playerIds = allSlots.filter(s => s.player_profile_id).map(s => s.player_profile_id!);
        const { data: players } = playerIds.length > 0
          ? await supabase.from('player_profiles').select('id, user_id').in('id', playerIds)
          : { data: [] };
        const playerUserMap = new Map((players || []).map(p => [p.id, p.user_id]));

        // Get formation positions for initial placement — match by slot position
        const formPositions = getFormationPositions(formation, true);
        const usedPosIndices = new Set<number>();

        for (const slot of starterSlots) {
          const pUserId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
          const slotPos = (slot.slot_position || '').replace(/[0-9]/g, '').toUpperCase();

          // Find matching formation position
          let fPos = { x: 30, y: 50 };
          for (let fi = 0; fi < formPositions.length; fi++) {
            if (!usedPosIndices.has(fi) && formPositions[fi].pos.toUpperCase() === slotPos) {
              fPos = formPositions[fi];
              usedPosIndices.add(fi);
              break;
            }
          }
          // Fallback: first unused position
          if (fPos.x === 30 && fPos.y === 50) {
            for (let fi = 0; fi < formPositions.length; fi++) {
              if (!usedPosIndices.has(fi)) {
                fPos = formPositions[fi];
                usedPosIndices.add(fi);
                break;
              }
            }
          }

          participantsToInsert.push({
            match_id: match.id, player_profile_id: slot.player_profile_id || null,
            club_id: club.id, lineup_slot_id: slot.id, role_type: 'player',
            is_bot: !pUserId, is_ready: false, connected_user_id: pUserId || null,
            pos_x: fPos.x, pos_y: fPos.y,
          });
        }

        // Add bench players (no field position)
        for (const slot of benchSlots) {
          const pUserId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
          participantsToInsert.push({
            match_id: match.id, player_profile_id: slot.player_profile_id || null,
            club_id: club.id, lineup_slot_id: slot.id, role_type: 'bench',
            is_bot: !pUserId, is_ready: false, connected_user_id: pUserId || null,
            pos_x: null, pos_y: null,
          });
        }
      }

      // The engine's ensureEleven will fill remaining spots for both teams with bots
      // Add manager participant
      participantsToInsert.push({
        match_id: match.id, club_id: club.id, role_type: 'manager',
        is_bot: false, is_ready: false, connected_user_id: userId,
      });

      if (participantsToInsert.length > 0) {
        await supabase.from('match_participants').insert(participantsToInsert);
      }

      await supabase.from('match_event_logs').insert({
        match_id: match.id, event_type: 'system',
        title: '⚽ Amistoso x BOT',
        body: `${club.name} (${formation}) vs BOT 11x11`,
      });

      toast.success('Amistoso contra BOTs criado!');
      navigate(`/match/${match.id}`);
    } catch (err: any) { toast.error(err.message || 'Erro ao criar amistoso'); }
    finally { setCreatingBotMatch(false); }
  };

  const received = challenges.filter(c => c.challenged_club_id === club?.id);
  const sent = challenges.filter(c => c.challenger_club_id === club?.id);

  if (loading) return <ManagerLayout><p className="text-muted-foreground">Carregando...</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-tactical" /> Jogos
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => navigate('/match-lab/solo')} className="font-display text-xs border-tactical/40 text-tactical hover:bg-tactical/10">
              <FlaskConical className="h-4 w-4 mr-1" /> Lab Solo
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleCreateTestMatch('match')} disabled={creatingTarget !== null} className="font-display text-xs border-warning/40 text-warning hover:bg-warning/10">
              <FlaskConical className="h-4 w-4 mr-1" /> {creatingTarget === 'match' ? 'Criando...' : 'Teste 5v5'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCreateBotFriendly} disabled={creatingBotMatch} className="font-display text-xs border-pitch/40 text-pitch hover:bg-pitch/10">
              <Bot className="h-4 w-4 mr-1" /> {creatingBotMatch ? 'Criando...' : 'Amistoso x BOT'}
            </Button>
            <Button size="sm" onClick={openCreateDialog} className="bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
              <Plus className="h-4 w-4 mr-1" /> Enviar Convite
            </Button>
          </div>
        </div>

        {/* League Matches Section */}
        {leagueMatches.length > 0 && (
          <Collapsible defaultOpen>
            <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <CollapsibleTrigger className="flex items-center gap-2 font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                <ChevronDown className="h-4 w-4" />
                <Trophy className="h-4 w-4 text-amber-400" /> Jogos da Liga ({leagueMatches.length})
              </CollapsibleTrigger>
              <div className="flex gap-1">
                {(['upcoming', 'finished', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setLeagueFilter(f)}
                    className={`text-[10px] font-display px-2 py-0.5 rounded transition-colors ${leagueFilter === f ? 'bg-tactical text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    {f === 'upcoming' ? 'Próximos' : f === 'finished' ? 'Encerrados' : 'Todos'}
                  </button>
                ))}
              </div>
            </div>
            <CollapsibleContent>
            <div className="space-y-2">
              {leagueMatches
                .filter(m => {
                  if (leagueFilter === 'upcoming') return m.status === 'scheduled' || m.status === 'live';
                  if (leagueFilter === 'finished') return m.status === 'finished';
                  return true;
                })
                .sort((a, b) => {
                  // Upcoming: closest first (ascending). Finished: most recent first (descending)
                  if (leagueFilter === 'finished') return new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime();
                  return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
                })
                .map((m: any) => {
                const isHome = m.home_club_id === club?.id;
                const opponent = isHome ? m.away_club : m.home_club;
                const isLive = m.status === 'live';
                const isFinished = m.status === 'finished';
                const scheduledDate = new Date(m.scheduled_at);
                return (
                  <div key={m.id} className="stat-card flex items-center justify-between hover:border-tactical/40 transition-colors">
                    <Link to={`/match/${m.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded flex items-center justify-center text-[8px] font-bold shrink-0" style={{ backgroundColor: opponent?.primary_color, color: opponent?.secondary_color }}>
                        {opponent?.short_name}
                      </div>
                      <div>
                        <p className="font-display font-semibold text-sm">
                          {isHome ? 'vs' : '@'} {opponent?.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isFinished ? 'Encerrado' : isLive ? 'AO VIVO' : format(scheduledDate, 'dd/MM HH:mm')}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      {(isLive || isFinished) ? (
                        <span className={`font-display font-bold text-lg ${isLive ? 'text-pitch animate-pulse' : ''}`}>
                          {m.home_score} - {m.away_score}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Agendado</Badge>
                      )}
                      {isFinished && (
                        <Link to={`/match/${m.id}/replay`} onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" className="text-xs font-display h-7">
                            <RotateCcw className="h-3 w-3 mr-1" />Replay
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </CollapsibleContent>
          </section>
          </Collapsible>
        )}

        <Collapsible defaultOpen>
          <section>
          <CollapsibleTrigger className="flex items-center gap-2 font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide hover:text-foreground transition-colors">
            <ChevronDown className="h-4 w-4" /> Convites Recebidos ({received.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
          {received.length === 0 && <div className="stat-card text-center py-8"><p className="text-muted-foreground text-sm">Nenhum convite recebido.</p></div>}
          {received.length === 0 && <div className="stat-card text-center py-8"><p className="text-muted-foreground text-sm">Nenhum convite recebido.</p></div>}
          <div className="space-y-3">
            {received.map(c => (
              <ChallengeCard key={c.id} challenge={c} direction="received" isActing={acting === c.id}
                onAccept={() => handleAccept(c)} onReject={() => handleReject(c)} onViewMatch={() => c.match_id && navigate(`/match/${c.match_id}`)} />
            ))}
          </div>
          </CollapsibleContent>
        </section>
        </Collapsible>

        <Collapsible defaultOpen>
          <section>
          <CollapsibleTrigger className="flex items-center gap-2 font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide hover:text-foreground transition-colors">
            <ChevronDown className="h-4 w-4" /> Convites Enviados ({sent.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
          {sent.length === 0 && <div className="stat-card text-center py-8"><p className="text-muted-foreground text-sm">Nenhum convite enviado.</p></div>}
          <div className="space-y-3">
            {sent.map(c => (
              <ChallengeCard key={c.id} challenge={c} direction="sent" isActing={acting === c.id}
                onCancel={() => handleCancel(c)} onViewMatch={() => c.match_id && navigate(`/match/${c.match_id}`)} />
            ))}
          </div>
          </CollapsibleContent>
        </section>
        </Collapsible>
      </div>

      {/* Create Challenge Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Swords className="h-5 w-5 text-tactical" /> Convidar para Amistoso</DialogTitle>
            <DialogDescription>Escolha o adversário, data e envie o convite.</DialogDescription>
          </DialogHeader>

          {!hasLineup && (
            <div className="stat-card border-destructive/30 bg-destructive/5 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div><p className="font-display font-bold text-sm">Escalação necessária</p><p className="text-xs text-muted-foreground">Defina uma escalação ativa primeiro.</p></div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Seu Clube</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-display font-bold" style={{ backgroundColor: club?.primary_color, color: club?.secondary_color }}>{club?.short_name}</div>
                <span className="font-display font-bold">{club?.name}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Adversário</Label>
              <Select value={awayClubId} onValueChange={setAwayClubId}>
                <SelectTrigger><SelectValue placeholder="Escolha o clube adversário" /></SelectTrigger>
                <SelectContent>
                  {clubs.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-sm inline-block" style={{ backgroundColor: c.primary_color }} />
                        {c.name} <span className="text-muted-foreground text-xs">Rep: {c.reputation}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Data e Hora</Label>
              <Input type="datetime-local" value={scheduledAt} min={new Date().toISOString().slice(0, 16)} onChange={e => setScheduledAt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de Partida</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={matchType === '11x11' ? 'default' : 'outline'} onClick={() => setMatchType('11x11')} className="flex-1 font-display text-xs">11x11</Button>
                <Button type="button" size="sm" variant={matchType === '5x5' ? 'default' : 'outline'} onClick={() => setMatchType('5x5')} className="flex-1 font-display text-xs">5x5</Button>
              </div>
            </div>

            {matchType === '5x5' && (
              <div className="space-y-2 p-3 rounded-lg border border-tactical/30 bg-tactical/5">
                <p className="text-xs font-display font-bold text-tactical">Escale 5 jogadores</p>
                {(['Goleiro', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Jogador 5'] as const).map((label, i) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Select value={selected3v3[i]} onValueChange={val => { const next = [...selected3v3]; next[i] = val; setSelected3v3(next); }}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder={`Escolha o ${label}`} /></SelectTrigger>
                      <SelectContent>
                        {squad3v3.filter(p => i === 0 ? true : true).map(p => (
                          <SelectItem key={p.id} value={p.id} disabled={selected3v3.includes(p.id) && selected3v3[i] !== p.id}>
                            {p.full_name} — {p.primary_position} (OVR {p.overall})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mensagem (opcional)</Label>
              <Textarea placeholder="Mensagem para o adversário..." value={message} onChange={e => setMessage(e.target.value)} rows={2} className="resize-none" />
            </div>

            <Button onClick={handleSendChallenge} disabled={sending || !awayClubId || !scheduledAt || !hasLineup || (matchType === '5x5' && (selected3v3.some(id => !id) || new Set(selected3v3).size !== 5))} className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display">
              <Send className="h-4 w-4 mr-2" /> {sending ? 'Enviando...' : matchType === '5x5' ? 'ENVIAR CONVITE 5x5' : 'ENVIAR CONVITE'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Accept 3x3 Challenge Dialog */}
      <Dialog open={!!accept3v3Challenge} onOpenChange={open => { if (!open) setAccept3v3Challenge(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Swords className="h-5 w-5 text-tactical" /> Aceitar Amistoso 5x5</DialogTitle>
            <DialogDescription>Escolha seus 3 jogadores para o amistoso 5x5.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-3 rounded-lg border border-tactical/30 bg-tactical/5">
            <p className="text-xs font-display font-bold text-tactical">Escale 5 jogadores</p>
            {(['Goleiro', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Jogador 5'] as const).map((label, i) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Select value={accept3v3Selected[i]} onValueChange={val => { const next = [...accept3v3Selected]; next[i] = val; setAccept3v3Selected(next); }}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder={`Escolha o ${label}`} /></SelectTrigger>
                  <SelectContent>
                    {accept3v3Squad.map(p => (
                      <SelectItem key={p.id} value={p.id} disabled={accept3v3Selected.includes(p.id) && accept3v3Selected[i] !== p.id}>
                        {p.full_name} — {p.primary_position} (OVR {p.overall})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={doAccept3v3} disabled={accept3v3Selected.some(id => !id) || new Set(accept3v3Selected).size !== 5} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
            <CheckCircle2 className="h-4 w-4 mr-2" /> ACEITAR 5x5
          </Button>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}

function ChallengeCard({ challenge: c, direction, isActing, onAccept, onReject, onCancel, onViewMatch }: {
  challenge: Challenge; direction: 'received' | 'sent'; isActing: boolean;
  onAccept?: () => void; onReject?: () => void; onCancel?: () => void; onViewMatch?: () => void;
}) {
  const statusInfo = STATUS_INFO[c.status] || { label: c.status, className: 'bg-muted text-muted-foreground' };
  const opponent = direction === 'received' ? c.challenger_club : c.challenged_club;

  return (
    <div className="stat-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {opponent && (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-sm shrink-0"
              style={{ backgroundColor: opponent.primary_color, color: opponent.secondary_color }}>{opponent.short_name}</div>
          )}
          <div>
            <p className="font-display font-bold text-sm">{opponent?.name || '—'}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <CalendarClock className="h-3 w-3" />
              {format(new Date(c.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${statusInfo.className}`}>{statusInfo.label}</Badge>
      </div>
      {c.message && (() => {
        const is3v3 = c.message.startsWith('[5x5:');
        const cleanMsg = is3v3 ? c.message.replace(/^\[5x5:[^\]]+\]\s*/, '') : c.message;
        return (
          <div className="flex items-center gap-2">
            {is3v3 && <Badge variant="outline" className="text-[10px] border-tactical/50 text-tactical shrink-0">5x5</Badge>}
            {cleanMsg && <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{cleanMsg}</p>}
          </div>
        );
      })()}
      <div className="flex items-center gap-2">
        {direction === 'received' && c.status === 'proposed' && (
          <>
            <Button size="sm" disabled={isActing} onClick={onAccept} className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Aceitar</Button>
            <Button size="sm" variant="outline" disabled={isActing} onClick={onReject} className="text-xs font-display border-destructive/40 text-destructive hover:bg-destructive/10"><XCircle className="h-3 w-3 mr-1" /> Recusar</Button>
          </>
        )}
        {direction === 'sent' && c.status === 'proposed' && (
          <Button size="sm" variant="outline" disabled={isActing} onClick={onCancel} className="text-xs font-display"><Ban className="h-3 w-3 mr-1" /> Cancelar</Button>
        )}
        {c.match_id && <Button size="sm" variant="outline" onClick={onViewMatch} className="text-xs font-display ml-auto"><Swords className="h-3 w-3 mr-1" /> Ver Partida</Button>}
      </div>
    </div>
  );
}
