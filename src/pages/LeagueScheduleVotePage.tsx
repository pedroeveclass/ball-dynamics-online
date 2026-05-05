import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Clock, Vote, CheckCircle2, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ManagerVoteIntroTour } from '@/components/tour/ManagerVoteIntroTour';
import { PageNavTabs } from '@/components/PageNavTabs';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'];

interface VoteSummary {
  preferred_day_1: string;
  preferred_day_2: string;
  preferred_time: string;
  count: number;
}

export default function LeagueScheduleVotePage() {
  const { managerProfile } = useAuth();
  const { t } = useTranslation('league_vote');
  const { t: tNav } = useTranslation('nav');

  function dayLabel(value: string) {
    return DAY_KEYS.includes(value as typeof DAY_KEYS[number]) ? t(`days.${value}`) : value;
  }

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

      toast.success(t('toast.vote_ok'));
      // Refresh data
      await fetchData();
    } catch (err: any) {
      console.error('Error submitting vote:', err);
      toast.error(t('toast.vote_error', { message: err.message || t('toast.vote_error_default') }));
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
        <PageNavTabs
          tabs={[
            { to: '/league', label: tNav('tabs.league_overview') },
            { to: '/league/vote', label: tNav('tabs.league_vote') },
          ]}
        />
        <ManagerVoteIntroTour enabled={!loading} />
        <div>
          <h1 className="font-display text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {/* Current schedule */}
        <Card data-tour="vote-results">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-tactical" />
              {t('current.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {t('current.matches')} <span className="font-semibold">{dayLabel(currentSchedule.day1)}</span> {t('current.and')}{' '}
              <span className="font-semibold">{dayLabel(currentSchedule.day2)}</span> {t('current.at')}{' '}
              <span className="font-semibold">{currentSchedule.time}</span>
            </p>
          </CardContent>
        </Card>

        {/* Vote form */}
        <Card data-tour="vote-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Vote className="h-4 w-4 text-tactical" />
              {t('form.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('form.day1')}</label>
                <Select value={day1} onValueChange={setDay1}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_KEYS.map(d => (
                      <SelectItem key={d} value={d}>{t(`days.${d}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('form.day2')}</label>
                <Select value={day2} onValueChange={setDay2}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_KEYS.map(d => (
                      <SelectItem key={d} value={d}>{t(`days.${d}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('form.time')}</label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map(tm => (
                      <SelectItem key={tm} value={tm}>{tm}</SelectItem>
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
              {t('form.submit')}
            </Button>
          </CardContent>
        </Card>

        {/* Vote summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-tactical" />
              {t('summary.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('summary.managers_voted')}</span>
              <Badge variant="secondary">{totalVotes}</Badge>
            </div>

            {winningOption && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('summary.winning_option')}</span>
                <span className="text-sm font-semibold">
                  {dayLabel(winningOption.preferred_day_1)} {t('summary.and')} {dayLabel(winningOption.preferred_day_2)} {t('summary.at')} {winningOption.preferred_time}
                  <Badge variant="outline" className="ml-2">
                    {winningOption.count === 1 ? t('summary.votes_one', { count: winningOption.count }) : t('summary.votes_other', { count: winningOption.count })}
                  </Badge>
                </span>
              </div>
            )}

            {myVote && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('summary.your_vote')}</span>
                <span className="text-sm font-semibold">
                  {dayLabel(myVote.preferred_day_1)} {t('summary.and')} {dayLabel(myVote.preferred_day_2)} {t('summary.at')} {myVote.preferred_time}
                </span>
              </div>
            )}

            {!myVote && (
              <p className="text-sm text-muted-foreground italic">{t('summary.no_vote')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ManagerLayout>
  );
}
