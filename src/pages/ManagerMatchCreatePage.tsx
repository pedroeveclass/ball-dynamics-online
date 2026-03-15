import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Swords, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ClubOption {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  reputation: number;
}

export default function ManagerMatchCreatePage() {
  const { club } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [awayClubId, setAwayClubId] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasLineup, setHasLineup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club) return;
    const load = async () => {
      const [clubsRes, lineupRes] = await Promise.all([
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, reputation').neq('id', club.id),
        supabase.from('lineups').select('id').eq('club_id', club.id).eq('is_active', true).limit(1),
      ]);
      setClubs(clubsRes.data || []);
      setHasLineup((lineupRes.data || []).length > 0);
      setLoading(false);
    };
    load();
  }, [club]);

  const handleCreate = async () => {
    if (!club || !awayClubId) return;
    setCreating(true);

    try {
      // Get active lineups for both clubs
      const [homeLineup, awayLineup] = await Promise.all([
        supabase.from('lineups').select('id').eq('club_id', club.id).eq('is_active', true).single(),
        supabase.from('lineups').select('id').eq('club_id', awayClubId).eq('is_active', true).single(),
      ]);

      if (!homeLineup.data) {
        toast.error('Seu clube não tem escalação ativa. Vá em Escalação primeiro.');
        setCreating(false);
        return;
      }

      // Create match
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        home_club_id: club.id,
        away_club_id: awayClubId,
        home_lineup_id: homeLineup.data.id,
        away_lineup_id: awayLineup.data?.id || null,
        status: 'scheduled',
        current_phase: 'pre_match',
      }).select('id').single();

      if (matchError) throw matchError;

      // Get lineup slots for both teams
      const lineupIds = [homeLineup.data.id, ...(awayLineup.data ? [awayLineup.data.id] : [])];
      const { data: slots } = await supabase.from('lineup_slots').select('id, lineup_id, player_profile_id, slot_position, role_type').in('lineup_id', lineupIds);

      // Get player user_ids for connecting
      const playerIds = (slots || []).filter(s => s.player_profile_id).map(s => s.player_profile_id);
      const { data: players } = await supabase.from('player_profiles').select('id, user_id').in('id', playerIds);
      const playerUserMap = new Map((players || []).map(p => [p.id, p.user_id]));

      // Create participants
      const participants = (slots || []).map(slot => {
        const clubId = slot.lineup_id === homeLineup.data!.id ? club.id : awayClubId;
        const userId = slot.player_profile_id ? playerUserMap.get(slot.player_profile_id) : null;
        return {
          match_id: match!.id,
          player_profile_id: slot.player_profile_id,
          club_id: clubId,
          lineup_slot_id: slot.id,
          role_type: 'player' as const,
          is_bot: !userId,
          is_ready: false,
          connected_user_id: userId || null,
        };
      });

      if (participants.length > 0) {
        const { error: partError } = await supabase.from('match_participants').insert(participants);
        if (partError) throw partError;
      }

      // Add manager participants
      const { data: awayManager } = await supabase.from('clubs').select('manager_profile_id').eq('id', awayClubId).single();
      const { data: awayMgrProfile } = awayManager?.manager_profile_id
        ? await supabase.from('manager_profiles').select('user_id').eq('id', awayManager.manager_profile_id).single()
        : { data: null };

      const managerParticipants = [
        { match_id: match!.id, club_id: club.id, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: (await supabase.auth.getUser()).data.user?.id || null },
      ];
      if (awayMgrProfile) {
        managerParticipants.push({ match_id: match!.id, club_id: awayClubId, role_type: 'manager', is_bot: false, is_ready: false, connected_user_id: awayMgrProfile.user_id });
      }
      await supabase.from('match_participants').insert(managerParticipants);

      // Log creation event
      await supabase.from('match_event_logs').insert({
        match_id: match!.id,
        event_type: 'system',
        title: 'Partida criada',
        body: `Partida agendada entre os dois clubes.`,
      });

      toast.success('Partida criada!');
      navigate(`/match/${match!.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar partida');
      setCreating(false);
    }
  };

  if (loading) return <ManagerLayout><p className="text-muted-foreground">Carregando...</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Swords className="h-6 w-6 text-tactical" /> Criar Partida
        </h1>

        {!hasLineup && (
          <div className="stat-card border-destructive/30 bg-destructive/5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-display font-bold text-sm">Escalação necessária</p>
              <p className="text-xs text-muted-foreground">Defina uma escalação ativa antes de criar uma partida.</p>
            </div>
          </div>
        )}

        <div className="stat-card space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Seu Clube (Casa)</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-display font-bold"
                style={{ backgroundColor: club?.primary_color, color: club?.secondary_color }}>
                {club?.short_name}
              </div>
              <span className="font-display font-bold">{club?.name}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Adversário</p>
            <Select value={awayClubId} onValueChange={setAwayClubId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o adversário" />
              </SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-sm inline-block" style={{ backgroundColor: c.primary_color }} />
                      {c.name} (Rep: {c.reputation})
                    </span>
                  </SelectItem>
                ))}
                {clubs.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum clube adversário encontrado.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleCreate} disabled={creating || !awayClubId || !hasLineup} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
            {creating ? 'Criando...' : 'CRIAR PARTIDA'}
          </Button>
        </div>
      </div>
    </ManagerLayout>
  );
}
