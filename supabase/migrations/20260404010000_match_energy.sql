-- ═══════════════════════════════════════════════════════════
-- Match Energy System: track per-player energy during matches
-- ═══════════════════════════════════════════════════════════

-- Add match_energy column to match_participants
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS match_energy NUMERIC NOT NULL DEFAULT 100;

-- Update the batch position RPC to also handle energy updates
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
         pos_y = (u->>'y')::NUMERIC,
         match_energy = COALESCE((u->>'energy')::NUMERIC, mp.match_energy)
    FROM jsonb_array_elements(p_updates) AS u
   WHERE mp.id = (u->>'id')::UUID;
END;
$$;
