import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClubCrest } from '@/components/ClubCrest';
import { supabase } from '@/integrations/supabase/client';
import type { ClubInfo, EventLog, Participant } from './types';

interface MatchEndStatsProps {
  matchId: string;
  events: EventLog[];
  homeClub: ClubInfo | null;
  awayClub: ClubInfo | null;
  homePlayers: Participant[];
  awayPlayers: Participant[];
  homeScore: number;
  awayScore: number;
}

interface StatPair {
  home: number;
  away: number;
}

function computeStats(
  events: EventLog[],
  homeClubId: string | undefined,
  awayClubId: string | undefined,
  homePlayers: Participant[],
  awayPlayers: Participant[],
): {
  possession: StatPair;
  shots: StatPair;
  saves: StatPair;
  corners: StatPair;
  fouls: StatPair;
  passes: StatPair;
} {
  const clubByParticipant = new Map<string, string>();
  for (const p of homePlayers) clubByParticipant.set(p.id, p.club_id);
  for (const p of awayPlayers) clubByParticipant.set(p.id, p.club_id);

  const zero = (): StatPair => ({ home: 0, away: 0 });
  const possession = zero();
  const shots = zero();
  const saves = zero();
  const corners = zero();
  const fouls = zero();
  const passes = zero();

  const bumpByParticipant = (pair: StatPair, participantId: unknown) => {
    if (typeof participantId !== 'string') return;
    const clubId = clubByParticipant.get(participantId);
    if (clubId === homeClubId) pair.home++;
    else if (clubId === awayClubId) pair.away++;
  };

  const bumpByClubId = (pair: StatPair, clubId: unknown) => {
    if (typeof clubId !== 'string') return;
    if (clubId === homeClubId) pair.home++;
    else if (clubId === awayClubId) pair.away++;
  };

  // For saves we credit the gk's club as DEFENDING — that's the side that
  // earned the save. (gk_participant_id is the goalkeeper who saved.)
  for (const e of events) {
    const t = e.event_type;
    const p = (e.payload || {}) as Record<string, unknown>;

    // Possession proxy: count any ball-handling event per the actor's club.
    if (t === 'bh_dribble' || t === 'bh_pass' || t === 'bh_shot') {
      bumpByParticipant(possession, p.ball_holder_participant_id);
    } else if (t === 'pass_complete' || t === 'pass_failed') {
      bumpByParticipant(possession, p.passer_participant_id);
      bumpByParticipant(passes, p.passer_participant_id);
    }

    if (t === 'goal') {
      bumpByClubId(shots, p.scorer_club_id);
    } else if (t === 'shot_missed' || t === 'shot_post' || t === 'shot_over') {
      bumpByParticipant(shots, p.shooter_participant_id);
    }

    if (t === 'gk_save') {
      bumpByParticipant(saves, p.gk_participant_id);
    }

    if (t === 'corner') {
      bumpByClubId(corners, p.awarded_club_id);
    }

    if (t === 'foul' || t === 'penalty') {
      bumpByParticipant(fouls, p.fouler_participant_id);
    }
  }

  return { possession, shots, saves, corners, fouls, passes };
}

interface StatRowProps {
  label: string;
  home: number;
  away: number;
  homeColor: string;
  awayColor: string;
  asPercent?: boolean;
}

function StatRow({ label, home, away, homeColor, awayColor, asPercent }: StatRowProps) {
  const total = home + away;
  let homeRatio = 0.5;
  if (asPercent) {
    homeRatio = total > 0 ? home / total : 0.5;
  } else {
    homeRatio = total > 0 ? home / total : 0.5;
  }
  const awayRatio = 1 - homeRatio;

  const homeDisplay = asPercent ? `${Math.round(homeRatio * 100)}%` : String(home);
  const awayDisplay = asPercent ? `${Math.round(awayRatio * 100)}%` : String(away);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold tabular-nums text-white" style={{ color: homeColor }}>
          {homeDisplay}
        </span>
        <span className="font-display text-white/80 text-xs uppercase tracking-wide">{label}</span>
        <span className="font-display font-bold tabular-nums text-white" style={{ color: awayColor }}>
          {awayDisplay}
        </span>
      </div>
      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/10">
        <div
          className="h-full transition-all"
          style={{ width: `${homeRatio * 100}%`, backgroundColor: homeColor }}
        />
        <div
          className="h-full transition-all"
          style={{ width: `${awayRatio * 100}%`, backgroundColor: awayColor }}
        />
      </div>
    </div>
  );
}

