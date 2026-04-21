-- ═══════════════════════════════════════════════════════════
-- Merge CDM into DM for user-facing surfaces.
--
-- "Volante" (DM) and "Volante Defensivo" (CDM) had identical position
-- profiles and identical caps — the distinction existed in the schema
-- but never behaved differently. The UI was showing two buttons for
-- what players perceive as the same role.
--
-- UI now offers only DM; this migration backfills state to match:
--   • Human-owned players with CDM become DM (primary and secondary).
--   • club_position_demand rows with CDM become DM (dedup via
--     ON CONFLICT so clubs that already had DM marked don't break the
--     UNIQUE(club_id, position) constraint).
--
-- Bots keep their CDM label; formations and the match engine still
-- accept CDM so existing lineups don't need a one-time rewrite. No
-- CHECK constraint changes here.
-- ═══════════════════════════════════════════════════════════

-- Merge CDM demand into DM (preserves existing DM rows on conflict).
INSERT INTO public.club_position_demand (club_id, position, priority, notes, created_at, updated_at)
SELECT club_id, 'DM', priority, notes, created_at, updated_at
FROM public.club_position_demand
WHERE position = 'CDM'
ON CONFLICT (club_id, position) DO NOTHING;

DELETE FROM public.club_position_demand WHERE position = 'CDM';

-- Migrate human players from CDM to DM.
UPDATE public.player_profiles
   SET primary_position = 'DM'
 WHERE primary_position = 'CDM'
   AND user_id IS NOT NULL;

UPDATE public.player_profiles
   SET secondary_position = 'DM'
 WHERE secondary_position = 'CDM'
   AND user_id IS NOT NULL;
