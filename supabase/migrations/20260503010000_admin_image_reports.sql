-- Admin tooling for the image-report queue. Two pieces:
--
-- 1. Storage policy that lets admins delete any uploaded background so
--    inappropriate files can be purged from the bucket.
-- 2. RPC that resolves a report — either 'remove' (deactivate the related
--    purchase and tag the report as 'actioned') or 'dismiss' (tag the
--    report as 'dismissed' without touching the purchase).

DROP POLICY IF EXISTS "Admins can delete any background" ON storage.objects;
CREATE POLICY "Admins can delete any background"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'player-backgrounds' AND public.is_admin_caller()
  );

CREATE OR REPLACE FUNCTION public.admin_action_image_report(
  p_report_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report RECORD;
BEGIN
  IF NOT public.is_admin_caller() THEN
    RETURN jsonb_build_object('error', 'Apenas administradores podem agir em reportes.');
  END IF;

  IF p_action NOT IN ('remove', 'dismiss') THEN
    RETURN jsonb_build_object('error', 'Ação inválida.');
  END IF;

  SELECT * INTO v_report FROM image_reports WHERE id = p_report_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reporte não encontrado ou já foi revisado.');
  END IF;

  IF p_action = 'remove' THEN
    -- Deactivate the offending background purchase. Keeping the row with
    -- status='replaced' preserves audit history; the avatar reader filters
    -- on status IN ('active', 'cancelling') so the visual instantly clears.
    -- Other pending reports for the same player are auto-dismissed since
    -- the offending content is gone.
    IF v_report.reported_purchase_id IS NOT NULL THEN
      UPDATE store_purchases
      SET status = 'replaced'
      WHERE id = v_report.reported_purchase_id;
    END IF;

    UPDATE image_reports
    SET status = 'actioned',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        reviewer_note = NULLIF(TRIM(p_note), '')
    WHERE id = p_report_id;

    UPDATE image_reports
    SET status = 'dismissed',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        reviewer_note = 'Auto-dismissed: another report on the same player was actioned'
    WHERE reported_player_profile_id = v_report.reported_player_profile_id
      AND status = 'pending'
      AND id != p_report_id;

    RETURN jsonb_build_object('success', true, 'message', 'Imagem removida.', 'image_url', (
      SELECT bg_image_url FROM store_purchases WHERE id = v_report.reported_purchase_id
    ));
  ELSE
    UPDATE image_reports
    SET status = 'dismissed',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        reviewer_note = NULLIF(TRIM(p_note), '')
    WHERE id = p_report_id;

    RETURN jsonb_build_object('success', true, 'message', 'Reporte descartado.');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_action_image_report(UUID, TEXT, TEXT) TO authenticated;
