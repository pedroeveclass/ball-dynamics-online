-- "Fundo do Visual" cosmetic — adds a background to the player visual area
-- (profile + public page). The buyer picks one of these variants on
-- purchase: solid color, gradient (vertical/horizontal/diagonal), striped
-- pattern (vertical/horizontal/diagonal), checker, dots, or a custom
-- uploaded image. Re-buy is required to change variant or photo.

-- ── store_purchases columns ──
ALTER TABLE public.store_purchases
  ADD COLUMN IF NOT EXISTS bg_variant TEXT,
  ADD COLUMN IF NOT EXISTS bg_image_url TEXT;

-- ── purchase_store_item: accept p_bg_variant + p_bg_image_url ──
DROP FUNCTION IF EXISTS public.purchase_store_item(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.purchase_store_item(
  p_player_profile_id UUID,
  p_store_item_id UUID,
  p_buyer_type TEXT DEFAULT 'player',
  p_confirm_replace BOOLEAN DEFAULT false,
  p_color TEXT DEFAULT NULL,
  p_color2 TEXT DEFAULT NULL,
  p_color3 TEXT DEFAULT NULL,
  p_bg_variant TEXT DEFAULT NULL,
  p_bg_image_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_player RECORD;
  v_club_finance RECORD;
  v_user_id UUID;
  v_club_id UUID;
  v_cost NUMERIC;
  v_status TEXT;
  v_club_name TEXT;
  v_current RECORD;
  v_bg_variant TEXT;
  v_bg_image_url TEXT;
BEGIN
  SELECT * INTO v_item FROM store_items WHERE id = p_store_item_id AND is_available = true;
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('error', 'Item não encontrado ou indisponível');
  END IF;

  SELECT * INTO v_player FROM player_profiles WHERE id = p_player_profile_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('error', 'Jogador não encontrado');
  END IF;

  v_user_id := COALESCE(v_player.user_id, auth.uid());
  v_cost := v_item.price;

  IF v_item.category IN ('trainer', 'physio') THEN
    SELECT sp.*, si.name AS item_name, si.level AS item_level
      INTO v_current
    FROM store_purchases sp
    JOIN store_items si ON si.id = sp.store_item_id
    WHERE sp.player_profile_id = p_player_profile_id
      AND sp.status IN ('active', 'cancelling')
      AND si.category = v_item.category
    LIMIT 1;

    IF FOUND AND v_current.store_item_id != p_store_item_id AND NOT p_confirm_replace THEN
      RETURN jsonb_build_object(
        'conflict', true,
        'category', v_item.category,
        'current_item_name', v_current.item_name,
        'current_item_level', v_current.item_level,
        'new_item_name', v_item.name,
        'new_item_level', v_item.level,
        'new_item_price', v_cost
      );
    END IF;

    IF FOUND AND v_current.store_item_id = p_store_item_id THEN
      RETURN jsonb_build_object('error', 'Você já tem este item ativo.');
    END IF;
  END IF;

  IF p_buyer_type = 'club' THEN
    v_club_id := v_player.club_id::UUID;
    SELECT * INTO v_club_finance FROM club_finances WHERE club_id = v_club_id;
    IF v_club_finance IS NULL OR v_club_finance.balance < v_cost THEN
      RETURN jsonb_build_object('error', 'Saldo insuficiente do clube');
    END IF;
    UPDATE club_finances SET balance = balance - v_cost WHERE club_id = v_club_id;
    SELECT name INTO v_club_name FROM clubs WHERE id = v_club_id;
  ELSE
    IF v_player.money < v_cost THEN
      RETURN jsonb_build_object('error', 'Saldo insuficiente');
    END IF;
    UPDATE player_profiles SET money = money - v_cost WHERE id = p_player_profile_id;
  END IF;

  IF v_item.category = 'donation' THEN
    v_club_id := v_player.club_id::UUID;
    IF v_club_id IS NOT NULL THEN
      UPDATE club_finances SET balance = balance + v_cost WHERE club_id = v_club_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Doação realizada com sucesso!');
  END IF;

  IF v_item.category IN ('trainer', 'physio') THEN
    UPDATE store_purchases sp
    SET status = 'replaced'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = p_player_profile_id
      AND sp.status IN ('active', 'cancelling')
      AND si.category = v_item.category;
    v_status := 'active';
  ELSIF v_item.category IN ('boots', 'gloves', 'cosmetic', 'consumable') THEN
    v_status := 'inventory';
  ELSE
    v_status := 'active';
  END IF;

  -- Whitelist the variant string and image URL so a malformed client can't
  -- inject anything weird into the column.
  v_bg_variant := CASE
    WHEN p_bg_variant IN (
      'solid', 'gradient_vertical', 'gradient_horizontal', 'gradient_diagonal',
      'stripes_vertical', 'stripes_horizontal', 'stripes_diagonal',
      'checker', 'dots', 'image'
    ) THEN p_bg_variant
    ELSE NULL
  END;

  v_bg_image_url := CASE
    WHEN p_bg_image_url ~ '^https?://' THEN p_bg_image_url
    ELSE NULL
  END;

  INSERT INTO store_purchases (user_id, player_profile_id, store_item_id, level, status, expires_at, color, color2, color3, bg_variant, bg_image_url)
  VALUES (
    v_user_id,
    p_player_profile_id,
    p_store_item_id,
    COALESCE(v_item.level, 1),
    v_status,
    CASE
      WHEN v_item.duration = 'monthly' THEN now() + INTERVAL '30 days'
      WHEN v_item.duration = 'seasonal' THEN NULL
      ELSE NULL
    END,
    CASE WHEN p_color  ~ '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$' THEN p_color  ELSE NULL END,
    CASE WHEN p_color2 ~ '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$' THEN p_color2 ELSE NULL END,
    CASE WHEN p_color3 ~ '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$' THEN p_color3 ELSE NULL END,
    v_bg_variant,
    v_bg_image_url
  );

  IF p_buyer_type = 'club' AND v_player.user_id IS NOT NULL AND v_player.user_id != auth.uid() THEN
    INSERT INTO notifications (user_id, type, title, body)
    VALUES (
      v_player.user_id,
      'store',
      '🎁 Você recebeu um item!',
      FORMAT('Seu clube %s te deu: %s. Confira em Meus Itens na Loja.', COALESCE(v_club_name, ''), v_item.name)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message',
    CASE
      WHEN v_status = 'inventory' THEN 'Item adquirido! Vá em Meus Itens para ativar.'
      ELSE 'Compra realizada com sucesso!'
    END,
    'item_name', v_item.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_store_item(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── Storage bucket for the uploaded images ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-backgrounds', 'player-backgrounds', true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- File paths are '<user_id>/<filename>'. The first folder segment must
-- match auth.uid() — that's our authorization. Public read so the uploaded
-- image renders on the profile and public page for everyone.

DROP POLICY IF EXISTS "Public read player-backgrounds" ON storage.objects;
CREATE POLICY "Public read player-backgrounds"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'player-backgrounds');

DROP POLICY IF EXISTS "Owner can upload own background" ON storage.objects;
CREATE POLICY "Owner can upload own background"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'player-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner can update own background" ON storage.objects;
CREATE POLICY "Owner can update own background"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'player-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner can delete own background" ON storage.objects;
CREATE POLICY "Owner can delete own background"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'player-backgrounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Seed the cosmetic ──
INSERT INTO public.store_items (category, name, name_pt, name_en, description, description_pt, description_en, price, level, max_level, duration, bonus_type, bonus_value, is_available, sort_order)
SELECT 'cosmetic', 'Fundo do Visual', 'Fundo do Visual', 'Visual Background',
       'Personalize o fundo do seu perfil', 'Personalize o fundo do seu perfil', 'Customize your profile background',
       8000, NULL, NULL, 'permanent', NULL, NULL, true, 18
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_items WHERE name IN ('Fundo do Visual', 'Visual Background')
);
