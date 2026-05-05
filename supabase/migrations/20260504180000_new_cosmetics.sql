-- ============================================================
-- New cosmetic prototypes — tattoo, face paint, brinco, headband
-- (V2), cordão prata/ouro, pulseira prata/ouro, bandana, modo
-- sem camisa, óculos.
--
-- All items are seeded with is_available=false so Pedro can flip
-- them on once the purchase / equip / render pipeline is fully
-- wired (next round). Two new columns capture per-purchase
-- metadata that doesn't fit into the existing color/side schema.
-- ============================================================

-- ── New store_purchases metadata columns ──
ALTER TABLE public.store_purchases
  ADD COLUMN IF NOT EXISTS tattoo_design TEXT,
  ADD COLUMN IF NOT EXISTS accessory_variant TEXT,
  ADD COLUMN IF NOT EXISTS face_paint_design TEXT,
  ADD COLUMN IF NOT EXISTS face_paint_color2 TEXT;

ALTER TABLE public.store_purchases
  DROP CONSTRAINT IF EXISTS store_purchases_tattoo_design_check;
ALTER TABLE public.store_purchases
  ADD CONSTRAINT store_purchases_tattoo_design_check
  CHECK (tattoo_design IS NULL OR tattoo_design IN ('tribal','cross','heart','anchor','star'));

ALTER TABLE public.store_purchases
  DROP CONSTRAINT IF EXISTS store_purchases_accessory_variant_check;
ALTER TABLE public.store_purchases
  ADD CONSTRAINT store_purchases_accessory_variant_check
  CHECK (accessory_variant IS NULL OR accessory_variant IN (
    'sunglasses','wayfarers','round','prescription01','prescription02','kurt','eyepatch'
  ));

ALTER TABLE public.store_purchases
  DROP CONSTRAINT IF EXISTS store_purchases_face_paint_design_check;
ALTER TABLE public.store_purchases
  ADD CONSTRAINT store_purchases_face_paint_design_check
  CHECK (face_paint_design IS NULL OR face_paint_design IN (
    'brasil','horizontal','two_stripes','wings'
  ));

-- ── Seed new store_items (locked until next round) ──

-- Tatuagem: single arm, design + side picked at buy time (each purchase
-- = one arm; player buys twice for both arms, can mix designs).
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Tatuagem', 'Tatuagem', 'Tattoo',
       'Tatuagem no bíceps (tribal, cruz, coração, âncora, estrela)',
       'Tatuagem no bíceps (tribal, cruz, coração, âncora, estrela)',
       'Bicep tattoo (tribal, cross, heart, anchor, star)',
       5000, NULL, NULL, 'permanent', NULL, NULL, false, 30
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Tatuagem','Tattoo'));

-- Pintura Facial: design + 1-2 colors at buy time.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Pintura Facial', 'Pintura Facial', 'Face Paint',
       'Pintura nas bochechas (Brasil, faixas, asas, war paint)',
       'Pintura nas bochechas (Brasil, faixas, asas, war paint)',
       'Cheek paint (Brasil, stripes, wings, war paint)',
       4000, NULL, NULL, 'permanent', NULL, NULL, false, 31
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Pintura Facial','Face Paint'));

-- Brinco: cor + lado.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Brinco', 'Brinco', 'Earring',
       'Pequeno brinco (escolhe a cor)', 'Pequeno brinco (escolhe a cor)',
       'Small earring (color picker)',
       3000, NULL, NULL, 'permanent', NULL, NULL, false, 32
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Brinco','Earring'));

-- Headband V2: o item antigo "Faixa de Cabelo" foi desabilitado quando
-- a render do V1 não cobria. Agora V2 cobre.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Headband', 'Headband', 'Headband',
       'Faixa fina na testa (escolhe a cor)', 'Faixa fina na testa (escolhe a cor)',
       'Forehead headband (color picker)',
       4000, NULL, NULL, 'permanent', NULL, NULL, false, 33
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Headband'));

-- Cordão Prata: tier baixo, prata fixa.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Cordão de Prata', 'Cordão de Prata', 'Silver Necklace',
       'Cordão prateado em V no peito', 'Cordão prateado em V no peito',
       'Silver V necklace on the chest',
       5000, NULL, NULL, 'permanent', NULL, NULL, false, 34
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Cordão de Prata','Silver Necklace'));

-- Cordão Ouro: tier alto.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Cordão de Ouro', 'Cordão de Ouro', 'Gold Necklace',
       'Cordão dourado em V no peito', 'Cordão dourado em V no peito',
       'Gold V necklace on the chest',
       15000, NULL, NULL, 'permanent', NULL, NULL, false, 35
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Cordão de Ouro','Gold Necklace'));

-- Pulseira Prata: tier baixo, single arm.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Pulseira de Prata', 'Pulseira de Prata', 'Silver Bracelet',
       'Anel fino de prata no pulso (1 braço)', 'Anel fino de prata no pulso (1 braço)',
       'Silver wrist ring (one arm)',
       3500, NULL, NULL, 'permanent', NULL, NULL, false, 36
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Pulseira de Prata','Silver Bracelet'));

-- Pulseira Ouro: tier alto, single arm.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Pulseira de Ouro', 'Pulseira de Ouro', 'Gold Bracelet',
       'Anel fino de ouro no pulso (1 braço)', 'Anel fino de ouro no pulso (1 braço)',
       'Gold wrist ring (one arm)',
       10000, NULL, NULL, 'permanent', NULL, NULL, false, 37
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Pulseira de Ouro','Gold Bracelet'));

-- Bandana: cor.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Bandana', 'Bandana', 'Bandana',
       'Pano amarrado na cabeça (escolhe a cor)', 'Pano amarrado na cabeça (escolhe a cor)',
       'Tied head wrap (color picker)',
       4500, NULL, NULL, 'permanent', NULL, NULL, false, 38
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Bandana'));

-- Modo Sem Camisa: toggle vibe pra foto de perfil.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Modo Sem Camisa', 'Modo Sem Camisa', 'Shirtless Mode',
       'Tira a camisa pra mostrar o tronco', 'Tira a camisa pra mostrar o tronco',
       'Take the shirt off to show the bare torso',
       8000, NULL, NULL, 'permanent', NULL, NULL, false, 39
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Modo Sem Camisa','Shirtless Mode'));

-- Óculos: variant picker (7 modelos) com preview na compra.
INSERT INTO public.store_items
  (category, name, name_pt, name_en, description, description_pt, description_en,
   price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Óculos', 'Óculos', 'Glasses',
       '7 modelos: sol, wayfarer, redondo, quadrado, fino, kurt, tapa-olho',
       '7 modelos: sol, wayfarer, redondo, quadrado, fino, kurt, tapa-olho',
       '7 styles: sun, wayfarer, round, square, thin, kurt, eyepatch',
       4500, NULL, NULL, 'permanent', NULL, NULL, false, 40
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE name IN ('Óculos','Glasses'));
