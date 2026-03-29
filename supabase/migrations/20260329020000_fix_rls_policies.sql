-- ============================================================
-- Migration: Fix overly permissive RLS policies
-- Replaces open (USING true / WITH CHECK true) policies with
-- proper ownership checks or service_role-only access.
-- ============================================================

-- ─── HELPER: return all player_profile IDs for the current user ─
-- (supports users with multiple profiles in the future)

CREATE OR REPLACE FUNCTION public.current_user_player_profile_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.player_profiles WHERE user_id = auth.uid();
$$;


-- ═══════════════════════════════════════════════════════════════
-- 1. LOANS
-- ═══════════════════════════════════════════════════════════════

-- Drop the old open policies
DROP POLICY IF EXISTS "Read own loans"      ON public.loans;
DROP POLICY IF EXISTS "Create loans"        ON public.loans;
DROP POLICY IF EXISTS "Update loans"        ON public.loans;

-- SELECT: user can see loans for their player_profile OR their managed club
CREATE POLICY "Read own loans" ON public.loans
  FOR SELECT
  TO authenticated
  USING (
    player_profile_id IN (SELECT public.current_user_player_profile_ids())
    OR club_id = public.current_user_managed_club_id()
  );

-- INSERT: service_role only (loans created via RPC / Edge Functions)
CREATE POLICY "Service insert loans" ON public.loans
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (loan payments processed via RPC / Edge Functions)
CREATE POLICY "Service update loans" ON public.loans
  FOR UPDATE
  TO service_role
  USING (true);


-- ═══════════════════════════════════════════════════════════════
-- 2. STORE_PURCHASES
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Read own purchases"   ON public.store_purchases;
DROP POLICY IF EXISTS "Create purchases"     ON public.store_purchases;
DROP POLICY IF EXISTS "Update purchases"     ON public.store_purchases;

-- SELECT: user can only see their own purchases (user_id column matches)
CREATE POLICY "Read own purchases" ON public.store_purchases
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- INSERT: service_role only (purchases created via RPC after payment validation)
CREATE POLICY "Service insert purchases" ON public.store_purchases
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: service_role only (status changes via RPC)
CREATE POLICY "Service update purchases" ON public.store_purchases
  FOR UPDATE
  TO service_role
  USING (true);


-- ═══════════════════════════════════════════════════════════════
-- 3. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════

-- The original INSERT policy ("Users can insert own notifications") was already
-- dropped by the 20260315174400 migration and replaced with an open one.
-- Drop the open replacement and create a proper policy.

DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

-- INSERT: user can only insert notifications targeting themselves,
-- OR service_role can insert any (for system / manager-to-player notifications).
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service insert notifications" ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Keep existing SELECT and UPDATE policies (already scoped to user_id = auth.uid())


-- ═══════════════════════════════════════════════════════════════
-- 4. MATCH_SNAPSHOTS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service can insert snapshots" ON public.match_snapshots;

-- INSERT: service_role only (match engine writes snapshots)
CREATE POLICY "Service insert snapshots" ON public.match_snapshots
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Keep the public SELECT policy ("Public read snapshots") for replay viewing


-- ═══════════════════════════════════════════════════════════════
-- 5. CONTRACT_MUTUAL_AGREEMENTS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Read own mutual agreements"   ON public.contract_mutual_agreements;
DROP POLICY IF EXISTS "Create mutual agreements"     ON public.contract_mutual_agreements;
DROP POLICY IF EXISTS "Update mutual agreements"     ON public.contract_mutual_agreements;

-- SELECT: user can see agreements on contracts where they are the player OR the club manager
CREATE POLICY "Read own mutual agreements" ON public.contract_mutual_agreements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_mutual_agreements.contract_id
        AND (
          c.player_profile_id = public.current_user_player_profile_id()
          OR c.club_id = public.current_user_managed_club_id()::text
        )
    )
  );

-- INSERT: only the involved player or club manager can request a mutual agreement
CREATE POLICY "Create mutual agreements" ON public.contract_mutual_agreements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_mutual_agreements.contract_id
        AND (
          c.player_profile_id = public.current_user_player_profile_id()
          OR c.club_id = public.current_user_managed_club_id()::text
        )
    )
  );

-- UPDATE: only the OTHER party on the contract can accept/reject
-- (the requester should not be able to accept their own request)
CREATE POLICY "Update mutual agreements" ON public.contract_mutual_agreements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_mutual_agreements.contract_id
        AND (
          c.player_profile_id = public.current_user_player_profile_id()
          OR c.club_id = public.current_user_managed_club_id()::text
        )
    )
  );
