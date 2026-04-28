-- ═══════════════════════════════════════════════════════════
-- Batch energy update RPC: update match_energy for many
-- participants in a single round-trip instead of N parallel
-- UPDATEs. Each player has a distinct energy value computed
-- per-tick, so the input is an array of {id, energy}.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_update_match_energy(
  p_updates JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.match_participants mp
     SET match_energy = (u->>'energy')::NUMERIC
    FROM jsonb_array_elements(p_updates) AS u
   WHERE mp.id = (u->>'id')::UUID;
END;
$$;
