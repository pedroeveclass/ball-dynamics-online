import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { PositionBadge } from '@/components/PositionBadge';
import { clubs, players, clubFinances, standings, matches, tactics } from '@/data/mock';
import { Users, DollarSign, Trophy, TrendingUp, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';

const club = clubs[0];
const finance = clubFinances[0];
const squad = players.filter(p => p.clubId === club.id);
const standing = standings.find(s => s.clubId === club.id)!;
const tactic = tactics[0];
const nextMatch = matches.find(m => m.status === 'scheduled' && (m.homeClubId === club.id || m.awayClubId === club.id));
const opponent = nextMatch ? clubs.find(c => c.id === (nextMatch.homeClubId === club.id ? nextMatch.awayClubId : nextMatch.homeClubId)) : null;

export default function ManagerDashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{club.name}</h1>
          <p className="text-sm text-muted-foreground">Gestão do Clube • {club.shortName}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Posição" value={`${standings.findIndex(s => s.clubId === club.id) + 1}º`} icon={<Trophy className="h-5 w-5" />} trend="up" />
          <StatCard label="Pontos" value={standing.points} subtitle={`${standing.won}V ${standing.drawn}E ${standing.lost}D`} />
          <StatCard label="Elenco" value={squad.length} icon={<Users className="h-5 w-5" />} subtitle="jogadores" />
          <StatCard label="Saldo" value={`$${(finance.balance / 1000).toFixed(0)}k`} icon={<DollarSign className="h-5 w-5" />} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Squad preview */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-semibold text-sm">Elenco</span>
              <Link to="/manager/squad" className="text-xs text-tactical hover:underline">Ver todos →</Link>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Pos</th>
                  <th>OVR</th>
                  <th>Energia</th>
                </tr>
              </thead>
              <tbody>
                {squad.map(p => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td><PositionBadge position={p.position} /></td>
                    <td className="font-display font-bold">{p.overallRating}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-muted">
                          <div className={`h-1.5 rounded-full ${p.energy >= 70 ? 'bg-pitch' : p.energy >= 40 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${p.energy}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{p.energy}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tactic + Next match */}
          <div className="space-y-4">
            <div className="stat-card">
              <span className="font-display font-semibold text-sm">Tática Atual</span>
              <div className="mt-3 flex items-center gap-4">
                <span className="font-display text-2xl font-bold text-tactical">{tactic.formation}</span>
                <div>
                  <p className="text-sm font-medium capitalize">{tactic.style}</p>
                  <p className="text-xs text-muted-foreground">Pressão: {tactic.instructions.pressingIntensity}/10 • Linha: {tactic.instructions.defensiveLine}/10</p>
                </div>
              </div>
            </div>

            {nextMatch && opponent && (
              <Link to="/match" className="stat-card block hover:border-tactical/40 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <Swords className="h-4 w-4 text-tactical" />
                  <span className="font-display font-semibold text-sm">Próxima Partida</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold">{club.shortName}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-display text-lg font-bold">{opponent.shortName}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground text-center">Rodada {nextMatch.round}</p>
              </Link>
            )}

            <div className="stat-card">
              <span className="font-display font-semibold text-sm">Finanças Resumo</span>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folha Salarial/Sem</span>
                  <span className="font-display font-bold">${finance.weeklyWageBill.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budget Transferências</span>
                  <span className="font-display font-bold">${finance.transferBudget.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bilheteria Total</span>
                  <span className="font-display font-bold text-pitch">${finance.revenue.ticketSales.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
