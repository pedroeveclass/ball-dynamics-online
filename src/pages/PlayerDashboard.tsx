import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { EnergyBar } from '@/components/EnergyBar';
import { PositionBadge } from '@/components/PositionBadge';
import { players, contracts, clubs, matches, archetypes, notifications } from '@/data/mock';
import { Zap, DollarSign, Star, Swords, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

const player = players[0];
const contract = contracts.find(c => c.playerId === player.id);
const club = clubs.find(c => c.id === player.clubId);
const archetype = archetypes.find(a => a.id === player.archetypeId);
const nextMatch = matches.find(m => m.status === 'scheduled' && (m.homeClubId === player.clubId || m.awayClubId === player.clubId));
const unreadNotifs = notifications.filter(n => !n.read);

export default function PlayerDashboard() {
  const opponent = nextMatch
    ? clubs.find(c => c.id === (nextMatch.homeClubId === player.clubId ? nextMatch.awayClubId : nextMatch.homeClubId))
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">{player.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <PositionBadge position={player.position} />
              {player.secondaryPosition && <PositionBadge position={player.secondaryPosition} />}
              <span className="text-sm text-muted-foreground">{archetype?.name}</span>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{player.age} anos</span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-display text-4xl font-extrabold text-tactical">{player.overallRating}</span>
            <p className="text-xs text-muted-foreground">OVR</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Reputação" value={player.reputation} icon={<Star className="h-5 w-5" />} trend="up" />
          <StatCard label="Dinheiro" value={`$${player.money.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
          <StatCard label="Salário/Sem" value={contract ? `$${contract.weeklySalary.toLocaleString()}` : 'Sem contrato'} />
          <StatCard label="Clube" value={club?.shortName || 'Free Agent'} subtitle={club?.name} />
        </div>

        {/* Energy + Next Match */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-warning" />
              <span className="font-display font-semibold text-sm">Estado Físico</span>
            </div>
            <EnergyBar current={player.energy} max={player.maxEnergy} />
            <p className="mt-2 text-xs text-muted-foreground">
              {player.energy >= 80 ? 'Pronto para jogar' : player.energy >= 50 ? 'Considere descansar' : 'Necessita recuperação'}
            </p>
          </div>

          {nextMatch && opponent && (
            <Link to="/match" className="stat-card hover:border-tactical/40 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Swords className="h-4 w-4 text-tactical" />
                <span className="font-display font-semibold text-sm">Próxima Partida</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <span className="font-display text-lg font-bold">{club?.shortName}</span>
                </div>
                <span className="text-xs text-muted-foreground px-3">vs</span>
                <div className="text-center">
                  <span className="font-display text-lg font-bold">{opponent.shortName}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">Rodada {nextMatch.round} • Liga Principal</p>
            </Link>
          )}
        </div>

        {/* Notifications */}
        {unreadNotifs.length > 0 && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Notificações</span>
            </div>
            <div className="space-y-2">
              {unreadNotifs.slice(0, 3).map(n => (
                <div key={n.id} className="flex items-start gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-tactical mt-1.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Attributes Preview */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display font-semibold text-sm">Atributos Principais</span>
            <Link to="/player/attributes" className="text-xs text-tactical hover:underline">Ver todos →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { label: 'Velocidade', val: player.attributes.physical.speed },
              { label: 'Controle', val: player.attributes.technical.ballControl },
              { label: 'Visão', val: player.attributes.mental.vision },
              { label: 'Passe Curto', val: player.attributes.technical.shortPassing },
            ].map(a => (
              <div key={a.label}>
                <p className="font-display text-2xl font-bold text-foreground">{a.val}</p>
                <p className="text-xs text-muted-foreground">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
