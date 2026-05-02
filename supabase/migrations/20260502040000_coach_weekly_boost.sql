-- ═══════════════════════════════════════════════════════════
-- Coach Weekly Boost — replaces leveled coach_training
--
-- Manager picks ONE boost per ISO week (BRT). Locked once chosen,
-- resets at Monday 00:00 BRT. Old `coach_training` table is kept
-- for one release for rollback safety; engine + UI now read this
-- new table exclusively.
--
-- Boost types (7):
--   tactics         — −10% out-of-position penalty
--   formation       — +5% all attrs when using trained formation
--                     (boost_param = formation name)
--   fitness         — −10% stamina drain per turn
--   set_piece       — +15% precision on set pieces (deviation × 0.85)
--   mentality       — +10% mental attrs when team is losing
--   high_press      — +10% chance to steal ball
--   training_focus  — +10% gain on weekly training for one attribute
--                     category (boost_param = 'Físico'|'Técnico'|
--                     'Mental'|'Chute'|'Goleiro')
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coach_weekly_boost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  iso_week_start DATE NOT NULL,
  boost_type TEXT NOT NULL CHECK (boost_type IN (
    'tactics','formation','fitness','set_piece',
    'mentality','high_press','training_focus'
  )),
  boost_param TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, iso_week_start)
);

CREATE INDEX IF NOT EXISTS idx_coach_weekly_boost_club_week
  ON public.coach_weekly_boost(club_id, iso_week_start DESC);

ALTER TABLE public.coach_weekly_boost ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers see own coach weekly boosts" ON public.coach_weekly_boost;
CREATE POLICY "Managers see own coach weekly boosts" ON public.coach_weekly_boost
  FOR SELECT USING (
    public.current_user_can_edit_club(club_id)
  );

-- Helper: current ISO-week start in BRT (Monday 00:00 São Paulo).
CREATE OR REPLACE FUNCTION public.current_brt_week_start()
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')))::DATE;
$$;

-- RPC: pick this week's boost. INSERT-only (no upsert) — once locked, locked.
CREATE OR REPLACE FUNCTION public.set_weekly_coach_boost(
  p_club_id UUID,
  p_boost_type TEXT,
  p_boost_param TEXT DEFAULT NULL
) RETURNS public.coach_weekly_boost
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week DATE;
  v_existing public.coach_weekly_boost;
  v_row public.coach_weekly_boost;
  v_valid_formations TEXT[] := ARRAY['4-4-2','4-3-3','3-5-2','4-2-3-1','4-5-1','3-4-3','5-3-2','5-4-1'];
  v_valid_categories TEXT[] := ARRAY['Físico','Técnico','Mental','Chute','Goleiro'];
BEGIN
  IF NOT public.current_user_can_edit_club(p_club_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir este clube';
  END IF;

  IF p_boost_type NOT IN ('tactics','formation','fitness','set_piece','mentality','high_press','training_focus') THEN
    RAISE EXCEPTION 'Tipo de boost inválido: %', p_boost_type;
  END IF;

  -- Validate boost_param by type
  IF p_boost_type = 'formation' THEN
    IF p_boost_param IS NULL OR NOT (p_boost_param = ANY(v_valid_formations)) THEN
      RAISE EXCEPTION 'Formação inválida para boost de formação: %', COALESCE(p_boost_param, 'NULL');
    END IF;
  ELSIF p_boost_type = 'training_focus' THEN
    IF p_boost_param IS NULL OR NOT (p_boost_param = ANY(v_valid_categories)) THEN
      RAISE EXCEPTION 'Categoria inválida para foco de treino: %', COALESCE(p_boost_param, 'NULL');
    END IF;
  ELSE
    p_boost_param := NULL;
  END IF;

  v_week := public.current_brt_week_start();

  SELECT * INTO v_existing FROM public.coach_weekly_boost
   WHERE club_id = p_club_id AND iso_week_start = v_week;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'Boost da semana já escolhido. Próxima escolha libera segunda 00:00.';
  END IF;

  INSERT INTO public.coach_weekly_boost (club_id, iso_week_start, boost_type, boost_param)
  VALUES (p_club_id, v_week, p_boost_type, p_boost_param)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- RPC: read active boost for current BRT week. Returns NULL if none picked.
CREATE OR REPLACE FUNCTION public.get_active_coach_boost(p_club_id UUID)
RETURNS TABLE(
  boost_type TEXT,
  boost_param TEXT,
  iso_week_start DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cwb.boost_type, cwb.boost_param, cwb.iso_week_start
    FROM public.coach_weekly_boost cwb
   WHERE cwb.club_id = p_club_id
     AND cwb.iso_week_start = public.current_brt_week_start()
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.set_weekly_coach_boost(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_coach_boost(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_brt_week_start() TO authenticated, service_role;
