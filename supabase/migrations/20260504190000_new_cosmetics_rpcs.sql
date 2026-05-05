-- ============================================================
-- Wire the new cosmetics into the purchase + read pipeline.
--
-- 1. get_player_cosmetics_public returns the new metadata columns
--    (tattoo_design, accessory_variant, face_paint_design,
--    face_paint_color2) so PublicPlayerPage / cosmetics.ts can
--    aggregate them.
-- 2. purchase_store_item accepts the new params + an optional
--    p_side picked at buy time (tattoo/bracelet are per-arm so we
--    persist the side immediately rather than asking again at
--    equip time).
-- 3. Flip is_available=true on the 11 items seeded in 20260504180000
--    so they show up in the store.
-- ============================================================

-- ── 1. Public cosmetics RPC: expose the new columns ──
-- DROP first because the return type changed (4 new TABLE columns) and
-- Postgres won't allow CREATE OR REPLACE to alter the return shape.
DROP FUNCTION IF EXISTS public.get_player_cosmetics_public(UUID);

CREATE OR REPLACE FUNCTION public.get_player_cosmetics_public(p_player_profile_id UUID)
RETURNS TABLE (
  store_item_id UUID,
  color TEXT,
  color2 TEXT,
  color3 TEXT,
  side TEXT,
  bg_variant TEXT,
  bg_image_url TEXT,
  tattoo_design TEXT,
  accessory_variant TEXT,
  face_paint_design TEXT,
  face_paint_color2 TEXT,
  item_name TEXT,
  item_name_pt TEXT,
  item_name_en TEXT,
  item_category TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sp.store_item_id,
    sp.color,
    sp.color2,
    sp.color3,
    sp.side,
    sp.bg_variant,
    sp.bg_image_url,
    sp.tattoo_design,
    sp.accessory_variant,
    sp.face_paint_design,
    sp.face_paint_color2,
    si.name AS item_name,
    si.name_pt AS item_name_pt,
    si.name_en AS item_name_en,
    si.category AS item_category
  FROM public.store_purchases sp
  JOIN public.store_items si ON si.id = sp.store_item_id
  WHERE sp.player_profile_id = p_player_profile_id
    AND sp.status IN ('active', 'cancelling')
    AND si.category IN ('boots', 'gloves', 'cosmetic');
$$;

GRANT EXECUTE ON FUNCTION public.get_player_cosmetics_public(UUID) TO authenticated, anon;

-- ── 2. purchase_store_item: accept new metadata + buy-time side ──
DROP FUNCTION IF EXISTS public.purchase_store_item(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.purchase_store_item(
  p_player_profile_id UUID,
  p_store_item_id UUID,
  p_buyer_type TEXT DEFAULT 'player',
  p_confirm_replace BOOLEAN DEFAULT false,
  p_color TEXT DEFAULT NULL,
  p_color2 TEXT DEFAULT NULL,
  p_color3 TEXT DEFAULT NULL,
  p_bg_variant TEXT DEFAULT NULL,
  p_bg_image_url TEXT DEFAULT NULL,
  p_side TEXT DEFAULT NULL,
  p_tattoo_design TEXT DEFAULT NULL,
  p_accessory_variant TEXT DEFAULT NULL,
  p_face_paint_design TEXT DEFAULT NULL,
  p_face_paint_color2 TEXT DEFAULT NULL
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
  v_side TEXT;
  v_tattoo_design TEXT;
  v_accessory_variant TEXT;
  v_face_paint_design TEXT;
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

  -- Whitelist new metadata so a malformed client can't sneak garbage in.
  v_side := CASE WHEN p_side IN ('left','right','both','long','short') THEN p_side ELSE NULL END;
  v_tattoo_design := CASE WHEN p_tattoo_design IN ('tribal','cross','heart','anchor','star') THEN p_tattoo_design ELSE NULL END;
  v_accessory_variant := CASE WHEN p_accessory_variant IN ('sunglasses','wayfarers','round','prescription01','prescription02','kurt','eyepatch') THEN p_accessory_variant ELSE NULL END;
  v_face_paint_design := CASE WHEN p_face_paint_design IN ('brasil','horizontal','two_stripes','wings') THEN p_face_paint_design ELSE NULL END;

  INSERT INTO store_purchases (
    user_id, player_profile_id, store_item_id, level, status, expires_at,
    color, color2, color3, side,
    bg_variant, bg_image_url,
    tattoo_design, accessory_variant, face_paint_design, face_paint_color2
  )
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
    v_side,
    v_bg_variant,
    v_bg_image_url,
    v_tattoo_design,
    v_accessory_variant,
    v_face_paint_design,
    CASE WHEN p_face_paint_color2 ~ '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$' THEN p_face_paint_color2 ELSE NULL END
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

GRANT EXECUTE ON FUNCTION public.purchase_store_item(
  UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ── 3. Flip is_available=true on the 11 new items ──
UPDATE public.store_items
SET is_available = true
WHERE name IN (
  'Tatuagem',
  'Pintura Facial',
  'Brinco',
  'Headband',
  'Cordão de Prata',
  'Cordão de Ouro',
  'Pulseira de Prata',
  'Pulseira de Ouro',
  'Bandana',
  'Modo Sem Camisa',
  'Óculos'
);