export function MatchEndStats({
  matchId,
  events,
  homeClub,
  awayClub,
  homePlayers,
  awayPlayers,
  homeScore,
  awayScore,
}: MatchEndStatsProps) {
  const { t } = useTranslation('match_room');

  // The live event stream is capped (LIVE_EVENT_LIMIT) so it only holds the
  // last N events when the match ends. Fetch the full history for accurate
  // tallies; fall back to the in-memory list if the fetch fails or is in flight.
  const [fullEvents, setFullEvents] = useState<EventLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('match_event_logs')
        .select('id, event_type, title, body, created_at, payload')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error || !data) return;
      setFullEvents(data as unknown as EventLog[]);
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const sourceEvents = fullEvents ?? events;

  const stats = useMemo(
    () => computeStats(sourceEvents, homeClub?.id, awayClub?.id, homePlayers, awayPlayers),
    [sourceEvents, homeClub?.id, awayClub?.id, homePlayers, awayPlayers],
  );

  const homeColor = homeClub?.primary_color || '#22c55e';
  const awayColor = awayClub?.primary_color || '#6366f1';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg backdrop-blur-sm overflow-auto p-3">
      <div className="w-full max-w-md bg-[hsl(220,20%,8%)]/95 border border-white/10 rounded-xl shadow-2xl px-4 py-4">
        <div className="text-center mb-3">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            {t('stats.title', { defaultValue: 'Visão geral da partida' })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {homeClub && (
              <ClubCrest
                crestUrl={homeClub.crest_url}
                primaryColor={homeClub.primary_color}
                secondaryColor={homeClub.secondary_color}
                shortName={homeClub.short_name}
                className="w-7 h-7 rounded text-[10px] font-bold"
              />
            )}
            <span className="font-display text-xs text-white/90 truncate">{homeClub?.name ?? '—'}</span>
          </div>
          <div className="font-display font-extrabold text-2xl text-white tabular-nums">
            {homeScore} – {awayScore}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <span className="font-display text-xs text-white/90 truncate">{awayClub?.name ?? '—'}</span>
            {awayClub && (
              <ClubCrest
                crestUrl={awayClub.crest_url}
                primaryColor={awayClub.primary_color}
                secondaryColor={awayClub.secondary_color}
                shortName={awayClub.short_name}
                className="w-7 h-7 rounded text-[10px] font-bold"
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <StatRow
            label={t('stats.possession', { defaultValue: 'Posse de bola' })}
            home={stats.possession.home}
            away={stats.possession.away}
            homeColor={homeColor}
            awayColor={awayColor}
            asPercent
          />
          <StatRow
            label={t('stats.shots', { defaultValue: 'Finalizações' })}
            home={stats.shots.home}
            away={stats.shots.away}
            homeColor={homeColor}
            awayColor={awayColor}
          />
          <StatRow
            label={t('stats.saves', { defaultValue: 'Defesas do goleiro' })}
            home={stats.saves.home}
            away={stats.saves.away}
            homeColor={homeColor}
            awayColor={awayColor}
          />
          <StatRow
            label={t('stats.corners', { defaultValue: 'Escanteios' })}
            home={stats.corners.home}
            away={stats.corners.away}
            homeColor={homeColor}
            awayColor={awayColor}
          />
          <StatRow
            label={t('stats.fouls', { defaultValue: 'Faltas' })}
            home={stats.fouls.home}
            away={stats.fouls.away}
            homeColor={homeColor}
            awayColor={awayColor}
          />
          <StatRow
            label={t('stats.passes', { defaultValue: 'Passes' })}
            home={stats.passes.home}
            away={stats.passes.away}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        </div>
      </div>
    </div>
  );
}
