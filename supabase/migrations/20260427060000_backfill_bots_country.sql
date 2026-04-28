-- ═══════════════════════════════════════════════════════════
-- Backfill country_code for bot players + managers using the
-- club's country (already 'BR' for all current clubs).
--
-- Free-agent bots (no club) stay 'BR' (default). Future foreign
-- leagues will create clubs with the right country and new bot
-- players will inherit it.
-- ═══════════════════════════════════════════════════════════

-- Bot players in clubs → inherit club country
UPDATE public.player_profiles p
SET country_code = upper(coalesce(c.country, 'BR'))
FROM public.clubs c
WHERE p.club_id::text = c.id::text
  AND p.user_id IS NULL
  AND (p.country_code IS NULL OR p.country_code = 'BR');

-- Bot managers → inherit club country (clubs.manager_profile_id back-reference)
UPDATE public.manager_profiles m
SET country_code = upper(coalesce(c.country, 'BR'))
FROM public.clubs c
WHERE c.manager_profile_id = m.id
  AND (m.country_code IS NULL OR m.country_code = 'BR');

-- Validate FK: any country we just wrote that isn't seeded gets bumped to BR
UPDATE public.player_profiles SET country_code = 'BR'
  WHERE NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = country_code);
UPDATE public.manager_profiles SET country_code = 'BR'
  WHERE NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = country_code);
