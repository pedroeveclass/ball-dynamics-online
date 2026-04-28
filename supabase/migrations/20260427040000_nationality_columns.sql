-- ═══════════════════════════════════════════════════════════
-- Add nationality + language preference to user-facing entities.
--
-- profiles.preferred_language        → UI language ('pt' | 'en'), set
--                                      from navigator.language at signup
-- profiles.country_code              → master country (from IP geo at signup,
--                                      editable in /account/profile)
-- player_profiles.country_code       → set on create_player_profile, editable
-- manager_profiles.country_code      → set during onboarding, editable
--
-- handle_new_user trigger reads country_code + preferred_language from
-- raw_user_meta_data (passed by client at signUp).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language CHAR(2) NOT NULL DEFAULT 'pt'
    CHECK (preferred_language IN ('pt','en')),
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

ALTER TABLE public.manager_profiles
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

-- Backfill existing rows with 'BR' so the column can be made non-null
-- on player/manager (UI assumes a country is always present).
UPDATE public.profiles SET country_code = 'BR' WHERE country_code IS NULL;
UPDATE public.player_profiles SET country_code = 'BR' WHERE country_code IS NULL;
UPDATE public.manager_profiles SET country_code = 'BR' WHERE country_code IS NULL;

ALTER TABLE public.player_profiles ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.manager_profiles ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.player_profiles ALTER COLUMN country_code SET DEFAULT 'BR';
ALTER TABLE public.manager_profiles ALTER COLUMN country_code SET DEFAULT 'BR';

-- FK to countries (deferred so the seed can run in any order).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_country_code_fkey,
  ADD CONSTRAINT profiles_country_code_fkey
    FOREIGN KEY (country_code) REFERENCES public.countries(code);

ALTER TABLE public.player_profiles
  DROP CONSTRAINT IF EXISTS player_profiles_country_code_fkey,
  ADD CONSTRAINT player_profiles_country_code_fkey
    FOREIGN KEY (country_code) REFERENCES public.countries(code);

ALTER TABLE public.manager_profiles
  DROP CONSTRAINT IF EXISTS manager_profiles_country_code_fkey,
  ADD CONSTRAINT manager_profiles_country_code_fkey
    FOREIGN KEY (country_code) REFERENCES public.countries(code);

CREATE INDEX IF NOT EXISTS idx_player_profiles_country ON public.player_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_manager_profiles_country ON public.manager_profiles(country_code);

-- Update trigger so signup metadata flows into profiles.
-- Client passes country_code (from edge fn) + preferred_language
-- (from navigator.language) inside `data: { ... }` of signUp().
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_country CHAR(2);
  v_lang CHAR(2);
BEGIN
  v_country := upper(coalesce(NEW.raw_user_meta_data->>'country_code', 'BR'));
  IF length(v_country) <> 2 THEN v_country := 'BR'; END IF;
  -- Validate against countries; fallback to BR if unknown
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = v_country) THEN
    v_country := 'BR';
  END IF;

  v_lang := lower(coalesce(NEW.raw_user_meta_data->>'preferred_language', 'pt'));
  IF v_lang NOT IN ('pt','en') THEN v_lang := 'pt'; END IF;

  INSERT INTO public.profiles (id, username, role_selected, country_code, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role_selected', 'player'),
    v_country,
    v_lang
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
