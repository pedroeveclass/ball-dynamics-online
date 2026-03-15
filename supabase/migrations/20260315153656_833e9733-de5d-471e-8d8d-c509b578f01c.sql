-- RLS stabilization patch: remove recursive policy chains and replace with minimal, non-recursive policies

-- Helper functions (SECURITY DEFINER to avoid policy recursion)
CREATE OR REPLACE FUNCTION public.current_user_player_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.player_profiles
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_manager_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.manager_profiles
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_managed_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.clubs
  WHERE manager_profile_id = public.current_user_manager_profile_id()
  ORDER BY created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_active_club_id_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN c.club_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN c.club_id::uuid
    ELSE NULL
  END
  FROM public.contracts c
  WHERE c.player_profile_id = public.current_user_player_profile_id()
    AND c.status = 'active'
    AND c.club_id IS NOT NULL
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_same_active_club_as_current_user(_player_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts self_c
    JOIN public.contracts other_c
      ON other_c.club_id = self_c.club_id
    WHERE self_c.player_profile_id = public.current_user_player_profile_id()
      AND self_c.status = 'active'
      AND other_c.player_profile_id = _player_profile_id
      AND other_c.status = 'active'
  )
$$;

-- clubs: remove manager-profile join policies and recreate with direct manager ownership check
DROP POLICY IF EXISTS "Managers can insert own club" ON public.clubs;
DROP POLICY IF EXISTS "Managers can update own club" ON public.clubs;
DROP POLICY IF EXISTS "Managers can view own club" ON public.clubs;

CREATE POLICY "Managers can insert own club"
ON public.clubs
FOR INSERT
TO authenticated
WITH CHECK (manager_profile_id = public.current_user_manager_profile_id());

CREATE POLICY "Managers can update own club"
ON public.clubs
FOR UPDATE
TO authenticated
USING (manager_profile_id = public.current_user_manager_profile_id())
WITH CHECK (manager_profile_id = public.current_user_manager_profile_id());

CREATE POLICY "Managers can view own club"
ON public.clubs
FOR SELECT
TO authenticated
USING (manager_profile_id = public.current_user_manager_profile_id());

-- contracts: remove player_profiles/clubs recursive dependencies and recreate minimal access
DROP POLICY IF EXISTS "Managers can view club contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can insert own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can view own contracts" ON public.contracts;

CREATE POLICY "Users can insert own contracts"
ON public.contracts
FOR INSERT
TO authenticated
WITH CHECK (player_profile_id = public.current_user_player_profile_id());

CREATE POLICY "Users can update own contracts"
ON public.contracts
FOR UPDATE
TO authenticated
USING (player_profile_id = public.current_user_player_profile_id())
WITH CHECK (player_profile_id = public.current_user_player_profile_id());

CREATE POLICY "Users can view own contracts"
ON public.contracts
FOR SELECT
TO authenticated
USING (player_profile_id = public.current_user_player_profile_id());

CREATE POLICY "Managers can view club contracts"
ON public.contracts
FOR SELECT
TO authenticated
USING (club_id = public.current_user_managed_club_id()::text);

-- manager_profiles: replace player visibility policy to avoid circular joins
DROP POLICY IF EXISTS "Players can view club manager" ON public.manager_profiles;

CREATE POLICY "Players can view club manager"
ON public.manager_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clubs c
    WHERE c.manager_profile_id = manager_profiles.id
      AND c.id = public.current_user_active_club_id_uuid()
  )
);

-- player_profiles: replace recursive teammate/manager policies
DROP POLICY IF EXISTS "Managers can view club players" ON public.player_profiles;
DROP POLICY IF EXISTS "Players can view teammates" ON public.player_profiles;

CREATE POLICY "Managers can view club players"
ON public.player_profiles
FOR SELECT
TO authenticated
USING (club_id = public.current_user_managed_club_id()::text);

CREATE POLICY "Players can view teammates"
ON public.player_profiles
FOR SELECT
TO authenticated
USING (public.is_same_active_club_as_current_user(id));

-- stadiums: replace join-heavy policies with direct club checks
DROP POLICY IF EXISTS "Managers can insert own stadium" ON public.stadiums;
DROP POLICY IF EXISTS "Managers can update own stadium" ON public.stadiums;
DROP POLICY IF EXISTS "Managers can view own stadium" ON public.stadiums;
DROP POLICY IF EXISTS "Players can view club stadium" ON public.stadiums;

CREATE POLICY "Managers can insert own stadium"
ON public.stadiums
FOR INSERT
TO authenticated
WITH CHECK (club_id = public.current_user_managed_club_id());

CREATE POLICY "Managers can update own stadium"
ON public.stadiums
FOR UPDATE
TO authenticated
USING (club_id = public.current_user_managed_club_id())
WITH CHECK (club_id = public.current_user_managed_club_id());

CREATE POLICY "Managers can view own stadium"
ON public.stadiums
FOR SELECT
TO authenticated
USING (club_id = public.current_user_managed_club_id());

CREATE POLICY "Players can view club stadium"
ON public.stadiums
FOR SELECT
TO authenticated
USING (club_id = public.current_user_active_club_id_uuid());

-- lineups: use direct club ownership check
DROP POLICY IF EXISTS "Managers can delete own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can insert own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can update own lineups" ON public.lineups;
DROP POLICY IF EXISTS "Managers can view own lineups" ON public.lineups;

CREATE POLICY "Managers can view own lineups"
ON public.lineups
FOR SELECT
TO authenticated
USING (club_id = public.current_user_managed_club_id());

CREATE POLICY "Managers can insert own lineups"
ON public.lineups
FOR INSERT
TO authenticated
WITH CHECK (club_id = public.current_user_managed_club_id());

CREATE POLICY "Managers can update own lineups"
ON public.lineups
FOR UPDATE
TO authenticated
USING (club_id = public.current_user_managed_club_id())
WITH CHECK (club_id = public.current_user_managed_club_id());

CREATE POLICY "Managers can delete own lineups"
ON public.lineups
FOR DELETE
TO authenticated
USING (club_id = public.current_user_managed_club_id());

-- lineup_slots: keep manager-only access, but avoid club/manager recursive joins
DROP POLICY IF EXISTS "Managers can delete own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can insert own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can update own lineup slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Managers can view own lineup slots" ON public.lineup_slots;

CREATE POLICY "Managers can view own lineup slots"
ON public.lineup_slots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lineups l
    WHERE l.id = lineup_slots.lineup_id
      AND l.club_id = public.current_user_managed_club_id()
  )
);

CREATE POLICY "Managers can insert own lineup slots"
ON public.lineup_slots
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.lineups l
    WHERE l.id = lineup_slots.lineup_id
      AND l.club_id = public.current_user_managed_club_id()
  )
);

CREATE POLICY "Managers can update own lineup slots"
ON public.lineup_slots
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lineups l
    WHERE l.id = lineup_slots.lineup_id
      AND l.club_id = public.current_user_managed_club_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.lineups l
    WHERE l.id = lineup_slots.lineup_id
      AND l.club_id = public.current_user_managed_club_id()
  )
);

CREATE POLICY "Managers can delete own lineup slots"
ON public.lineup_slots
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lineups l
    WHERE l.id = lineup_slots.lineup_id
      AND l.club_id = public.current_user_managed_club_id()
  )
);