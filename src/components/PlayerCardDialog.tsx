import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttributeBar } from '@/components/AttributeBar';
import { PositionBadge } from '@/components/PositionBadge';
import { EnergyBar } from '@/components/EnergyBar';
import { CountryFlag } from '@/components/CountryFlag';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { ATTR_LABELS, ATTRIBUTE_CATEGORIES, archetypeLabel, attrCategoryLabel } from '@/lib/attributes';
import { getCountry, getCountryName } from '@/lib/countries';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface PlayerCardDialogProps {
  playerId: string | null;
  onClose: () => void;
  clubName?: string;
}

type PlayerProfileSummary = Pick<
  Tables<'player_profiles'>,
  'id' | 'full_name' | 'age' | 'primary_position' | 'secondary_position' | 'archetype' | 'overall' | 'dominant_foot' | 'reputation' | 'energy_current' | 'energy_max'
> & { country_code?: string | null };

const physicalKeys = ATTRIBUTE_CATEGORIES['Físico'];
const technicalKeys = ATTRIBUTE_CATEGORIES['Técnico'];
const mentalKeys = ATTRIBUTE_CATEGORIES['Mental'];
const shootingKeys = ATTRIBUTE_CATEGORIES['Chute'];
const gkKeys = ATTRIBUTE_CATEGORIES['Goleiro'];

function formatDominantFoot(foot: string, t: TFunction) {
  if (foot === 'right') return t('foot.right');
  if (foot === 'left') return t('foot.left');
  if (foot === 'both') return t('foot.both');
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
  const { t } = useTranslation('player_card');
  const [player, setPlayer] = useState<PlayerProfileSummary | null>(null);
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { current: lang } = useAppLanguage();

  useEffect(() => {
    if (!playerId) { setPlayer(null); setAttrs(null); return; }
    let active = true;
    setLoading(true); setError(null);

    (async () => {
      const [profileRes, attrsRes] = await Promise.all([
        supabase.from('player_profiles')
          .select('id, full_name, age, primary_position, secondary_position, archetype, overall, dominant_foot, reputation, energy_current, energy_max, country_code')
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
          <DialogTitle className="font-display text-xl">{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="stat-card py-10 text-center text-sm text-muted-foreground">{t('loading')}</div>
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
                  <h2 className="truncate font-display text-xl font-bold flex items-center gap-2">
                    {player.country_code && <CountryFlag code={player.country_code} size="sm" />}
                    <span className="truncate">{player.full_name}</span>
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PositionBadge position={player.primary_position} />
                    {player.secondary_position && <PositionBadge position={player.secondary_position} />}
                    <span className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground">{archetypeLabel(player.archetype)}</span>
                    {player.country_code && (() => {
                      const country = getCountry(player.country_code);
                      return country ? (
                        <span className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground">
                          {getCountryName(country, lang)}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="font-display text-4xl font-extrabold text-tactical">{player.overall}</span>
                  <p className="text-xs text-muted-foreground">{t('ovr')}</p>
                </div>
              </div>

              {/* Energy bar */}
              <EnergyBar current={player.energy_current} max={player.energy_max} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label={t('details.age')} value={t('details.age_value', { count: player.age })} />
                <DetailItem label={t('details.dominant_foot')} value={formatDominantFoot(player.dominant_foot, t)} />
                <DetailItem label={t('details.archetype')} value={archetypeLabel(player.archetype)} />
                <DetailItem label={t('details.reputation')} value={player.reputation.toString()} />
                <DetailItem label={t('details.primary_position')} value={player.primary_position} />
                <DetailItem label={t('details.secondary_position')} value={player.secondary_position || '-'} />
                {clubName && <DetailItem label={t('details.club')} value={clubName} />}
                <DetailItem label={t('details.energy')} value={`${player.energy_current}/${player.energy_max}`} />
              </div>
            </div>

            {attrs ? (
              <div className="grid gap-4 md:grid-cols-2">
                {isGK ? (
                  <>
                    <AttributeSection title={attrCategoryLabel('Goleiro')} keys={gkKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Físico')} keys={physicalKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Técnico')} keys={technicalKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Mental')} keys={mentalKeys} attrs={attrs} />
                  </>
                ) : (
                  <>
                    <AttributeSection title={attrCategoryLabel('Físico')} keys={physicalKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Técnico')} keys={technicalKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Mental')} keys={mentalKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Chute')} keys={shootingKeys} attrs={attrs} />
                    <AttributeSection title={attrCategoryLabel('Goleiro')} keys={gkKeys} attrs={attrs} />
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
