import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttributeBar } from '@/components/AttributeBar';
import { PositionBadge } from '@/components/PositionBadge';
import { EnergyBar } from '@/components/EnergyBar';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { ATTR_LABELS, ATTRIBUTE_CATEGORIES } from '@/lib/attributes';

interface PlayerCardDialogProps {
  playerId: string | null;
  onClose: () => void;
  clubName?: string;
}

type PlayerProfileSummary = Pick<
  Tables<'player_profiles'>,
  'id' | 'full_name' | 'age' | 'primary_position' | 'secondary_position' | 'archetype' | 'overall' | 'dominant_foot' | 'reputation' | 'energy_current' | 'energy_max'
>;

const physicalKeys = ATTRIBUTE_CATEGORIES['Físico'];
const technicalKeys = ATTRIBUTE_CATEGORIES['Técnico'];
const mentalKeys = ATTRIBUTE_CATEGORIES['Mental'];
const shootingKeys = ATTRIBUTE_CATEGORIES['Chute'];
const gkKeys = ATTRIBUTE_CATEGORIES['Goleiro'];

function formatDominantFoot(foot: string) {
  if (foot === 'right') return 'Direito';
  if (foot === 'left') return 'Esquerdo';
  if (foot === 'both') return 'Ambos';
  return foot || '-';
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display font-bold text-foreground">{value}</p>
    </div>
  );
}

function AttributeSection({ title, keys, attrs }: { title: string; keys: readonly string[]; attrs: Tables<'player_attributes'> }) {
  return (
    <div className="stat-card space-y-3">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      <div className="space-y-2">
        {keys.map((key) => (
          <AttributeBar key={key} label={ATTR_LABELS[key] || key} value={Number(attrs[key as keyof Tables<'player_attributes'>] ?? 0)} showTier />
        ))}
      </div>
    </div>
  );
}

export function PlayerCardDialog({ playerId, onClose, clubName }: PlayerCardDialogProps) {
  const [player, setPlayer] = useState<PlayerProfileSummary | null>(null);
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) { setPlayer(null); setAttrs(null); return; }
    let active = true;
    setLoading(true); setError(null);

    (async () => {
      const [profileRes, attrsRes] = await Promise.all([
        supabase.from('player_profiles')
          .select('id, full_name, age, primary_position, secondary_position, archetype, overall, dominant_foot, reputation, energy_current, energy_max')
          .eq('id', playerId).maybeSingle(),
        supabase.from('player_attributes').select('*').eq('player_profile_id', playerId).maybeSingle(),
      ]);
      if (!active) return;
      if (profileRes.error || !profileRes.data) { setError('Não foi possível carregar a ficha.'); setLoading(false); return; }
      setPlayer(profileRes.data);
      setAttrs(attrsRes.data || null);
      if (!attrsRes.data) setError('Atributos não cadastrados.');
      setLoading(false);
    })();

    return () => { active = false; };
  }, [playerId]);

  const isGK = player?.primary_position === 'GK';

  return (
    <Dialog open={!!playerId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Ficha do Jogador</DialogTitle>
          <DialogDescription>Perfil técnico, estado físico e atributos.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="stat-card py-10 text-center text-sm text-muted-foreground">Carregando ficha...</div>
        ) : error && !player ? (
          <div className="stat-card py-10 text-center text-sm text-muted-foreground">{error}</div>
        ) : player ? (
          <div className="space-y-6">
            <div className="stat-card space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                  <span className="font-display text-2xl font-bold text-primary-foreground">{player.full_name[0]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-xl font-bold">{player.full_name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PositionBadge position={player.primary_position} />
                    {player.secondary_position && <PositionBadge position={player.secondary_position} />}
                    <span className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground">{player.archetype}</span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="font-display text-4xl font-extrabold text-tactical">{player.overall}</span>
                  <p className="text-xs text-muted-foreground">OVR</p>
                </div>
              </div>

              {/* Energy bar */}
              <EnergyBar current={player.energy_current} max={player.energy_max} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label="Idade" value={`${player.age} anos`} />
                <DetailItem label="Pé dominante" value={formatDominantFoot(player.dominant_foot)} />
                <DetailItem label="Arquétipo" value={player.archetype} />
                <DetailItem label="Reputação" value={player.reputation.toString()} />
                <DetailItem label="Posição principal" value={player.primary_position} />
                <DetailItem label="Posição secundária" value={player.secondary_position || '-'} />
                {clubName && <DetailItem label="Clube" value={clubName} />}
                <DetailItem label="Energia" value={`${player.energy_current}/${player.energy_max}`} />
              </div>
            </div>

            {attrs ? (
              <div className="grid gap-4 md:grid-cols-2">
                {isGK ? (
                  <>
                    <AttributeSection title="Goleiro" keys={gkKeys} attrs={attrs} />
                    <AttributeSection title="Físico" keys={physicalKeys} attrs={attrs} />
                    <AttributeSection title="Técnico" keys={technicalKeys} attrs={attrs} />
                    <AttributeSection title="Mental" keys={mentalKeys} attrs={attrs} />
                  </>
                ) : (
                  <>
                    <AttributeSection title="Físico" keys={physicalKeys} attrs={attrs} />
                    <AttributeSection title="Técnico" keys={technicalKeys} attrs={attrs} />
                    <AttributeSection title="Mental" keys={mentalKeys} attrs={attrs} />
                    <AttributeSection title="Chute" keys={shootingKeys} attrs={attrs} />
                    <AttributeSection title="Goleiro" keys={gkKeys} attrs={attrs} />
                  </>
                )}
              </div>
            ) : error ? (
              <div className="stat-card py-6 text-center text-sm text-muted-foreground">{error}</div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
