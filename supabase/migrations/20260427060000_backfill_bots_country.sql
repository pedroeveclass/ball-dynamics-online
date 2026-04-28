-- ═══════════════════════════════════════════════════════════
-- Backfill country_code for bot players + managers using the
-- league's country (clubs themselves don't store a country —
-- they inherit it from their league row). All current leagues
-- are 'BR'.
--
-- Free-agent bots (no club) stay 'BR' (default). Future foreign
-- leagues will create clubs whose league has the right country
-- and new bot players will inherit it.
-- ═══════════════════════════════════════════════════════════

-- Bot players in clubs → inherit league country via clubs.league_id
UPDATE public.player_profiles p
SET country_code = upper(coalesce(l.country, 'BR'))
FROM public.clubs c
LEFT JOIN public.leagues l ON l.id = c.league_id
WHERE p.club_id::text = c.id::text
  AND p.user_id IS NULL
  AND (p.country_code IS NULL OR p.country_code = 'BR');

-- Bot managers → inherit league country via the club they manage
UPDATE public.manager_profiles m
SET country_code = upper(coalesce(l.country, 'BR'))
FROM public.clubs c
LEFT JOIN public.leagues l ON l.id = c.league_id
WHERE c.manager_profile_id = m.id
  AND (m.country_code IS NULL OR m.country_code = 'BR');

-- Validate FK: any country we just wrote that isn't seeded gets bumped to BR
UPDATE public.player_profiles SET country_code = 'BR'
  WHERE NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = country_code);
UPDATE public.manager_profiles SET country_code = 'BR'
  WHERE NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = country_code);
