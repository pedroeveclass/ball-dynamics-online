-- RPC: use_energetico — player consumes an active energético purchase
-- Restores 25% of max energy, 1x per day cooldown via last_used_at
CREATE OR REPLACE FUNCTION public.use_energetico(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_player RECORD;
  v_regen INT;
  v_new_energy INT;
BEGIN
  -- Fetch purchase
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Compra não encontrada ou já usada.');
  END IF;

  -- Check cooldown (1x per day)
  IF v_purchase.last_used_at IS NOT NULL AND v_purchase.last_used_at > NOW() - INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('error', 'Você já usou um energético nas últimas 24 horas.');
  END IF;

  -- Fetch item to confirm it's a consumable energy item
  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.category != 'consumable' OR v_item.bonus_type != 'energy' THEN
    RETURN jsonb_build_object('error', 'Este item não é um energético.');
  END IF;

  -- Fetch player
  SELECT * INTO v_player FROM player_profiles WHERE id = v_purchase.player_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Jogador não encontrado.');
  END IF;

  -- Calculate regen (25% of max energy)
  v_regen := FLOOR(v_player.energy_max * (v_item.bonus_value::NUMERIC / 100.0));
  v_new_energy := LEAST(v_player.energy_max, v_player.energy_current + v_regen);

  -- Update player energy
  UPDATE player_profiles SET energy_current = v_new_energy WHERE id = v_player.id;

  -- Mark as used (single_use = expire after use)
  IF v_item.duration = 'single_use' THEN
    UPDATE store_purchases SET status = 'used', last_used_at = NOW() WHERE id = p_purchase_id;
  ELSE
    -- daily items just update last_used_at
    UPDATE store_purchases SET last_used_at = NOW() WHERE id = p_purchase_id;
  END IF;

  RETURN jsonb_build_object(
    'message', FORMAT('Energia recuperada! +%s energia (%s → %s)', v_regen, v_player.energy_current, v_new_energy),
    'energy_before', v_player.energy_current,
    'energy_after', v_new_energy,
    'regen', v_regen
  );
END;
$$;

-- RPC: cancel_store_subscription — cancels an active monthly subscription (trainer/physio)
CREATE OR REPLACE FUNCTION public.cancel_store_subscription(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
BEGIN
  -- Fetch purchase
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada ou já cancelada.');
  END IF;

  -- Fetch item to confirm it's a monthly subscription
  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.duration != 'monthly' THEN
    RETURN jsonb_build_object('error', 'Este item não é uma assinatura mensal.');
  END IF;

  -- Cancel it
  UPDATE store_purchases SET status = 'cancelled' WHERE id = p_purchase_id;

  RETURN jsonb_build_object('message', FORMAT('%s cancelado com sucesso.', v_item.name));
END;
$$;
