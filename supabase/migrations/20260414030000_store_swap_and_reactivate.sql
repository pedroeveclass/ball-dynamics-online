-- Store purchase/equip UX fixes:
--
-- 1. purchase_store_item now *warns* before replacing an active trainer/physio.
--    New optional param `p_confirm_replace`: when false (default), returns a
--    structured conflict result so the client can show a swap dialog. When
--    true, proceeds with the replace (old item → status='replaced', money
--    already paid is lost — the simplest policy).
--
-- 2. equip_store_item for boots now enforces exclusivity by `bonus_type` (one
--    of each type), not by the whole 'boots' category. Gloves keep
--    category-level exclusivity (one pair total).
--
-- 3. New reactivate_store_subscription RPC flips a 'cancelling' subscription
--    back to 'active' so the player can undo a mistaken cancellation while
--    the item is still in its validity window (expires_at > now).

-- Drop the legacy 3-arg overload so client always hits the new signature.
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

  -- ── Conflict pre-check for exclusive categories (before charging) ──
  -- Only trainer & physio auto-activate on purchase, so those are the ones
  -- with a real conflict at buy time. Boots/gloves go to inventory and the
  -- swap happens at equip time.
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

    -- Same item already active → refuse (nothing to do)
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

  -- Notify player when manager gifts an item
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

-- ── Equip fix: boots exclusive by bonus_type, gloves by category ──
CREATE OR REPLACE FUNCTION public.equip_store_item(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id AND status IN ('inventory', 'active');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Item não encontrado.');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.category NOT IN ('boots', 'gloves') THEN
    RETURN jsonb_build_object('error', 'Este item não pode ser equipado.');
  END IF;

  IF v_item.category = 'boots' THEN
    -- Boots: only one active per bonus_type (e.g. Chuteira Precisão ↔ Precisão)
    UPDATE store_purchases sp
    SET status = 'inventory'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = v_purchase.player_profile_id
      AND sp.status = 'active'
      AND si.category = 'boots'
      AND si.bonus_type = v_item.bonus_type
      AND sp.id != p_purchase_id;
  ELSE
    -- Gloves: one active total (goalkeeper uses a single pair)
    UPDATE store_purchases sp
    SET status = 'inventory'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = v_purchase.player_profile_id
      AND sp.status = 'active'
      AND si.category = 'gloves'
      AND sp.id != p_purchase_id;
  END IF;

  UPDATE store_purchases SET status = 'active' WHERE id = p_purchase_id;

  RETURN jsonb_build_object('message', FORMAT('%s equipado!', v_item.name));
END;
$$;

-- ── New: reactivate a cancelled subscription (only if still within window) ──
CREATE OR REPLACE FUNCTION public.reactivate_store_subscription(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id AND status = 'cancelling';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Assinatura não está marcada para cancelamento.');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.duration != 'monthly' THEN
    RETURN jsonb_build_object('error', 'Este item não é uma assinatura mensal.');
  END IF;

  IF v_purchase.expires_at IS NOT NULL AND v_purchase.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'Assinatura já expirou e não pode mais ser reativada.');
  END IF;

  UPDATE store_purchases SET status = 'active' WHERE id = p_purchase_id;

  RETURN jsonb_build_object('message', FORMAT('%s: renovação reativada.', v_item.name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_store_item(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_store_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_store_subscription(UUID) TO authenticated;
