-- Cleanup: clubs flipped to bot-managed by the previous (broken)
-- admin_fire_manager kept manager_profile_id pointing at the
-- former manager, so they still saw the club. Detach them.
UPDATE public.clubs
SET manager_profile_id = NULL,
    assistant_manager_id = NULL
WHERE is_bot_managed = true
  AND manager_profile_id IS NOT NULL;
