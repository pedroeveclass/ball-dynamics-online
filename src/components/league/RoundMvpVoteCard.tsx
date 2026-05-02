import { useTranslation } from 'react-i18next';
import { MvpPollCard } from './MvpPollCard';

interface Props {
  roundId: string;
  roundNumber: number;
}

export function RoundMvpVoteCard({ roundId, roundNumber }: Props) {
  const { t } = useTranslation('league');
  return (
    <MvpPollCard
      scope="round_mvp"
      entityId={roundId}
      voteRpc="vote_round_mvp"
      anchorId="mvp"
      title={t('mvpVote.title', { round: roundNumber })}
    />
  );
}
