-- ═══════════════════════════════════════════════════════════════
-- Coach / Manager report: allow the club manager to read
-- training_history and store_purchases of their own players.
--
-- Context: the ManagerReportsPage ("Relatório de Jogadores") was
-- rendering "Dias treinados", "Ganho de atributo" and "Compras" as
-- zero for every player because RLS on training_history and
-- store_purchases only granted SELECT to the player themselves
-- (player_profiles.user_id = auth.uid() / user_id = auth.uid()).
-- The "último treino" column works because it reads
-- player_profiles.last_trained_at, and player_profiles already has
-- a manager-view policy.
-- ═══════════════════════════════════════════════════════════════

-- 1. training_history: manager of the player's club can read
DROP POLICY IF EXISTS "Managers can view training history of own players"
  ON public.training_history;

CREATE POLICY "Managers can view training history of own players"
ON public.training_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.player_profiles pp
    JOIN public.clubs c ON c.id::text = pp.club_id
    JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE pp.id = training_history.player_profile_id
      AND mp.user_id = auth.uid()
  )
);

-- 2. store_purchases: manager of the player's club can read
DROP POLICY IF EXISTS "Managers can view purchases of own players"
  ON public.store_purchases;

CREATE POLICY "Managers can view purchases of own players"
ON public.store_purchases
FOR SELECT
TO authenticated
USING (
  player_profile_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.player_profiles pp
    JOIN public.clubs c ON c.id::text = pp.club_id
    JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
    WHERE pp.id = store_purchases.player_profile_id
      AND mp.user_id = auth.uid()
  )
);
