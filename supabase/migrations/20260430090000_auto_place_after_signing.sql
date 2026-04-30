-- ──────────────────────────────────────────────────────────────────
-- auto_place_after_signing
--
-- Run right after a free agent signs with a bot-managed club via
-- transfer_player. Two effects, both atomic:
--
--   1. Best-fit starter slot — pick the lineup_slot with the smallest
--      positional penalty for this player among slots currently held by
--      a bot, then move the player there (the bot is displaced and can
--      be re-balanced later by the assistant).
--
--   2. First-human-as-assistant — if the club is bot-managed and has no
--      assistant yet, set assistant_manager_id to the new player's
--      user_id so they can edit the lineup themselves.
--
-- Mirrors src/lib/positions.ts:positionalPenaltyPercent — same groups,
-- same matrix (0/5/10/15/20). Returns a small JSONB summary so the
-- client can react (toast text, refresh hint).
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_place_after_signing(
  p_player_id UUID,
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos TEXT;
  v_secondary TEXT;
  v_user_id UUID;
  v_lineup_id UUID;
  v_player_group INT;
  v_is_bot_managed BOOLEAN;
  v_existing_assistant UUID;
  v_existing_head_manager UUID;
  v_assistant_assigned BOOLEAN := FALSE;
  v_best_slot_id UUID := NULL;
  v_best_penalty INT := 999;
  v_displaced_player_id UUID := NULL;
  v_placed_position TEXT := NULL;
  slot RECORD;
  v_clean TEXT;
  v_slot_group INT;
  v_penalty INT;
BEGIN
  IF p_player_id IS NULL OR p_club_id IS NULL THEN
    RETURN jsonb_build_object('placed', false, 'assistant_assigned', false, 'reason', 'missing_args');
  END IF;

  -- Player info. Bots have user_id IS NULL, in which case we no-op.
  SELECT primary_position, secondary_position, user_id
    INTO v_pos, v_secondary, v_user_id
    FROM player_profiles
   WHERE id = p_player_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('placed', false, 'assistant_assigned', false, 'reason', 'bot_player');
  END IF;

  -- Active lineup. Several lineups can technically have is_active=true;
  -- we pick the most recent. If there is none, skip the slot-swap step
  -- (the assistant promotion still runs).
  SELECT id INTO v_lineup_id
    FROM lineups
   WHERE club_id = p_club_id::TEXT
     AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1;

  -- Player's positional group (mirrors src/lib/positions.ts POSITION_GROUP).
  v_player_group := CASE upper(coalesce(v_pos, ''))
    WHEN 'GK' THEN 0
    WHEN 'CB' THEN 1 WHEN 'LB' THEN 1 WHEN 'RB' THEN 1
    WHEN 'LWB' THEN 1 WHEN 'RWB' THEN 1
    WHEN 'DM' THEN 2 WHEN 'CDM' THEN 2 WHEN 'CM' THEN 2
    WHEN 'CAM' THEN 2 WHEN 'LM' THEN 2 WHEN 'RM' THEN 2
    WHEN 'LW' THEN 3 WHEN 'RW' THEN 3 WHEN 'ST' THEN 3 WHEN 'CF' THEN 3
    ELSE 2
  END;

  IF v_lineup_id IS NOT NULL AND v_pos IS NOT NULL THEN
    -- Only consider slots currently held by a BOT (occupant.user_id IS NULL),
    -- so we never kick a human teammate out of the starting XI.
    FOR slot IN
      SELECT ls.id, ls.slot_position, ls.player_profile_id, pp.user_id AS occupant_user_id
        FROM lineup_slots ls
        LEFT JOIN player_profiles pp ON pp.id = ls.player_profile_id
       WHERE ls.lineup_id = v_lineup_id
         AND ls.role_type = 'starter'
    LOOP
      IF slot.occupant_user_id IS NOT NULL THEN CONTINUE; END IF;

      v_clean := upper(regexp_replace(coalesce(slot.slot_position, ''), '[0-9]+$', ''));

      IF v_clean = upper(v_pos)
         OR (v_secondary IS NOT NULL AND v_clean = upper(v_secondary))
      THEN
        v_penalty := 0;
      ELSE
        v_slot_group := CASE v_clean
          WHEN 'GK' THEN 0
          WHEN 'CB' THEN 1 WHEN 'LB' THEN 1 WHEN 'RB' THEN 1
          WHEN 'LWB' THEN 1 WHEN 'RWB' THEN 1
          WHEN 'DM' THEN 2 WHEN 'CDM' THEN 2 WHEN 'CM' THEN 2
          WHEN 'CAM' THEN 2 WHEN 'LM' THEN 2 WHEN 'RM' THEN 2
          WHEN 'LW' THEN 3 WHEN 'RW' THEN 3 WHEN 'ST' THEN 3 WHEN 'CF' THEN 3
          ELSE NULL
        END;

        IF v_slot_group IS NULL THEN
          v_penalty := 999; -- unknown slot tag → never pick it
        ELSIF v_slot_group = v_player_group THEN
          v_penalty := 5;
        ELSE
          v_penalty := abs(v_slot_group - v_player_group) * 5 + 5; -- 10/15/20
        END IF;
      END IF;

      IF v_penalty < v_best_penalty THEN
        v_best_penalty := v_penalty;
        v_best_slot_id := slot.id;
        v_displaced_player_id := slot.player_profile_id;
        v_placed_position := slot.slot_position;
      END IF;

      EXIT WHEN v_penalty = 0;  -- perfect fit, stop searching
    END LOOP;

    -- Defensive: drop any pre-existing slot for this player in the same
    -- lineup (UNIQUE(lineup_id, player_profile_id) would block the swap
    -- otherwise — e.g. if the player got bench-seeded by some other path).
    IF v_best_slot_id IS NOT NULL THEN
      DELETE FROM lineup_slots
       WHERE lineup_id = v_lineup_id
         AND player_profile_id = p_player_id
         AND id <> v_best_slot_id;

      UPDATE lineup_slots
         SET player_profile_id = p_player_id
       WHERE id = v_best_slot_id;
    END IF;
  END IF;

  -- Auto-assistant: only for bot-managed clubs without an existing
  -- assistant. Head-managed clubs keep their workflow untouched (the
  -- human manager picks their assistant).
  SELECT is_bot_managed, assistant_manager_id, manager_profile_id
    INTO v_is_bot_managed, v_existing_assistant, v_existing_head_manager
    FROM clubs
   WHERE id = p_club_id;

  IF coalesce(v_is_bot_managed, false) = true
     AND v_existing_assistant IS NULL
     AND v_existing_head_manager IS NULL
  THEN
    UPDATE clubs
       SET assistant_manager_id = v_user_id,
           updated_at = now()
     WHERE id = p_club_id
       AND assistant_manager_id IS NULL;  -- belt-and-suspenders against races
    v_assistant_assigned := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'placed', v_best_slot_id IS NOT NULL,
    'placed_position', v_placed_position,
    'penalty', CASE WHEN v_best_slot_id IS NOT NULL THEN v_best_penalty ELSE NULL END,
    'displaced_player_id', v_displaced_player_id,
    'assistant_assigned', v_assistant_assigned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_place_after_signing(UUID, UUID) TO authenticated;
