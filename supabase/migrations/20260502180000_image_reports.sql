-- Lets any authenticated viewer flag a player's uploaded background image
-- as inappropriate. Reports go to a queue table for the admin to review.
-- Combined with NSFWJS in the client, this gives us the third moderation
-- layer (community-driven) on top of the AI filter.

CREATE TABLE IF NOT EXISTS public.image_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  reported_purchase_id UUID REFERENCES public.store_purchases(id) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note TEXT
);

CREATE INDEX IF NOT EXISTS image_reports_status_idx ON public.image_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS image_reports_player_idx ON public.image_reports (reported_player_profile_id);

ALTER TABLE public.image_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporter reads own reports" ON public.image_reports;
CREATE POLICY "Reporter reads own reports" ON public.image_reports FOR SELECT
  USING (reporter_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all reports" ON public.image_reports;
CREATE POLICY "Admins read all reports" ON public.image_reports FOR SELECT
  USING (public.is_admin_caller());

DROP POLICY IF EXISTS "Admins update reports" ON public.image_reports;
CREATE POLICY "Admins update reports" ON public.image_reports FOR UPDATE
  USING (public.is_admin_caller());

-- Reports themselves are inserted via the SECURITY DEFINER RPC below, so
-- no INSERT policy is needed for the table.

CREATE OR REPLACE FUNCTION public.report_player_background(
  p_player_profile_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id UUID;
  v_existing INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Faça login para reportar.');
  END IF;

  -- Find the active background purchase carrying an image so the report
  -- has a concrete target. Pure-color or pattern backgrounds aren't
  -- reportable (nothing user-supplied to moderate).
  SELECT sp.id INTO v_purchase_id
  FROM store_purchases sp
  JOIN store_items si ON si.id = sp.store_item_id
  WHERE sp.player_profile_id = p_player_profile_id
    AND sp.status IN ('active', 'cancelling')
    AND sp.bg_image_url IS NOT NULL
    AND si.name IN ('Fundo do Visual', 'Visual Background')
  LIMIT 1;

  IF v_purchase_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Esse jogador não tem imagem de fundo para reportar.');
  END IF;

  -- Rate-limit: at most one pending report per (reporter, player) pair so
  -- one user can't spam the queue. They can still report again after the
  -- previous report is reviewed.
  SELECT COUNT(*) INTO v_existing
  FROM image_reports
  WHERE reporter_user_id = auth.uid()
    AND reported_player_profile_id = p_player_profile_id
    AND status = 'pending';

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('error', 'Você já reportou esse jogador. Aguarde a revisão.');
  END IF;

  INSERT INTO image_reports (reporter_user_id, reported_player_profile_id, reported_purchase_id, reason)
  VALUES (auth.uid(), p_player_profile_id, v_purchase_id, NULLIF(TRIM(p_reason), ''));

  RETURN jsonb_build_object('success', true, 'message', 'Reporte enviado. Obrigado!');
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_player_background(UUID, TEXT) TO authenticated;
