-- ──────────────────────────────────────────────────────────────────
-- Backfill secondary_position for every bot player.
--
-- Goal: a manager taking over a bot squad should be able to switch
-- between the 8 in-game formations (4-4-2, 4-3-3, 4-2-3-1, 3-5-2,
-- 3-4-3, 5-3-2, 5-4-1, 4-1-4-1) without losing attribute power on the
-- starting XI bots due to positional penalty.
--
-- The mapping below pairs each primary with the same-flank or
-- adjacent-role variant that unlocks the most formations:
--
--   • LB↔LWB / RB↔RWB — 4-back ↔ 3-/5-back transitions
--   • LM↔LW   / RM↔RW   — flat-mid ↔ wide-forward transitions
--   • CM↔CDM / CAM→CM   — vertical depth in midfield
--   • CB→CDM            — anchors a possession-style triple-pivot
--   • ST↔CF             — striker alias
--   • GK keeps NULL     — GKs only play GK
--
-- Only bots (user_id IS NULL) and only those without a secondary
-- already set, so any human/admin-tweaked secondary is preserved.
-- ──────────────────────────────────────────────────────────────────

-- Helper: canonical secondary for a given primary, used by both the
-- one-shot backfill below and the BEFORE INSERT trigger so future bot
-- creation paths (seeds, league-seed edge function, fill-empty cron)
-- inherit the same flexibility without changes.
CREATE OR REPLACE FUNCTION public.bot_default_secondary(p_primary TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(p_primary, ''))
    WHEN 'CB'  THEN 'CDM'
    WHEN 'LB'  THEN 'LWB'
    WHEN 'RB'  THEN 'RWB'
    WHEN 'LWB' THEN 'LB'
    WHEN 'RWB' THEN 'RB'
    WHEN 'DM'  THEN 'CM'
    WHEN 'CDM' THEN 'CM'
    WHEN 'CM'  THEN 'CDM'
    WHEN 'CAM' THEN 'CM'
    WHEN 'LM'  THEN 'LW'
    WHEN 'RM'  THEN 'RW'
    WHEN 'LW'  THEN 'LM'
    WHEN 'RW'  THEN 'RM'
    WHEN 'ST'  THEN 'CF'
    WHEN 'CF'  THEN 'ST'
    ELSE NULL  -- GK keeps NULL; unknown primaries skip
  END;
$$;

-- One-shot backfill of every existing bot.
UPDATE public.player_profiles
   SET secondary_position = public.bot_default_secondary(primary_position),
       updated_at = now()
 WHERE user_id IS NULL
   AND secondary_position IS NULL
   AND public.bot_default_secondary(primary_position) IS NOT NULL;

-- BEFORE INSERT trigger: any new bot row that arrives without a
-- secondary inherits the canonical mapping. Humans (user_id NOT NULL)
-- and rows that already specify a secondary are left untouched.
CREATE OR REPLACE FUNCTION public.player_profiles_default_bot_secondary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL
     AND NEW.secondary_position IS NULL
     AND NEW.primary_position IS NOT NULL
  THEN
    NEW.secondary_position := public.bot_default_secondary(NEW.primary_position);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_profiles_default_bot_secondary
  ON public.player_profiles;
CREATE TRIGGER trg_player_profiles_default_bot_secondary
  BEFORE INSERT ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.player_profiles_default_bot_secondary();
