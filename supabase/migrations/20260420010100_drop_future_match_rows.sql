-- Clean up pre-created future matches so the new 5min-before flow owns them
DO $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT array_agg(m.id) INTO v_ids
    FROM public.matches m
    JOIN public.league_matches lm ON lm.match_id = m.id
    JOIN public.league_rounds  lr ON lr.id = lm.round_id
   WHERE m.status = 'scheduled'
     AND lr.scheduled_at > now();

  IF v_ids IS NULL THEN
    RAISE NOTICE '[CLEANUP] No future scheduled matches to drop';
    RETURN;
  END IF;

  -- FK-safe order (all should be empty for future matches, defensive):
  DELETE FROM public.match_actions ma USING public.match_turns mt
    WHERE ma.match_turn_id = mt.id AND mt.match_id = ANY(v_ids);
  DELETE FROM public.match_turns        WHERE match_id = ANY(v_ids);
  DELETE FROM public.match_event_logs   WHERE match_id = ANY(v_ids);
  DELETE FROM public.match_participants WHERE match_id = ANY(v_ids);
  DELETE FROM public.match_chat_messages WHERE match_id = ANY(v_ids);
  DELETE FROM public.match_snapshots    WHERE match_id = ANY(v_ids);
  UPDATE public.league_matches SET match_id = NULL WHERE match_id = ANY(v_ids);
  DELETE FROM public.matches WHERE id = ANY(v_ids);

  RAISE NOTICE '[CLEANUP] Dropped % future matches', array_length(v_ids, 1);
END $$;
