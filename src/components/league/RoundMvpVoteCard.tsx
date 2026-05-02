import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Loader2, Star, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ClubCrest } from '@/components/ClubCrest';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Candidate = {
  player_profile_id: string;
  rating: number | null;
  goals: number;
  assists: number;
  tackles: number;
  gk_saves: number;
  minutes_played: number;
  club_id: string | null;
  position: string | null;
  match_id: string | null;
};

type Poll = {
  id: string;
  status: 'open' | 'closed';
  closes_at: string;
  candidates: Candidate[];
  winner_player_profile_id: string | null;
  winner_vote_count: number | null;
};

type PlayerInfo = {
  id: string;
  nickname: string | null;
  appearance: any;
  jersey_number: number | null;
};

type ClubInfo = {
  id: string;
  name: string;
  short_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  crest_url: string | null;
};

interface Props {
  roundId: string;
  roundNumber: number;
}

export function RoundMvpVoteCard({ roundId, roundNumber }: Props) {
  const { t } = useTranslation('league');
  const { user } = useAuth();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [clubs, setClubs] = useState<Record<string, ClubInfo>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [myVote, setMyVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: pollRow } = await supabase
        .from('player_award_polls' as any)
        .select('id, status, closes_at, candidates, winner_player_profile_id, winner_vote_count')
        .eq('scope', 'round_mvp')
        .eq('scope_entity_id', roundId)
        .maybeSingle();

      if (cancelled) return;
      if (!pollRow) {
        setPoll(null);
        setLoading(false);
        return;
      }

      const p = pollRow as any as Poll;
      setPoll(p);

      const candidateIds = (p.candidates || []).map((c) => c.player_profile_id);
      const clubIds = Array.from(new Set((p.candidates || []).map((c) => c.club_id).filter(Boolean) as string[]));

      const [{ data: playerRows }, { data: clubRows }, { data: tallyRows }, myVoteRes] = await Promise.all([
        candidateIds.length
          ? supabase.from('player_profiles').select('id, nickname, appearance, jersey_number').in('id', candidateIds)
          : Promise.resolve({ data: [] as any[] }),
        clubIds.length
          ? supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, crest_url').in('id', clubIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from('player_award_votes' as any)
          .select('voted_player_profile_id')
          .eq('poll_id', p.id),
        user
          ? supabase
              .from('player_award_votes' as any)
              .select('voted_player_profile_id')
              .eq('poll_id', p.id)
              .eq('voter_user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;

      const playerMap: Record<string, PlayerInfo> = {};
      (playerRows ?? []).forEach((r: any) => { playerMap[r.id] = r; });
      setPlayers(playerMap);

      const clubMap: Record<string, ClubInfo> = {};
      (clubRows ?? []).forEach((r: any) => { clubMap[r.id] = r; });
      setClubs(clubMap);

      const counts: Record<string, number> = {};
      (tallyRows ?? []).forEach((r: any) => {
        counts[r.voted_player_profile_id] = (counts[r.voted_player_profile_id] ?? 0) + 1;
      });
      setVoteCounts(counts);

      const mv = (myVoteRes as any)?.data?.voted_player_profile_id ?? null;
      setMyVote(mv);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roundId, user?.id]);

  const totalVotes = useMemo(
    () => Object.values(voteCounts).reduce((a, b) => a + b, 0),
    [voteCounts]
  );

  const isClosed = poll?.status === 'closed';
  const isExpired = poll && !isClosed && new Date(poll.closes_at) < new Date();

  async function handleVote(candidateId: string) {
    if (!user) {
      toast.error(t('mvpVote.toast.login_required'));
      return;
    }
    if (!poll || isClosed || isExpired) return;
    if (voting) return;

    setVoting(true);
    const prev = myVote;
    // Optimistic update
    setMyVote(candidateId);
    setVoteCounts((c) => {
      const next = { ...c };
      if (prev) next[prev] = Math.max(0, (next[prev] ?? 0) - 1);
      next[candidateId] = (next[candidateId] ?? 0) + 1;
      return next;
    });

    const { error } = await supabase.rpc('vote_round_mvp' as any, {
      p_poll_id: poll.id,
      p_candidate_player_profile_id: candidateId,
    });

    if (error) {
      // Rollback
      setMyVote(prev);
      setVoteCounts((c) => {
        const next = { ...c };
        next[candidateId] = Math.max(0, (next[candidateId] ?? 0) - 1);
        if (prev) next[prev] = (next[prev] ?? 0) + 1;
        return next;
      });
      toast.error(error.message ?? t('mvpVote.toast.error'));
    } else {
      toast.success(prev ? t('mvpVote.toast.changed') : t('mvpVote.toast.voted'));
    }
    setVoting(false);
  }

  if (loading) {
    return (
      <div className="stat-card flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!poll) return null;

  const winner = poll.winner_player_profile_id
    ? poll.candidates.find((c) => c.player_profile_id === poll.winner_player_profile_id)
    : null;

  const showCounts = !!myVote || isClosed;

  return (
    <div id="mvp" className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-semibold text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-tactical" />
          {t('mvpVote.title', { round: roundNumber })}
        </h2>
        {isClosed ? (
          <span className="text-[10px] uppercase font-display font-bold text-muted-foreground tracking-wide">
            {t('mvpVote.closed')}
          </span>
        ) : isExpired ? (
          <span className="text-[10px] uppercase font-display font-bold text-amber-500 tracking-wide">
            {t('mvpVote.processing')}
          </span>
        ) : (
          <span className="text-[10px] uppercase font-display font-bold text-pitch tracking-wide">
            {t('mvpVote.open')}
          </span>
        )}
      </div>

      {isClosed && winner ? (
        <WinnerBanner
          candidate={winner}
          player={players[winner.player_profile_id]}
          club={winner.club_id ? clubs[winner.club_id] : undefined}
          votes={poll.winner_vote_count ?? 0}
          totalVotes={totalVotes}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {myVote
            ? t('mvpVote.help.voted')
            : isExpired
              ? t('mvpVote.help.expired')
              : t('mvpVote.help.choose')}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {(poll.candidates ?? []).map((c) => {
          const player = players[c.player_profile_id];
          const club = c.club_id ? clubs[c.club_id] : undefined;
          const count = voteCounts[c.player_profile_id] ?? 0;
          const selected = myVote === c.player_profile_id;
          const isWinner = isClosed && c.player_profile_id === poll.winner_player_profile_id;
          const disabled = isClosed || isExpired || voting;

          return (
            <button
              key={c.player_profile_id}
              type="button"
              disabled={disabled}
              onClick={() => handleVote(c.player_profile_id)}
              className={cn(
                'relative text-left rounded-lg border p-2 transition-all',
                'flex flex-col gap-2 bg-card',
                disabled ? 'cursor-default' : 'hover:border-tactical hover:shadow-sm cursor-pointer',
                selected && 'border-tactical ring-2 ring-tactical/30',
                isWinner && 'border-amber-500 ring-2 ring-amber-400/40'
              )}
            >
              {selected && !isClosed && (
                <span className="absolute -top-1.5 -right-1.5 bg-tactical text-white rounded-full p-0.5">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              {isWinner && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-1">
                  <Trophy className="h-3 w-3" strokeWidth={3} />
                </span>
              )}

              <div className="flex items-center gap-2">
                <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-muted">
                  <PlayerAvatar
                    appearance={player?.appearance ?? null}
                    variant="face"
                    clubPrimaryColor={club?.primary_color}
                    clubSecondaryColor={club?.secondary_color}
                    clubCrestUrl={club?.crest_url}
                    playerName={player?.nickname ?? ''}
                    fallbackSeed={c.player_profile_id}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/jogador/${c.player_profile_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block text-xs font-display font-bold truncate hover:text-tactical"
                  >
                    {player?.nickname ?? '—'}
                  </Link>
                  <div className="flex items-center gap-1 mt-0.5">
                    {club && (
                      <ClubCrest
                        crestUrl={club.crest_url}
                        primaryColor={club.primary_color || '#333'}
                        secondaryColor={club.secondary_color || '#fff'}
                        shortName={club.short_name || '?'}
                        className="h-3 w-3 rounded text-[7px] shrink-0"
                      />
                    )}
                    <span className="text-[10px] text-muted-foreground truncate">
                      {club?.short_name ?? ''}{c.position ? ` · ${c.position}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-display font-bold">
                    {c.rating != null ? Number(c.rating).toFixed(1) : '—'}
                  </span>
                </div>
                <KeyStat candidate={c} t={t} />
              </div>

              {showCounts && (
                <div className="flex items-center justify-between text-[10px] pt-1 border-t">
                  <span className="text-muted-foreground">{t('mvpVote.votes', { count })}</span>
                  {totalVotes > 0 && (
                    <span className="text-muted-foreground">
                      {Math.round((count / totalVotes) * 100)}%
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!isClosed && (
        <p className="text-[10px] text-muted-foreground text-right">
          {t('mvpVote.total_votes', { count: totalVotes })}
        </p>
      )}
    </div>
  );
}

function KeyStat({ candidate, t }: { candidate: Candidate; t: any }) {
  if (candidate.goals > 0) return <span className="text-[10px] font-medium text-pitch">{t('mvpVote.stats.goals', { count: candidate.goals })}</span>;
  if (candidate.assists > 0) return <span className="text-[10px] font-medium text-tactical">{t('mvpVote.stats.assists', { count: candidate.assists })}</span>;
  if (candidate.gk_saves > 0) return <span className="text-[10px] font-medium text-amber-500">{t('mvpVote.stats.saves', { count: candidate.gk_saves })}</span>;
  if (candidate.tackles > 0) return <span className="text-[10px] font-medium text-muted-foreground">{t('mvpVote.stats.tackles', { count: candidate.tackles })}</span>;
  return null;
}

function WinnerBanner({
  candidate,
  player,
  club,
  votes,
  totalVotes,
}: {
  candidate: Candidate;
  player?: PlayerInfo;
  club?: ClubInfo;
  votes: number;
  totalVotes: number;
}) {
  const { t } = useTranslation('league');
  return (
    <div className="rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent p-3 flex items-center gap-3">
      <Trophy className="h-8 w-8 text-amber-500 shrink-0" />
      <div className="h-12 w-12 shrink-0 rounded-full overflow-hidden bg-muted">
        <PlayerAvatar
          appearance={player?.appearance ?? null}
          variant="face"
          clubPrimaryColor={club?.primary_color}
          clubSecondaryColor={club?.secondary_color}
          clubCrestUrl={club?.crest_url}
          playerName={player?.nickname ?? ''}
          fallbackSeed={candidate.player_profile_id}
          className="h-full w-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-display font-bold">
          {t('mvpVote.winner_label')}
        </p>
        <Link
          to={`/jogador/${candidate.player_profile_id}`}
          className="font-display font-bold text-sm hover:text-tactical truncate block"
        >
          {player?.nickname ?? '—'}
        </Link>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {club && (
            <ClubCrest
              crestUrl={club.crest_url}
              primaryColor={club.primary_color || '#333'}
              secondaryColor={club.secondary_color || '#fff'}
              shortName={club.short_name || '?'}
              className="h-3 w-3 rounded text-[7px]"
            />
          )}
          <span className="truncate">{club?.name ?? ''}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-display font-bold text-lg leading-none">{votes}</p>
        <p className="text-[10px] text-muted-foreground">
          {t('mvpVote.votes_of', { total: totalVotes })}
        </p>
      </div>
    </div>
  );
}
