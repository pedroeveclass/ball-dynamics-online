-- ═══════════════════════════════════════════════════════════
-- Batch position update RPC: update multiple participant
-- positions in a single DB call instead of N individual updates
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_update_participant_positions(
  p_updates JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.match_participants mp
     SET pos_x = (u->>'x')::NUMERIC,
         pos_y = (u->>'y')::NUMERIC
    FROM jsonb_array_elements(p_updates) AS u
   WHERE mp.id = (u->>'id')::UUID;
END;
$$;
