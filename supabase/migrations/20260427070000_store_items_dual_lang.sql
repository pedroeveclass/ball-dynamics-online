-- ═══════════════════════════════════════════════════════════
-- store_items: dual-language name + description.
--
-- name and description stay as the canonical PT (legacy clients
-- still read them); name_pt/name_en/description_pt/description_en
-- are the new authoritative fields. Client picks based on
-- profiles.preferred_language.
--
-- Backfill rule: copy current value into *_pt; map a hand-picked
-- EN translation by (category, name) pair. New items going forward
-- must always provide both languages.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS name_pt TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS description_pt TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

-- PT: copy from current values
UPDATE public.store_items SET name_pt = name WHERE name_pt IS NULL;
UPDATE public.store_items SET description_pt = description WHERE description_pt IS NULL;

-- EN: map by canonical PT name
UPDATE public.store_items SET name_en = CASE name
  WHEN 'Faixa de Cabelo' THEN 'Headband'
  WHEN 'Munhequeira' THEN 'Wristband'
  WHEN 'Braçadeira de Capitão' THEN 'Captain''s Armband'
  WHEN 'Luvas de Goleiro' THEN 'Goalkeeper Gloves'
  WHEN 'Caneleira Personalizada' THEN 'Custom Shin Guards'
  WHEN 'Chuteira Precisão' THEN 'Precision Boots'
  WHEN 'Chuteira Potência' THEN 'Power Boots'
  WHEN 'Chuteira Velocidade' THEN 'Speed Boots'
  WHEN 'Chuteira Controle' THEN 'Control Boots'
  WHEN 'Chuteira Defesa' THEN 'Defender Boots'
  WHEN 'Chuteira Passe' THEN 'Passer Boots'
  WHEN 'Chuteira Drible' THEN 'Dribbler Boots'
  WHEN 'Chuteira Agilidade' THEN 'Agility Boots'
  WHEN 'Chuteira Cabeceio' THEN 'Header Boots'
  WHEN 'Chuteira Goleiro' THEN 'Goalkeeper Boots'
  WHEN 'Energético' THEN 'Energy Drink'
  WHEN 'Treinador Particular Nv.1' THEN 'Personal Trainer Lv.1'
  WHEN 'Treinador Particular Nv.2' THEN 'Personal Trainer Lv.2'
  WHEN 'Treinador Particular Nv.3' THEN 'Personal Trainer Lv.3'
  WHEN 'Treinador Particular Nv.4' THEN 'Personal Trainer Lv.4'
  WHEN 'Treinador Particular Nv.5' THEN 'Personal Trainer Lv.5'
  WHEN 'Fisioterapeuta Nv.1' THEN 'Physiotherapist Lv.1'
  WHEN 'Fisioterapeuta Nv.2' THEN 'Physiotherapist Lv.2'
  WHEN 'Fisioterapeuta Nv.3' THEN 'Physiotherapist Lv.3'
  WHEN 'Fisioterapeuta Nv.4' THEN 'Physiotherapist Lv.4'
  WHEN 'Fisioterapeuta Nv.5' THEN 'Physiotherapist Lv.5'
  WHEN 'Doação ao Clube' THEN 'Club Donation'
  WHEN 'Comprar Dinheiro' THEN 'Buy In-Game Money'
  ELSE name
END
WHERE name_en IS NULL;

UPDATE public.store_items SET description_en = CASE description
  WHEN 'Estilo puro no campo' THEN 'Pure style on the pitch'
  WHEN 'Proteção e estilo' THEN 'Protection and style'
  WHEN 'Lidere seu time' THEN 'Lead your team'
  WHEN 'Visual profissional' THEN 'Professional look'
  WHEN 'Proteção com estilo' THEN 'Protection with style'
  WHEN 'Bônus em chute' THEN 'Shot accuracy bonus'
  WHEN 'Bônus em força de chute' THEN 'Shot power bonus'
  WHEN 'Bônus em velocidade' THEN 'Speed bonus'
  WHEN 'Bônus em controle de bola' THEN 'Ball control bonus'
  WHEN 'Bônus em desarme' THEN 'Tackle bonus'
  WHEN 'Bônus em passe baixo' THEN 'Short pass bonus'
  WHEN 'Bônus em drible' THEN 'Dribble bonus'
  WHEN 'Bônus em agilidade' THEN 'Agility bonus'
  WHEN 'Bônus em cabeceio' THEN 'Heading bonus'
  WHEN 'Bônus em reflexo' THEN 'Reflex bonus'
  WHEN 'Recupera +25 de energia (1x por dia)' THEN 'Restores +25 energy (once per day)'
  WHEN '+10% bônus treino (mensal)' THEN '+10% training bonus (monthly)'
  WHEN '+20% bônus treino (mensal)' THEN '+20% training bonus (monthly)'
  WHEN '+30% bônus treino (mensal)' THEN '+30% training bonus (monthly)'
  WHEN '+40% bônus treino (mensal)' THEN '+40% training bonus (monthly)'
  WHEN '+50% bônus treino (permanente)' THEN '+50% training bonus (permanent)'
  WHEN '+5% recuperação energia (mensal)' THEN '+5% energy regen (monthly)'
  WHEN '+10% recuperação energia (mensal)' THEN '+10% energy regen (monthly)'
  WHEN '+15% recuperação energia (mensal)' THEN '+15% energy regen (monthly)'
  WHEN '+20% recuperação energia (mensal)' THEN '+20% energy regen (monthly)'
  WHEN '+25% recuperação energia (permanente)' THEN '+25% energy regen (permanent)'
  WHEN 'Doe dinheiro para o seu clube' THEN 'Donate money to your club'
  WHEN 'Compre dinheiro do jogo com dinheiro real' THEN 'Buy in-game money with real money'
  ELSE description
END
WHERE description_en IS NULL;

-- Make new columns required so future inserts can't forget them
ALTER TABLE public.store_items
  ALTER COLUMN name_pt SET NOT NULL,
  ALTER COLUMN name_en SET NOT NULL;
