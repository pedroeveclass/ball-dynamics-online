-- ═══════════════════════════════════════════════════════════
-- countries reference table — seed for i18n + nationality
--
-- Single source of truth for country name (PT/EN), confederation
-- and feature gates (`enabled_for_league`, `enabled_for_national_team`).
-- Other tables that store a country use CHAR(2) ISO 3166-1 alpha-2
-- and FK against countries.code.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.countries (
  code CHAR(2) PRIMARY KEY,
  name_pt TEXT NOT NULL,
  name_en TEXT NOT NULL,
  confederation TEXT,
  flag_emoji TEXT,
  enabled_for_league BOOLEAN NOT NULL DEFAULT false,
  enabled_for_national_team BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "countries_select_all" ON public.countries;
CREATE POLICY "countries_select_all" ON public.countries
  FOR SELECT TO authenticated, anon USING (true);

-- Seed: realistic football-playing countries.
-- BR is the only league-enabled country at launch; others toggle on
-- when a foreign league is created. National teams are enabled by
-- default for everyone.
INSERT INTO public.countries (code, name_pt, name_en, confederation, flag_emoji, enabled_for_league) VALUES
  -- South America (CONMEBOL)
  ('BR', 'Brasil', 'Brazil', 'CONMEBOL', '🇧🇷', true),
  ('AR', 'Argentina', 'Argentina', 'CONMEBOL', '🇦🇷', false),
  ('UY', 'Uruguai', 'Uruguay', 'CONMEBOL', '🇺🇾', false),
  ('CL', 'Chile', 'Chile', 'CONMEBOL', '🇨🇱', false),
  ('CO', 'Colômbia', 'Colombia', 'CONMEBOL', '🇨🇴', false),
  ('PY', 'Paraguai', 'Paraguay', 'CONMEBOL', '🇵🇾', false),
  ('PE', 'Peru', 'Peru', 'CONMEBOL', '🇵🇪', false),
  ('EC', 'Equador', 'Ecuador', 'CONMEBOL', '🇪🇨', false),
  ('VE', 'Venezuela', 'Venezuela', 'CONMEBOL', '🇻🇪', false),
  ('BO', 'Bolívia', 'Bolivia', 'CONMEBOL', '🇧🇴', false),
  -- Europe (UEFA)
  ('PT', 'Portugal', 'Portugal', 'UEFA', '🇵🇹', false),
  ('ES', 'Espanha', 'Spain', 'UEFA', '🇪🇸', false),
  ('FR', 'França', 'France', 'UEFA', '🇫🇷', false),
  ('IT', 'Itália', 'Italy', 'UEFA', '🇮🇹', false),
  ('DE', 'Alemanha', 'Germany', 'UEFA', '🇩🇪', false),
  ('GB', 'Reino Unido', 'United Kingdom', 'UEFA', '🇬🇧', false),
  ('NL', 'Holanda', 'Netherlands', 'UEFA', '🇳🇱', false),
  ('BE', 'Bélgica', 'Belgium', 'UEFA', '🇧🇪', false),
  ('CH', 'Suíça', 'Switzerland', 'UEFA', '🇨🇭', false),
  ('AT', 'Áustria', 'Austria', 'UEFA', '🇦🇹', false),
  ('PL', 'Polônia', 'Poland', 'UEFA', '🇵🇱', false),
  ('SE', 'Suécia', 'Sweden', 'UEFA', '🇸🇪', false),
  ('NO', 'Noruega', 'Norway', 'UEFA', '🇳🇴', false),
  ('DK', 'Dinamarca', 'Denmark', 'UEFA', '🇩🇰', false),
  ('FI', 'Finlândia', 'Finland', 'UEFA', '🇫🇮', false),
  ('IE', 'Irlanda', 'Ireland', 'UEFA', '🇮🇪', false),
  ('GR', 'Grécia', 'Greece', 'UEFA', '🇬🇷', false),
  ('TR', 'Turquia', 'Turkey', 'UEFA', '🇹🇷', false),
  ('RU', 'Rússia', 'Russia', 'UEFA', '🇷🇺', false),
  ('UA', 'Ucrânia', 'Ukraine', 'UEFA', '🇺🇦', false),
  ('CZ', 'República Tcheca', 'Czech Republic', 'UEFA', '🇨🇿', false),
  ('HR', 'Croácia', 'Croatia', 'UEFA', '🇭🇷', false),
  ('RS', 'Sérvia', 'Serbia', 'UEFA', '🇷🇸', false),
  ('RO', 'Romênia', 'Romania', 'UEFA', '🇷🇴', false),
  ('HU', 'Hungria', 'Hungary', 'UEFA', '🇭🇺', false),
  -- North/Central America (CONCACAF)
  ('US', 'Estados Unidos', 'United States', 'CONCACAF', '🇺🇸', false),
  ('MX', 'México', 'Mexico', 'CONCACAF', '🇲🇽', false),
  ('CA', 'Canadá', 'Canada', 'CONCACAF', '🇨🇦', false),
  ('CR', 'Costa Rica', 'Costa Rica', 'CONCACAF', '🇨🇷', false),
  ('JM', 'Jamaica', 'Jamaica', 'CONCACAF', '🇯🇲', false),
  ('PA', 'Panamá', 'Panama', 'CONCACAF', '🇵🇦', false),
  -- Africa (CAF)
  ('NG', 'Nigéria', 'Nigeria', 'CAF', '🇳🇬', false),
  ('SN', 'Senegal', 'Senegal', 'CAF', '🇸🇳', false),
  ('CM', 'Camarões', 'Cameroon', 'CAF', '🇨🇲', false),
  ('CI', 'Costa do Marfim', 'Ivory Coast', 'CAF', '🇨🇮', false),
  ('GH', 'Gana', 'Ghana', 'CAF', '🇬🇭', false),
  ('MA', 'Marrocos', 'Morocco', 'CAF', '🇲🇦', false),
  ('EG', 'Egito', 'Egypt', 'CAF', '🇪🇬', false),
  ('ZA', 'África do Sul', 'South Africa', 'CAF', '🇿🇦', false),
  ('DZ', 'Argélia', 'Algeria', 'CAF', '🇩🇿', false),
  ('TN', 'Tunísia', 'Tunisia', 'CAF', '🇹🇳', false),
  -- Asia (AFC)
  ('JP', 'Japão', 'Japan', 'AFC', '🇯🇵', false),
  ('KR', 'Coreia do Sul', 'South Korea', 'AFC', '🇰🇷', false),
  ('CN', 'China', 'China', 'AFC', '🇨🇳', false),
  ('SA', 'Arábia Saudita', 'Saudi Arabia', 'AFC', '🇸🇦', false),
  ('IR', 'Irã', 'Iran', 'AFC', '🇮🇷', false),
  ('AU', 'Austrália', 'Australia', 'AFC', '🇦🇺', false),
  ('IN', 'Índia', 'India', 'AFC', '🇮🇳', false),
  ('TH', 'Tailândia', 'Thailand', 'AFC', '🇹🇭', false),
  ('VN', 'Vietnã', 'Vietnam', 'AFC', '🇻🇳', false),
  ('PH', 'Filipinas', 'Philippines', 'AFC', '🇵🇭', false),
  ('ID', 'Indonésia', 'Indonesia', 'AFC', '🇮🇩', false),
  ('IL', 'Israel', 'Israel', 'AFC', '🇮🇱', false),
  -- Oceania (OFC)
  ('NZ', 'Nova Zelândia', 'New Zealand', 'OFC', '🇳🇿', false)
ON CONFLICT (code) DO UPDATE
  SET name_pt = EXCLUDED.name_pt,
      name_en = EXCLUDED.name_en,
      confederation = EXCLUDED.confederation,
      flag_emoji = EXCLUDED.flag_emoji;

-- Index by confederation for future "show all UEFA leagues" queries
CREATE INDEX IF NOT EXISTS idx_countries_confederation ON public.countries(confederation);
CREATE INDEX IF NOT EXISTS idx_countries_enabled_league ON public.countries(enabled_for_league) WHERE enabled_for_league = true;
