
-- Manager Profiles
CREATE TABLE public.manager_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  reputation integer NOT NULL DEFAULT 30,
  money integer NOT NULL DEFAULT 50000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.manager_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own manager" ON public.manager_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own manager" ON public.manager_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own manager" ON public.manager_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Clubs
CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_profile_id uuid NOT NULL REFERENCES public.manager_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text NOT NULL,
  primary_color text NOT NULL DEFAULT '#1a5276',
  secondary_color text NOT NULL DEFAULT '#ffffff',
  city text,
  reputation integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(manager_profile_id)
);
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can insert own club" ON public.clubs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM manager_profiles WHERE manager_profiles.id = clubs.manager_profile_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can view own club" ON public.clubs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM manager_profiles WHERE manager_profiles.id = clubs.manager_profile_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can update own club" ON public.clubs FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM manager_profiles WHERE manager_profiles.id = clubs.manager_profile_id AND manager_profiles.user_id = auth.uid()));

-- Club Finances
CREATE TABLE public.club_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 500000,
  weekly_wage_bill integer NOT NULL DEFAULT 0,
  projected_income integer NOT NULL DEFAULT 10000,
  projected_expense integer NOT NULL DEFAULT 5000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);
ALTER TABLE public.club_finances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can insert own finances" ON public.club_finances FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_finances.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can view own finances" ON public.club_finances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_finances.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can update own finances" ON public.club_finances FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_finances.club_id AND manager_profiles.user_id = auth.uid()));

-- Stadiums
CREATE TABLE public.stadiums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 5000,
  quality integer NOT NULL DEFAULT 30,
  maintenance_cost integer NOT NULL DEFAULT 2000,
  prestige integer NOT NULL DEFAULT 15,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);
ALTER TABLE public.stadiums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can insert own stadium" ON public.stadiums FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = stadiums.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can view own stadium" ON public.stadiums FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = stadiums.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can update own stadium" ON public.stadiums FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = stadiums.club_id AND manager_profiles.user_id = auth.uid()));

-- Stadium Sectors
CREATE TABLE public.stadium_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stadium_id uuid NOT NULL REFERENCES public.stadiums(id) ON DELETE CASCADE,
  sector_type text NOT NULL,
  capacity integer NOT NULL DEFAULT 1000,
  ticket_price integer NOT NULL DEFAULT 20,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.stadium_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can insert own sectors" ON public.stadium_sectors FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM stadiums JOIN clubs ON clubs.id = stadiums.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE stadiums.id = stadium_sectors.stadium_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can view own sectors" ON public.stadium_sectors FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM stadiums JOIN clubs ON clubs.id = stadiums.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE stadiums.id = stadium_sectors.stadium_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can update own sectors" ON public.stadium_sectors FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM stadiums JOIN clubs ON clubs.id = stadiums.club_id JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE stadiums.id = stadium_sectors.stadium_id AND manager_profiles.user_id = auth.uid()));

-- Club Settings
CREATE TABLE public.club_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  default_formation text DEFAULT '4-4-2',
  play_style text DEFAULT 'balanced',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers can insert own settings" ON public.club_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_settings.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can view own settings" ON public.club_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_settings.club_id AND manager_profiles.user_id = auth.uid()));
CREATE POLICY "Managers can update own settings" ON public.club_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM clubs JOIN manager_profiles ON manager_profiles.id = clubs.manager_profile_id WHERE clubs.id = club_settings.club_id AND manager_profiles.user_id = auth.uid()));

-- Training history table for tracking attribute evolution
CREATE TABLE public.training_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  old_value numeric(5,2) NOT NULL,
  new_value numeric(5,2) NOT NULL,
  growth numeric(5,2) NOT NULL,
  trained_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.training_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own training history" ON public.training_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM player_profiles WHERE player_profiles.id = training_history.player_profile_id AND player_profiles.user_id = auth.uid()));
CREATE POLICY "Users can view own training history" ON public.training_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM player_profiles WHERE player_profiles.id = training_history.player_profile_id AND player_profiles.user_id = auth.uid()));
