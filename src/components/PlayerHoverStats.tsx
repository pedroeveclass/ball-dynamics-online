import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { PositionBadge } from '@/components/PositionBadge';
import { ATTR_LABELS, getAttributeTier } from '@/lib/attributes';
import type { Tables } from '@/integrations/supabase/types';

interface MinimalPlayer {
  id: string;
  full_name: string;
  primary_position: string;
  secondary_position: string | null;
  archetype: string;
  overall: number;
}

interface PlayerHoverStatsProps {
  player: MinimalPlayer | null | undefined;
  attrs: Tables<'player_attributes'> | null | undefined;
  children: ReactNode;
  /** Tailwind side hint for HoverCardContent (defaults to 'right'). */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

const FIELD_GROUPS: Array<{ title: string; keys: readonly string[] }> = [
  { title: 'Físico', keys: ['velocidade', 'aceleracao', 'agilidade', 'forca', 'stamina', 'resistencia'] },
  { title: 'Técnico', keys: ['controle_bola', 'drible', 'passe_baixo', 'passe_alto', 'um_toque', 'curva'] },
  { title: 'Chute / Cabeceio', keys: ['acuracia_chute', 'forca_chute', 'cabeceio'] },
  { title: 'Defensivo', keys: ['marcacao', 'desarme', 'posicionamento_defensivo', 'antecipacao'] },
  { title: 'Mental', keys: ['visao_jogo', 'tomada_decisao', 'posicionamento_ofensivo'] },
];

const GK_GROUPS: Array<{ title: string; keys: readonly string[] }> = [
  { title: 'Goleiro', keys: ['reflexo', 'posicionamento_gol', 'defesa_aerea', 'pegada', 'saida_gol', 'um_contra_um', 'tempo_reacao', 'comando_area'] },
  { title: 'Distribuição', keys: ['distribuicao_curta', 'distribuicao_longa'] },
  { title: 'Físico', keys: ['pulo', 'agilidade', 'forca', 'equilibrio'] },
];

function AttrRow({ label, value }: { label: string; value: number }) {
  const tier = getAttributeTier(value);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className={`font-display font-bold ${tier.color}`}>{Math.round(value)}</span>
    </div>
  );
}

export function PlayerHoverStats({ player, attrs, children, side = 'right' }: PlayerHoverStatsProps) {
  if (!player) return <>{children}</>;
  const isGK = player.primary_position === 'GK';
  const groups = isGK ? GK_GROUPS : FIELD_GROUPS;

  return (
    <HoverCard openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} sideOffset={8} className="w-80 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
            <span className="font-display text-base font-bold text-primary-foreground">
              {player.full_name[0]}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold">{player.full_name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <PositionBadge position={player.primary_position} />
              {player.secondary_position && <PositionBadge position={player.secondary_position} />}
              <span className="truncate text-[10px] text-muted-foreground">{player.archetype}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-xl font-extrabold text-tactical leading-none">{player.overall}</div>
            <div className="text-[10px] text-muted-foreground">OVR</div>
          </div>
        </div>

        {attrs ? (
          <div className="mt-3 space-y-2.5">
            {groups.map(g => (
              <div key={g.title}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {g.keys.map(k => {
                    const raw = attrs[k as keyof Tables<'player_attributes'>];
                    const value = typeof raw === 'number' ? raw : 0;
                    return <AttrRow key={k} label={ATTR_LABELS[k] || k} value={value} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-center text-xs text-muted-foreground">Atributos não disponíveis.</div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
