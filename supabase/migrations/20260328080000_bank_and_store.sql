-- ============================================================
-- Migration: Bank (Loans) + Store (Items, Purchases, Subscriptions)
-- ============================================================

-- ─── BANK: Loans ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Either player or club (one must be set)
  player_profile_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  principal NUMERIC NOT NULL,          -- original amount borrowed
  remaining NUMERIC NOT NULL,          -- current remaining balance
  weekly_interest_rate NUMERIC NOT NULL DEFAULT 0.02, -- 2% per week
  weekly_payment NUMERIC NOT NULL,     -- fixed weekly payment amount
  status TEXT NOT NULL DEFAULT 'active', -- active, paid, defaulted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  CHECK (player_profile_id IS NOT NULL OR club_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_loans_player ON public.loans(player_profile_id) WHERE player_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loans_club ON public.loans(club_id) WHERE club_id IS NOT NULL;

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own loans" ON public.loans FOR SELECT USING (true);
CREATE POLICY "Create loans" ON public.loans FOR INSERT WITH CHECK (true);
CREATE POLICY "Update loans" ON public.loans FOR UPDATE USING (true);

-- ─── STORE: Item catalog ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'cosmetic', 'boots', 'consumable', 'trainer', 'physio', 'donation', 'currency'
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  price_real NUMERIC, -- real money price (null = not purchasable with real money)
  level INT, -- for tiered items (boots 1-5, trainer 1-5, physio 1-5)
  max_level INT, -- max level for this item type
  duration TEXT, -- 'permanent', 'monthly', 'daily', 'single_use'
  monthly_cost NUMERIC, -- recurring cost for subscriptions
  bonus_type TEXT, -- 'chute', 'desarme', 'velocidade', 'training', 'energy_regen', etc.
  bonus_value NUMERIC, -- the bonus amount
  is_available BOOLEAN NOT NULL DEFAULT false, -- LOCKED until store is enabled
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read store items" ON public.store_items FOR SELECT USING (true);

-- ─── STORE: Player purchases ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  player_profile_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  store_item_id UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  level INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, cancelled
  expires_at TIMESTAMPTZ, -- for monthly/daily items
  last_used_at TIMESTAMPTZ, -- for daily-use items (energetico)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_purchases_user ON public.store_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_store_purchases_player ON public.store_purchases(player_profile_id);

ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own purchases" ON public.store_purchases FOR SELECT USING (true);
CREATE POLICY "Create purchases" ON public.store_purchases FOR INSERT WITH CHECK (true);
CREATE POLICY "Update purchases" ON public.store_purchases FOR UPDATE USING (true);

-- ─── Seed store items (all unavailable by default) ──────────

INSERT INTO public.store_items (category, name, description, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order) VALUES
-- Cosmetics
('cosmetic', 'Faixa de Cabelo', 'Estilo puro no campo', 5000, NULL, NULL, 'permanent', NULL, NULL, false, 10),
('cosmetic', 'Munhequeira', 'Proteção e estilo', 3000, NULL, NULL, 'permanent', NULL, NULL, false, 11),
('cosmetic', 'Braçadeira de Capitão', 'Lidere seu time', 10000, NULL, NULL, 'permanent', NULL, NULL, false, 12),
('cosmetic', 'Luvas de Goleiro', 'Visual profissional', 8000, NULL, NULL, 'permanent', NULL, NULL, false, 13),
('cosmetic', 'Caneleira Personalizada', 'Proteção com estilo', 6000, NULL, NULL, 'permanent', NULL, NULL, false, 14),

-- Boots (5 levels each, different bonus types)
('boots', 'Chuteira Precisão', 'Bônus em chute', 10000, 1, 5, 'permanent', 'acuracia_chute', 2, false, 20),
('boots', 'Chuteira Precisão', 'Bônus em chute', 25000, 2, 5, 'permanent', 'acuracia_chute', 4, false, 21),
('boots', 'Chuteira Precisão', 'Bônus em chute', 60000, 3, 5, 'permanent', 'acuracia_chute', 6, false, 22),
('boots', 'Chuteira Precisão', 'Bônus em chute', 150000, 4, 5, 'permanent', 'acuracia_chute', 8, false, 23),
('boots', 'Chuteira Precisão', 'Bônus em chute', 400000, 5, 5, 'permanent', 'acuracia_chute', 10, false, 24),

('boots', 'Chuteira Potência', 'Bônus em força de chute', 10000, 1, 5, 'permanent', 'forca_chute', 2, false, 30),
('boots', 'Chuteira Potência', 'Bônus em força de chute', 25000, 2, 5, 'permanent', 'forca_chute', 4, false, 31),
('boots', 'Chuteira Potência', 'Bônus em força de chute', 60000, 3, 5, 'permanent', 'forca_chute', 6, false, 32),
('boots', 'Chuteira Potência', 'Bônus em força de chute', 150000, 4, 5, 'permanent', 'forca_chute', 8, false, 33),
('boots', 'Chuteira Potência', 'Bônus em força de chute', 400000, 5, 5, 'permanent', 'forca_chute', 10, false, 34),

('boots', 'Chuteira Velocidade', 'Bônus em velocidade', 10000, 1, 5, 'permanent', 'velocidade', 2, false, 40),
('boots', 'Chuteira Velocidade', 'Bônus em velocidade', 25000, 2, 5, 'permanent', 'velocidade', 4, false, 41),
('boots', 'Chuteira Velocidade', 'Bônus em velocidade', 60000, 3, 5, 'permanent', 'velocidade', 6, false, 42),
('boots', 'Chuteira Velocidade', 'Bônus em velocidade', 150000, 4, 5, 'permanent', 'velocidade', 8, false, 43),
('boots', 'Chuteira Velocidade', 'Bônus em velocidade', 400000, 5, 5, 'permanent', 'velocidade', 10, false, 44),

('boots', 'Chuteira Controle', 'Bônus em controle de bola', 10000, 1, 5, 'permanent', 'controle_bola', 2, false, 50),
('boots', 'Chuteira Controle', 'Bônus em controle de bola', 25000, 2, 5, 'permanent', 'controle_bola', 4, false, 51),
('boots', 'Chuteira Controle', 'Bônus em controle de bola', 60000, 3, 5, 'permanent', 'controle_bola', 6, false, 52),
('boots', 'Chuteira Controle', 'Bônus em controle de bola', 150000, 4, 5, 'permanent', 'controle_bola', 8, false, 53),
('boots', 'Chuteira Controle', 'Bônus em controle de bola', 400000, 5, 5, 'permanent', 'controle_bola', 10, false, 54),

('boots', 'Chuteira Defesa', 'Bônus em desarme', 10000, 1, 5, 'permanent', 'desarme', 2, false, 60),
('boots', 'Chuteira Defesa', 'Bônus em desarme', 25000, 2, 5, 'permanent', 'desarme', 4, false, 61),
('boots', 'Chuteira Defesa', 'Bônus em desarme', 60000, 3, 5, 'permanent', 'desarme', 6, false, 62),
('boots', 'Chuteira Defesa', 'Bônus em desarme', 150000, 4, 5, 'permanent', 'desarme', 8, false, 63),
('boots', 'Chuteira Defesa', 'Bônus em desarme', 400000, 5, 5, 'permanent', 'desarme', 10, false, 64),

('boots', 'Chuteira Passe', 'Bônus em passe baixo', 10000, 1, 5, 'permanent', 'passe_baixo', 2, false, 70),
('boots', 'Chuteira Passe', 'Bônus em passe baixo', 25000, 2, 5, 'permanent', 'passe_baixo', 4, false, 71),
('boots', 'Chuteira Passe', 'Bônus em passe baixo', 60000, 3, 5, 'permanent', 'passe_baixo', 6, false, 72),
('boots', 'Chuteira Passe', 'Bônus em passe baixo', 150000, 4, 5, 'permanent', 'passe_baixo', 8, false, 73),
('boots', 'Chuteira Passe', 'Bônus em passe baixo', 400000, 5, 5, 'permanent', 'passe_baixo', 10, false, 74),

('boots', 'Chuteira Drible', 'Bônus em drible', 10000, 1, 5, 'permanent', 'drible', 2, false, 80),
('boots', 'Chuteira Drible', 'Bônus em drible', 25000, 2, 5, 'permanent', 'drible', 4, false, 81),
('boots', 'Chuteira Drible', 'Bônus em drible', 60000, 3, 5, 'permanent', 'drible', 6, false, 82),
('boots', 'Chuteira Drible', 'Bônus em drible', 150000, 4, 5, 'permanent', 'drible', 8, false, 83),
('boots', 'Chuteira Drible', 'Bônus em drible', 400000, 5, 5, 'permanent', 'drible', 10, false, 84),

('boots', 'Chuteira Agilidade', 'Bônus em agilidade', 10000, 1, 5, 'permanent', 'agilidade', 2, false, 85),
('boots', 'Chuteira Agilidade', 'Bônus em agilidade', 25000, 2, 5, 'permanent', 'agilidade', 4, false, 86),
('boots', 'Chuteira Agilidade', 'Bônus em agilidade', 60000, 3, 5, 'permanent', 'agilidade', 6, false, 87),
('boots', 'Chuteira Agilidade', 'Bônus em agilidade', 150000, 4, 5, 'permanent', 'agilidade', 8, false, 88),
('boots', 'Chuteira Agilidade', 'Bônus em agilidade', 400000, 5, 5, 'permanent', 'agilidade', 10, false, 89),

('boots', 'Chuteira Cabeceio', 'Bônus em cabeceio', 10000, 1, 5, 'permanent', 'cabeceio', 2, false, 90),
('boots', 'Chuteira Cabeceio', 'Bônus em cabeceio', 25000, 2, 5, 'permanent', 'cabeceio', 4, false, 91),
('boots', 'Chuteira Cabeceio', 'Bônus em cabeceio', 60000, 3, 5, 'permanent', 'cabeceio', 6, false, 92),
('boots', 'Chuteira Cabeceio', 'Bônus em cabeceio', 150000, 4, 5, 'permanent', 'cabeceio', 8, false, 93),
('boots', 'Chuteira Cabeceio', 'Bônus em cabeceio', 400000, 5, 5, 'permanent', 'cabeceio', 10, false, 94),

('boots', 'Chuteira Goleiro', 'Bônus em reflexo', 10000, 1, 5, 'permanent', 'reflexo', 2, false, 95),
('boots', 'Chuteira Goleiro', 'Bônus em reflexo', 25000, 2, 5, 'permanent', 'reflexo', 4, false, 96),
('boots', 'Chuteira Goleiro', 'Bônus em reflexo', 60000, 3, 5, 'permanent', 'reflexo', 6, false, 97),
('boots', 'Chuteira Goleiro', 'Bônus em reflexo', 150000, 4, 5, 'permanent', 'reflexo', 8, false, 98),
('boots', 'Chuteira Goleiro', 'Bônus em reflexo', 400000, 5, 5, 'permanent', 'reflexo', 10, false, 99),

-- Consumable
('consumable', 'Energético', 'Recupera +25 de energia (1x por dia)', 2000, NULL, NULL, 'single_use', 'energy', 25, false, 100),

-- Trainer (monthly subscription or permanent at level 5)
('trainer', 'Treinador Particular Nv.1', '+10% bônus treino (mensal)', 10000, 1, 5, 'monthly', 'training', 10, false, 110),
('trainer', 'Treinador Particular Nv.2', '+20% bônus treino (mensal)', 10000, 2, 5, 'monthly', 'training', 20, false, 111),
('trainer', 'Treinador Particular Nv.3', '+30% bônus treino (mensal)', 10000, 3, 5, 'monthly', 'training', 30, false, 112),
('trainer', 'Treinador Particular Nv.4', '+40% bônus treino (mensal)', 10000, 4, 5, 'monthly', 'training', 40, false, 113),
('trainer', 'Treinador Particular Nv.5', '+50% bônus treino (permanente)', 10000000, 5, 5, 'permanent', 'training', 50, false, 114),

-- Physio (monthly subscription or permanent at level 5)
('physio', 'Fisioterapeuta Nv.1', '+5% recuperação energia (mensal)', 10000, 1, 5, 'monthly', 'energy_regen', 5, false, 120),
('physio', 'Fisioterapeuta Nv.2', '+10% recuperação energia (mensal)', 10000, 2, 5, 'monthly', 'energy_regen', 10, false, 121),
('physio', 'Fisioterapeuta Nv.3', '+15% recuperação energia (mensal)', 10000, 3, 5, 'monthly', 'energy_regen', 15, false, 122),
('physio', 'Fisioterapeuta Nv.4', '+20% recuperação energia (mensal)', 10000, 4, 5, 'monthly', 'energy_regen', 20, false, 123),
('physio', 'Fisioterapeuta Nv.5', '+25% recuperação energia (permanente)', 10000000, 5, 5, 'permanent', 'energy_regen', 25, false, 124),

-- Donation
('donation', 'Doação ao Clube', 'Doe dinheiro para o seu clube', 0, NULL, NULL, 'single_use', 'donation', NULL, false, 200),

-- Real money currency
('currency', 'Comprar Dinheiro', 'Compre dinheiro do jogo com dinheiro real', 0, NULL, NULL, 'single_use', 'currency', NULL, false, 300);
