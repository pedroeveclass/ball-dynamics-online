-- ============================================================
-- Store Items Update: new prices, luvas de goleiro, remove items
-- ============================================================

-- 1. Remove braçadeira de capitão
DELETE FROM store_items WHERE name = 'Braçadeira de Capitão';

-- 2. Remove chuteira de goleiro (reflexo)
DELETE FROM store_items WHERE name = 'Chuteira Goleiro';

-- 3. Update all boot prices + duration to 'seasonal' (1 temporada)
UPDATE store_items SET price = 2000, duration = 'seasonal' WHERE category = 'boots' AND level = 1;
UPDATE store_items SET price = 5000, duration = 'seasonal' WHERE category = 'boots' AND level = 2;
UPDATE store_items SET price = 12000, duration = 'seasonal' WHERE category = 'boots' AND level = 3;
UPDATE store_items SET price = 30000, duration = 'seasonal' WHERE category = 'boots' AND level = 4;
UPDATE store_items SET price = 80000, duration = 'seasonal' WHERE category = 'boots' AND level = 5;

-- 4. Update trainer prices per level
UPDATE store_items SET price = 10000, monthly_cost = 10000 WHERE category = 'trainer' AND level = 1;
UPDATE store_items SET price = 25000, monthly_cost = 25000 WHERE category = 'trainer' AND level = 2;
UPDATE store_items SET price = 50000, monthly_cost = 50000 WHERE category = 'trainer' AND level = 3;
UPDATE store_items SET price = 75000, monthly_cost = 75000 WHERE category = 'trainer' AND level = 4;
UPDATE store_items SET price = 100000, monthly_cost = 100000 WHERE category = 'trainer' AND level = 5;
-- Level 5 trainer is now monthly too (not permanent at 10M)
UPDATE store_items SET duration = 'monthly', name = 'Treinador Particular Nv.5', description = '+50% bônus treino (mensal)' WHERE category = 'trainer' AND level = 5;

-- 5. Add goalkeeper gloves (new category: gloves)
INSERT INTO store_items (category, name, description, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order) VALUES
-- Luva Agarrar (pegada)
('gloves', 'Luva Agarrar', 'Bônus em pegada (agarrar)', 2000, 1, 5, 'seasonal', 'pegada', 2, false, 140),
('gloves', 'Luva Agarrar', 'Bônus em pegada (agarrar)', 5000, 2, 5, 'seasonal', 'pegada', 4, false, 141),
('gloves', 'Luva Agarrar', 'Bônus em pegada (agarrar)', 12000, 3, 5, 'seasonal', 'pegada', 6, false, 142),
('gloves', 'Luva Agarrar', 'Bônus em pegada (agarrar)', 30000, 4, 5, 'seasonal', 'pegada', 8, false, 143),
('gloves', 'Luva Agarrar', 'Bônus em pegada (agarrar)', 80000, 5, 5, 'seasonal', 'pegada', 10, false, 144),

-- Luva Espalmar (reflexo)
('gloves', 'Luva Espalmar', 'Bônus em reflexo (espalmar)', 2000, 1, 5, 'seasonal', 'reflexo', 2, false, 150),
('gloves', 'Luva Espalmar', 'Bônus em reflexo (espalmar)', 5000, 2, 5, 'seasonal', 'reflexo', 4, false, 151),
('gloves', 'Luva Espalmar', 'Bônus em reflexo (espalmar)', 12000, 3, 5, 'seasonal', 'reflexo', 6, false, 152),
('gloves', 'Luva Espalmar', 'Bônus em reflexo (espalmar)', 30000, 4, 5, 'seasonal', 'reflexo', 8, false, 153),
('gloves', 'Luva Espalmar', 'Bônus em reflexo (espalmar)', 80000, 5, 5, 'seasonal', 'reflexo', 10, false, 154),

-- Luva Saída de Gol (saida_gol)
('gloves', 'Luva Saída de Gol', 'Bônus em saída de gol', 2000, 1, 5, 'seasonal', 'saida_gol', 2, false, 160),
('gloves', 'Luva Saída de Gol', 'Bônus em saída de gol', 5000, 2, 5, 'seasonal', 'saida_gol', 4, false, 161),
('gloves', 'Luva Saída de Gol', 'Bônus em saída de gol', 12000, 3, 5, 'seasonal', 'saida_gol', 6, false, 162),
('gloves', 'Luva Saída de Gol', 'Bônus em saída de gol', 30000, 4, 5, 'seasonal', 'saida_gol', 8, false, 163),
('gloves', 'Luva Saída de Gol', 'Bônus em saída de gol', 80000, 5, 5, 'seasonal', 'saida_gol', 10, false, 164);
