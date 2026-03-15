import { AppLayout } from '@/components/AppLayout';
import { FormBadge } from '@/components/FormBadge';
import { standings, clubs, seasons } from '@/data/mock';

const season = seasons[0];

export default function LeaguePage() {
  const sorted = [...standings].sort((a, b) => b.points - a.points);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Liga Principal</h1>
          <p className="text-sm text-muted-foreground">Temporada {season.number} • Rodada {season.currentRound}/{season.totalRounds}</p>
        </div>

        <div className="stat-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Clube</th>
                <th>J</th>
                <th>V</th>
                <th>E</th>
                <th>D</th>
                <th>GP</th>
                <th>GC</th>
                <th>SG</th>
                <th>Pts</th>
                <th>Forma</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const club = clubs.find(c => c.id === s.clubId)!;
                return (
                  <tr key={s.clubId}>
                    <td className="font-display font-bold">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-sm" style={{ backgroundColor: club.primaryColor }} />
                        <span className="font-medium">{club.name}</span>
                        <span className="text-xs text-muted-foreground">({club.shortName})</span>
                      </div>
                    </td>
                    <td>{s.played}</td>
                    <td className="text-pitch font-semibold">{s.won}</td>
                    <td>{s.drawn}</td>
                    <td className="text-destructive">{s.lost}</td>
                    <td>{s.goalsFor}</td>
                    <td>{s.goalsAgainst}</td>
                    <td className="font-semibold">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                    <td className="font-display text-lg font-bold">{s.points}</td>
                    <td><FormBadge form={s.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
