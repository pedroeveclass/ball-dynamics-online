
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role_selected TEXT NOT NULL DEFAULT 'player' CHECK (role_selected IN ('player', 'manager')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role_selected)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role_selected', 'player')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Player Profiles
CREATE TABLE public.player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 16 AND age <= 45),
  dominant_foot TEXT NOT NULL CHECK (dominant_foot IN ('right', 'left', 'both')),
  primary_position TEXT NOT NULL,
  secondary_position TEXT,
  archetype TEXT NOT NULL,
  club_id TEXT,
  reputation INTEGER NOT NULL DEFAULT 50,
  money INTEGER NOT NULL DEFAULT 5000,
  weekly_salary INTEGER NOT NULL DEFAULT 0,
  overall INTEGER NOT NULL DEFAULT 50,
  energy_current INTEGER NOT NULL DEFAULT 100,
  energy_max INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own player" ON public.player_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own player" ON public.player_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own player" ON public.player_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_player_profiles_updated_at BEFORE UPDATE ON public.player_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Player Attributes
CREATE TABLE public.player_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL UNIQUE REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  velocidade INTEGER NOT NULL DEFAULT 40,
  aceleracao INTEGER NOT NULL DEFAULT 40,
  agilidade INTEGER NOT NULL DEFAULT 40,
  forca INTEGER NOT NULL DEFAULT 40,
  equilibrio INTEGER NOT NULL DEFAULT 40,
  resistencia INTEGER NOT NULL DEFAULT 40,
  pulo INTEGER NOT NULL DEFAULT 40,
  stamina INTEGER NOT NULL DEFAULT 40,
  drible INTEGER NOT NULL DEFAULT 40,
  controle_bola INTEGER NOT NULL DEFAULT 40,
  marcacao INTEGER NOT NULL DEFAULT 40,
  desarme INTEGER NOT NULL DEFAULT 40,
  um_toque INTEGER NOT NULL DEFAULT 40,
  curva INTEGER NOT NULL DEFAULT 40,
  passe_baixo INTEGER NOT NULL DEFAULT 40,
  passe_alto INTEGER NOT NULL DEFAULT 40,
  visao_jogo INTEGER NOT NULL DEFAULT 40,
  tomada_decisao INTEGER NOT NULL DEFAULT 40,
  antecipacao INTEGER NOT NULL DEFAULT 40,
  trabalho_equipe INTEGER NOT NULL DEFAULT 40,
  coragem INTEGER NOT NULL DEFAULT 40,
  posicionamento_ofensivo INTEGER NOT NULL DEFAULT 40,
  posicionamento_defensivo INTEGER NOT NULL DEFAULT 40,
  cabeceio INTEGER NOT NULL DEFAULT 40,
  acuracia_chute INTEGER NOT NULL DEFAULT 40,
  forca_chute INTEGER NOT NULL DEFAULT 40,
  reflexo INTEGER NOT NULL DEFAULT 20,
  posicionamento_gol INTEGER NOT NULL DEFAULT 20,
  defesa_aerea INTEGER NOT NULL DEFAULT 20,
  pegada INTEGER NOT NULL DEFAULT 20,
  saida_gol INTEGER NOT NULL DEFAULT 20,
  um_contra_um INTEGER NOT NULL DEFAULT 20,
  distribuicao_curta INTEGER NOT NULL DEFAULT 20,
  distribuicao_longa INTEGER NOT NULL DEFAULT 20,
  tempo_reacao INTEGER NOT NULL DEFAULT 20,
  comando_area INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.player_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attributes" ON public.player_attributes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own attributes" ON public.player_attributes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own attributes" ON public.player_attributes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));

CREATE TRIGGER update_player_attributes_updated_at BEFORE UPDATE ON public.player_attributes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contracts
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  club_id TEXT,
  weekly_salary INTEGER NOT NULL DEFAULT 0,
  release_clause INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'free_agent' CHECK (status IN ('active', 'expired', 'terminated', 'free_agent')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contracts" ON public.contracts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own contracts" ON public.contracts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own contracts" ON public.contracts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.player_profiles WHERE id = player_profile_id AND user_id = auth.uid()));

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('contract', 'transfer', 'match', 'training', 'league', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
