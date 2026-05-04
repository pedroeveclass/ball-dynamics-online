-- ─────────────────────────────────────────────────────────────
-- Admins can read every store_purchases row (image-report queue)
-- ─────────────────────────────────────────────────────────────
-- The /admin Reportes tab joins image_reports → store_purchases to
-- show a preview of the offending bg image. RLS today only allows
-- the buyer or their club's manager to read, so admins see "sem
-- imagem" even with the report row in front of them.

DROP POLICY IF EXISTS "Admins read all purchases" ON public.store_purchases;
CREATE POLICY "Admins read all purchases" ON public.store_purchases
  FOR SELECT USING (public.is_admin_caller());
