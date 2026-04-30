import { Plus, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ATTR_LABELS, type AttributeImpact } from '@/lib/attributes';

interface AttributeImpactChipsProps {
  impact: AttributeImpact;
  /** When true, hide the section labels ("Bônus" / "Limites") and just render the rows. */
  compact?: boolean;
}

/**
 * Compact two-row block summarising which attributes get a boost (green +)
 * and which get a cap/penalty (red -) for the currently-considered archetype
 * or height. Used in the onboarding archetype and height pickers so the
 * player can compare options before committing.
 */
export function AttributeImpactChips({ impact, compact = false }: AttributeImpactChipsProps) {
  const { t } = useTranslation('onboarding');
  const { boosts, penalties } = impact;
  if (boosts.length === 0 && penalties.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {boosts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {!compact && (
            <span className="text-[10px] font-display font-semibold text-emerald-500 mr-1 uppercase tracking-wide">
              {t('player.impact.boosts_label')}
            </span>
          )}
          {boosts.map(k => (
            <span
              key={`b-${k}`}
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-display font-semibold bg-emerald-500/15 text-emerald-500"
            >
              <Plus className="h-2.5 w-2.5" />
              {ATTR_LABELS[k] || k}
            </span>
          ))}
        </div>
      )}
      {penalties.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {!compact && (
            <span className="text-[10px] font-display font-semibold text-red-500 mr-1 uppercase tracking-wide">
              {t('player.impact.penalties_label')}
            </span>
          )}
          {penalties.map(k => (
            <span
              key={`p-${k}`}
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-display font-semibold bg-red-500/15 text-red-500"
            >
              <Minus className="h-2.5 w-2.5" />
              {ATTR_LABELS[k] || k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
