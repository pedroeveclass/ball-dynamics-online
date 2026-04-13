-- Add `link` column to notifications: in-app route to navigate to when notification is clicked.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link TEXT;
