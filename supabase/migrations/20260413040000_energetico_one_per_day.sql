-- ═══════════════════════════════════════════════════════════
-- Energético: one purchase per day, reset at midnight BRT.
--
-- Previously the guard only rejected the purchase if another
-- energético was still "active/inventory"; once the player consumed
-- it (status → 'used'), they could buy another the same day.
-- Now purchase_store_item refuses a new energético whenever any
-- energy consumable was purchased on the same São Paulo calendar
-- day (used or not), so "1 por dia" is enforced regardless of
-- consumption state.
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.purchase_store_item(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.purchase_store_item(
  p_player_profile_id UUID,
  p_store_item_id UUID,
  p_buyer_type TEXT DEFAULT 'player',
  p_confirm_replace BOOLEAN DEFAULT false
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
  v_already_today_count INT;
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

  -- ── Energético daily limit: 1 per São Paulo calendar day ──
  IF v_item.category = 'consumable' AND v_item.bonus_type = 'energy' THEN
    SELECT COUNT(*) INTO v_already_today_count
    FROM store_purchases sp
    JOIN store_items si ON si.id = sp.store_item_id
    WHERE sp.player_profile_id = p_player_profile_id
      AND si.category = 'consumable'
      AND si.bonus_type = 'energy'
      AND (sp.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          = (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    IF v_already_today_count > 0 THEN
      RETURN jsonb_build_object('error', 'Você já comprou um energético hoje. Reseta à meia-noite.');
    END IF;
  END IF;

  -- ── Conflict pre-check for exclusive categories (before charging) ──
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

  -- ── Charge the buyer ──
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

  -- ── Apply replace (now that we're past the confirmation gate) ──
  IF v_item.category IN ('trainer', 'physio') THEN
    UPDATE store_purchases sp
    SET status = 'replaced'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = p_player_profile_id
      AND sp.status IN ('active', 'cancelling')
      AND si.category = v_item.category;
    v_status := 'active';
  ELSIF v_item.category IN ('boots', 'gloves', 'consumable') THEN
    v_status := 'inventory';
  ELSE
    v_status := 'active';
  END IF;

  INSERT INTO store_purchases (user_id, player_profile_id, store_item_id, level, status, expires_at)
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
    END
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

GRANT EXECUTE ON FUNCTION public.purchase_store_item(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
