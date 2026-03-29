import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Clock, Vote, CheckCircle2, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const DAYS = [
  { value: 'monday', label: 'Segunda-feira' },
  { value: 'tuesday', label: 'Terça-feira' },
  { value: 'wednesday', label: 'Quarta-feira' },
  { value: 'thursday', label: 'Quinta-feira' },
  { value: 'friday', label: 'Sexta-feira' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' },
];

const TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'];

function dayLabel(value: string) {
  return DAYS.find(d => d.value === value)?.label || value;
}

interface VoteSummary {
  preferred_day_1: string;
  preferred_day_2: string;
  preferred_time: string;
  count: number;
}

export default function LeagueScheduleVotePage() {
  const { managerProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState({ day1: '', day2: '', time: '' });

  // Form state
  const [day1, setDay1] = useState('');
  const [day2, setDay2] = useState('');
  const [time, setTime] = useState('');

  // Vote stats
  const [totalVotes, setTotalVotes] = useState(0);
  const [myVote, setMyVote] = useState<{ preferred_day_1: string; preferred_day_2: string; preferred_time: string } | null>(null);
  const [winningOption, setWinningOption] = useState<VoteSummary | null>(null);

  useEffect(() => {
    if (managerProfile) fetchData();
  }, [managerProfile]);

  async function fetchData() {
    try {
      // Get active league
      const { data: league } = await supabase
        .from('leagues')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (!league) { setLoading(false); return; }
      setLeagueId(league.id);
      setCurrentSchedule({
        day1: league.match_day_1,
        day2: league.match_day_2,
        time: league.match_time,
      });

      // Fetch all votes and my vote in parallel
      const [allVotesRes, myVoteRes] = await Promise.all([
        supabase
          .from('league_schedule_votes')
          .select('preferred_day_1, preferred_day_2, preferred_time')
          .eq('league_id', league.id),
        supabase
          .from('league_schedule_votes')
          .select('preferred_day_1, preferred_day_2, preferred_time')
          .eq('league_id', league.id)
          .eq('manager_profile_id', managerProfile!.id)
          .maybeSingle(),
      ]);

      if (allVotesRes.data) {
        setTotalVotes(allVotesRes.data.length);

        // Count votes by combination to find winning option
        const counts: Record<string, VoteSummary> = {};
        for (const v of allVotesRes.data) {
          const key = `${v.preferred_day_1}|${v.preferred_day_2}|${v.preferred_time}`;
          if (!counts[key]) {
            counts[key] = { ...v, count: 0 };
          }
          counts[key].count++;
        }
        const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
        if (sorted.length > 0) setWinningOption(sorted[0]);
      }

      if (myVoteRes.data) {
        setMyVote(myVoteRes.data);
        setDay1(myVoteRes.data.preferred_day_1);
        setDay2(myVoteRes.data.preferred_day_2);
        setTime(myVoteRes.data.preferred_time);
      }
    } catch (err) {
      console.error('Error fetching vote data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitVote() {
    if (!leagueId || !managerProfile || !day1 || !day2 || !time) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('league_schedule_votes')
        .upsert(
          {
            league_id: leagueId,
            manager_profile_id: managerProfile.id,
            preferred_day_1: day1,
            preferred_day_2: day2,
            preferred_time: time,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'league_id,manager_profile_id' }
        );

      if (error) throw error;

      toast.success('Voto registrado! Sua preferência foi salva com sucesso.');
      // Refresh data
      await fetchData();
    } catch (err: any) {
      console.error('Error submitting vote:', err);
      toast.error(`Erro: ${err.message || 'Não foi possível registrar o voto.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ManagerLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Votação de Horários</h1>
          <p className="text-sm text-muted-foreground">
            Vote nos dias e horários preferidos para as partidas da liga.
          </p>
        </div>

        {/* Current schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-tactical" />
              Horário Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Jogos: <span className="font-semibold">{dayLabel(currentSchedule.day1)}</span> e{' '}
              <span className="font-semibold">{dayLabel(currentSchedule.day2)}</span> às{' '}
              <span className="font-semibold">{currentSchedule.time}</span>
            </p>
          </CardContent>
        </Card>

        {/* Vote form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Vote className="h-4 w-4 text-tactical" />
              Seu Voto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Dia 1</label>
                <Select value={day1} onValueChange={setDay1}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Dia 2</label>
                <Select value={day2} onValueChange={setDay2}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Horário</label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleSubmitVote}
              disabled={submitting || !day1 || !day2 || !time}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Votar
            </Button>
          </CardContent>
        </Card>

        {/* Vote summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-tactical" />
              Resumo da Votação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Managers que votaram</span>
              <Badge variant="secondary">{totalVotes}</Badge>
            </div>

            {winningOption && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Opção mais votada</span>
                <span className="text-sm font-semibold">
                  {dayLabel(winningOption.preferred_day_1)} e {dayLabel(winningOption.preferred_day_2)} às {winningOption.preferred_time}
                  <Badge variant="outline" className="ml-2">{winningOption.count} voto{winningOption.count !== 1 ? 's' : ''}</Badge>
                </span>
              </div>
            )}

            {myVote && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Seu voto atual</span>
                <span className="text-sm font-semibold">
                  {dayLabel(myVote.preferred_day_1)} e {dayLabel(myVote.preferred_day_2)} às {myVote.preferred_time}
                </span>
              </div>
            )}

            {!myVote && (
              <p className="text-sm text-muted-foreground italic">Você ainda não votou.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ManagerLayout>
  );
}
