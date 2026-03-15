import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { EnergyBar } from '@/components/EnergyBar';
import { PositionBadge } from '@/components/PositionBadge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Zap, DollarSign, Star, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

export default function PlayerDashboard() {
  const { user, playerProfile } = useAuth();
  const [contract, setContract] = useState<Tables<'contracts'> | null>(null);
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([]);
  const [attributes, setAttributes] = useState<Tables<'player_attributes'> | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);

  useEffect(() => {
    if (!playerProfile) return;

    const fetchData = async () => {
      const [contractRes, notifRes, attrRes] = await Promise.all([
        supabase.from('contracts').select('*').eq('player_profile_id', playerProfile.id).order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('notifications').select('*').eq('user_id', user!.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).single(),
      ]);

      setContract(contractRes.data);
      setNotifications(notifRes.data || []);
      setAttributes(attrRes.data);

      if (playerProfile.club_id) {
        const { data: clubData } = await supabase.from('clubs').select('name').eq('id', playerProfile.club_id).single();
        setClubName(clubData?.name || null);
      } else {
        setClubName(null);
      }
      setAttributes(attrRes.data);
    };

    fetchData();
  }, [playerProfile, user]);

  if (!playerProfile) return null;

  const p = playerProfile;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">{p.full_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <PositionBadge position={p.primary_position as any} />
              {p.secondary_position && <PositionBadge position={p.secondary_position as any} />}
              <span className="text-sm text-muted-foreground">{p.archetype}</span>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{p.dominant_foot === 'right' ? 'Pé Direito' : 'Pé Esquerdo'}</span>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{p.age} anos</span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-display text-4xl font-extrabold text-tactical">{p.overall}</span>
            <p className="text-xs text-muted-foreground">OVR</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Reputação" value={p.reputation} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Dinheiro" value={`$${p.money.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
          <StatCard label="Salário/Sem" value={contract?.status === 'active' ? `$${contract.weekly_salary.toLocaleString()}` : 'Sem contrato'} />
          <StatCard label="Clube" value={clubName || 'Sem clube'} subtitle={!p.club_id ? 'Agente Livre' : undefined} />
        </div>

        {/* Energy */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-warning" />
            <span className="font-display font-semibold text-sm">Estado Físico</span>
          </div>
          <EnergyBar current={p.energy_current} max={p.energy_max} />
          <p className="mt-2 text-xs text-muted-foreground">
            {p.energy_current >= 80 ? 'Pronto para jogar' : p.energy_current >= 50 ? 'Considere descansar' : 'Necessita recuperação'}
          </p>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-tactical" />
              <span className="font-display font-semibold text-sm">Notificações</span>
            </div>
            <div className="space-y-2">
              {notifications.map(n => (
                <div key={n.id} className="flex items-start gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-tactical mt-1.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Attributes */}
        {attributes && (
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-semibold text-sm">Atributos Principais</span>
              <Link to="/player/attributes" className="text-xs text-tactical hover:underline">Ver todos →</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: 'Velocidade', val: attributes.velocidade },
                { label: 'Controle', val: attributes.controle_bola },
                { label: 'Visão', val: attributes.visao_jogo },
                { label: 'Passe Baixo', val: attributes.passe_baixo },
              ].map(a => (
                <div key={a.label}>
                  <p className="font-display text-2xl font-bold text-foreground">{a.val}</p>
                  <p className="text-xs text-muted-foreground">{a.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
