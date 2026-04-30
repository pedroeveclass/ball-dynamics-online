-- ═══════════════════════════════════════════════════════════
-- Engine perf overhaul (2026-04-30)
-- ───────────────────────────────────────────────────────────
-- Adds RPCs that collapse multiple round-trips done by
-- match-engine-lab into single calls:
--   1. cache_engine_skeleton: persist enrichedParticipants
--      immutable fields (slot/name/positions) into matches.engine_cache
--      so subsequent ticks skip the lineup_slots + player_profiles
--      sequential SELECTs in enrichParticipantsWithSlotPosition.
--   2. advance_match_phase: atomic UPDATE matches.current_phase
--      + INSERT match_turns for the next phase, single round-trip.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. cache_engine_skeleton ────────────────────────────────
-- Merges the skeleton into engine_cache without clobbering other
-- keys (attrByProfile, clubSettings, lineupRoles, etc.).
CREATE OR REPLACE FUNCTION public.cache_engine_skeleton(
  p_match_id UUID,
  p_skeleton JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE matches
  SET engine_cache = jsonb_set(
    COALESCE(engine_cache, '{}'::jsonb),
    '{enrichedSkeleton}',
    COALESCE(p_skeleton, 'null'::jsonb),
    true
  )
  WHERE id = p_match_id;
$$;

GRANT EXECUTE ON FUNCTION public.cache_engine_skeleton(UUID, JSONB) TO service_role;

-- ─── 2. advance_match_phase ──────────────────────────────────
-- Atomic combo: UPDATE matches.current_phase + INSERT match_turns
-- in a single transaction (one round-trip from edge function).
-- Returns the inserted match_turns row.
CREATE OR REPLACE FUNCTION public.advance_match_phase(
  p_match_id UUID,
  p_next_phase TEXT,
  p_turn_number INT,
  p_possession_club_id UUID,
  p_ball_holder_participant_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_set_piece_type TEXT,
  p_ball_x NUMERIC DEFAULT NULL,
  p_ball_y NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  inserted_id UUID,
  inserted_phase TEXT,
  inserted_turn_number INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  UPDATE matches SET current_phase = p_next_phase WHERE id = p_match_id;

  INSERT INTO match_turns (
    match_id, turn_number, phase,
    possession_club_id, ball_holder_participant_id,
    started_at, ends_at, status, set_piece_type,
    ball_x, ball_y
  ) VALUES (
    p_match_id, p_turn_number, p_next_phase,
    p_possession_club_id, p_ball_holder_participant_id,
    p_started_at, p_ends_at, 'active', p_set_piece_type,
    p_ball_x, p_ball_y
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, p_next_phase, p_turn_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_match_phase(UUID, TEXT, INT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, NUMERIC, NUMERIC) TO service_role;

-- ─── 3. resolve_turn_with_events ─────────────────────────────
-- Atomic token-guarded resolve: UPDATE match_turns to status='resolved'
-- conditional on processing_token match, then INSERT match_event_logs in
-- the same transaction. Preserves the existing invariant that event_log
-- inserts MUST happen AFTER the token-guarded resolve (a token-loser tick
-- never inserts duplicates because the UPDATE returns 0 rows and the
-- INSERT block is skipped).
--
-- Returns:
--   resolved BOOLEAN  — true if this caller won the token race
--   inserted_count INT — number of event rows persisted
CREATE OR REPLACE FUNCTION public.resolve_turn_with_events(
  p_turn_id UUID,
  p_processing_token TEXT,
  p_resolution_script JSONB,
  p_events JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  resolved BOOLEAN,
  inserted_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_won BOOLEAN := FALSE;
  v_match_id UUID;
  v_inserted INT := 0;
BEGIN
  UPDATE match_turns
     SET status              = 'resolved',
         resolved_at         = NOW(),
         resolution_script   = p_resolution_script
   WHERE id                  = p_turn_id
     AND processing_token    = p_processing_token
   RETURNING match_id INTO v_match_id;

  IF v_match_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  v_won := TRUE;

  IF p_events IS NOT NULL AND jsonb_typeof(p_events) = 'array' AND jsonb_array_length(p_events) > 0 THEN
    INSERT INTO match_event_logs (match_id, event_type, title, body, payload)
    SELECT v_match_id,
           e->>'event_type',
           COALESCE(e->>'title', ''),
           COALESCE(e->>'body', ''),
           e->'payload'
      FROM jsonb_array_elements(p_events) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_won, v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_turn_with_events(UUID, TEXT, JSONB, JSONB) TO service_role;
