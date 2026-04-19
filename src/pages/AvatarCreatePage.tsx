import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AvatarCreator } from '@/components/AvatarCreator';
import { PlayerAppearance } from '@/lib/avatar';
import { toast } from 'sonner';

export default function AvatarCreatePage() {
  const { user, playerProfile, refreshPlayerProfile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [club, setClub] = useState<{ primary_color: string; secondary_color: string; crest_url: string | null } | null>(null);

  // Load the player's current club colors for the jersey preview.
  useEffect(() => {
    if (!playerProfile?.club_id) {
      setClub(null);
      return;
    }
    supabase
      .from('clubs')
      .select('primary_color, secondary_color, crest_url')
      .eq('id', playerProfile.club_id)
      .maybeSingle()
      .then(({ data }) => { if (data) setClub(data as any); });
  }, [playerProfile?.club_id]);

  // Editing is one-shot: if the player already has an appearance, bounce back.
  useEffect(() => {
    if (playerProfile && (playerProfile as any).appearance != null) {
      navigate('/player', { replace: true });
    }
  }, [playerProfile, navigate]);

  const handleSubmit = async (appearance: PlayerAppearance) => {
    if (!user || !playerProfile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('player_profiles')
        .update({ appearance: appearance as any } as any)
        .eq('id', playerProfile.id);
      if (error) throw error;
      await refreshPlayerProfile();
      toast.success('Visual do jogador salvo!');
      navigate('/player', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao salvar avatar');
    } finally {
      setSubmitting(false);
    }
  };

  if (!playerProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6 pt-4">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">CRIAR VISUAL</h1>
          <p className="mt-1 text-sm text-primary-foreground/60">
            Personalize como seu jogador vai aparecer em campo, no perfil e pra todos os outros jogadores.
          </p>
          <p className="mt-2 text-xs text-amber-300/80 font-display">
            Atenção: o visual é definitivo e não pode ser editado depois.
          </p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <AvatarCreator
            playerName={playerProfile.full_name}
            clubPrimaryColor={club?.primary_color}
            clubSecondaryColor={club?.secondary_color}
            clubCrestUrl={club?.crest_url}
            jerseyNumber={(playerProfile as any).jersey_number}
            height={(playerProfile as any).height}
            onConfirm={handleSubmit}
            confirmLabel="Confirmar Visual"
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
