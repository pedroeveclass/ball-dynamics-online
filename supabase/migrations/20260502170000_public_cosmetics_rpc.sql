-- Cosmetic state must be readable on the public player page (where the
-- viewer isn't the player's owner). The base RLS on store_purchases only
-- allows the row owner + the player's club manager to SELECT, so direct
-- queries from PublicPlayerPage return nothing for everyone else.
--
-- This RPC bypasses that with SECURITY DEFINER and exposes ONLY the visual
-- columns (color/color2/color3/side/bg_variant/bg_image_url) plus the item
-- name+category needed to identify each slot. Bonus values, expires_at,
-- last_used_at and other competitive-sensitive fields stay private.

CREATE OR REPLACE FUNCTION public.get_player_cosmetics_public(p_player_profile_id UUID)
RETURNS TABLE (
  store_item_id UUID,
  color TEXT,
  color2 TEXT,
  color3 TEXT,
  side TEXT,
  bg_variant TEXT,
  bg_image_url TEXT,
  item_name TEXT,
  item_name_pt TEXT,
  item_name_en TEXT,
  item_category TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sp.store_item_id,
    sp.color,
    sp.color2,
    sp.color3,
    sp.side,
    sp.bg_variant,
    sp.bg_image_url,
    si.name AS item_name,
    si.name_pt AS item_name_pt,
    si.name_en AS item_name_en,
    si.category AS item_category
  FROM public.store_purchases sp
  JOIN public.store_items si ON si.id = sp.store_item_id
  WHERE sp.player_profile_id = p_player_profile_id
    AND sp.status IN ('active', 'cancelling')
    AND si.category IN ('boots', 'gloves', 'cosmetic');
$$;

GRANT EXECUTE ON FUNCTION public.get_player_cosmetics_public(UUID) TO authenticated, anon;
