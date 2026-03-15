import { useEffect, useState } from 'react';
import { ManagerLayout } from '@/components/ManagerLayout';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Star, Wrench } from 'lucide-react';

export default function ManagerStadiumPage() {
  const { club } = useAuth();
  const [stadium, setStadium] = useState<any>(null);
  const [sectors, setSectors] = useState<any[]>([]);

  useEffect(() => {
    if (!club) return;
    const fetch = async () => {
      const { data: s } = await supabase.from('stadiums').select('*').eq('club_id', club.id).single();
      setStadium(s);
      if (s) {
        const { data: sec } = await supabase.from('stadium_sectors').select('*').eq('stadium_id', s.id);
        setSectors(sec || []);
      }
    };
    fetch();
  }, [club]);

  if (!club || !stadium) return <ManagerLayout><p className="text-muted-foreground">Carregando estádio...</p></ManagerLayout>;

  const sectorLabels: Record<string, string> = { popular: 'Popular', central: 'Central', premium: 'Premium' };

  return (
    <ManagerLayout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">{stadium.name}</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Capacidade" value={stadium.capacity.toLocaleString()} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Qualidade" value={`${stadium.quality}/100`} icon={<Building2 className="h-5 w-5" />} />
          <StatCard label="Prestígio" value={`${stadium.prestige}/100`} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Manutenção/Sem" value={`$${stadium.maintenance_cost.toLocaleString()}`} icon={<Wrench className="h-5 w-5" />} />
        </div>

        <div className="stat-card">
          <h2 className="font-display font-semibold text-sm mb-4">Setores</h2>
          {sectors.length > 0 ? (
            <div className="space-y-3">
              {sectors.map(sec => (
                <div key={sec.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div>
                    <p className="font-display font-bold text-foreground">{sectorLabels[sec.sector_type] || sec.sector_type}</p>
                    <p className="text-xs text-muted-foreground">{sec.capacity.toLocaleString()} lugares</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-tactical">${sec.ticket_price}</p>
                    <p className="text-xs text-muted-foreground">por ingresso</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum setor configurado.</p>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}
