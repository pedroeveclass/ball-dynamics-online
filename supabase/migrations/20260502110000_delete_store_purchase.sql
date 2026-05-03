-- delete_store_purchase: lets the player permanently discard an owned
-- equipment / cosmetic so they can buy a different colored one. No refund —
-- the player chose to throw it away. Trainer / physio subscriptions keep
-- using their existing cancel flow and are not deletable here.

CREATE OR REPLACE FUNCTION public.delete_store_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_player RECORD;
BEGIN
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Item não encontrado.');
  END IF;

  -- Only the user that owns the player_profile can discard one of their
  -- items. Bot players (user_id NULL) can't be touched by anyone here.
  SELECT * INTO v_player FROM player_profiles WHERE id = v_purchase.player_profile_id;
  IF v_player.user_id IS NULL OR v_player.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'Você não tem permissão para excluir este item.');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.category NOT IN ('boots', 'gloves', 'cosmetic') THEN
    RETURN jsonb_build_object('error', 'Este item não pode ser excluído.');
  END IF;

  DELETE FROM store_purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('message', FORMAT('%s excluído.', v_item.name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_store_purchase(UUID) TO authenticated;
