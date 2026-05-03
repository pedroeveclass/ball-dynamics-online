-- Compression top / tights pick "both / right / left" at equip time, so the
-- side column needs to also accept 'both'. Updates the constraint and the
-- equip RPC's accepted-value list. Existing 'left' / 'right' / 'long' /
-- 'short' rows keep working unchanged.

ALTER TABLE public.store_purchases
  DROP CONSTRAINT IF EXISTS store_purchases_side_check;
ALTER TABLE public.store_purchases
  ADD CONSTRAINT store_purchases_side_check
  CHECK (side IS NULL OR side IN ('left', 'right', 'long', 'short', 'both'));

CREATE OR REPLACE FUNCTION public.equip_store_item(
  p_purchase_id UUID,
  p_side TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_side TEXT;
BEGIN
  SELECT * INTO v_purchase FROM store_purchases WHERE id = p_purchase_id AND status IN ('inventory', 'active');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Item não encontrado.');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = v_purchase.store_item_id;
  IF NOT FOUND OR v_item.category NOT IN ('boots', 'gloves', 'cosmetic') THEN
    RETURN jsonb_build_object('error', 'Este item não pode ser equipado.');
  END IF;

  v_side := CASE WHEN p_side IN ('left', 'right', 'long', 'short', 'both') THEN p_side ELSE NULL END;

  IF v_item.category = 'boots' THEN
    UPDATE store_purchases sp
    SET status = 'inventory'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = v_purchase.player_profile_id
      AND sp.status = 'active'
      AND si.category = 'boots'
      AND si.bonus_type = v_item.bonus_type
      AND sp.id != p_purchase_id;
  ELSIF v_item.category = 'gloves' THEN
    UPDATE store_purchases sp
    SET status = 'inventory'
    FROM store_items si
    WHERE sp.store_item_id = si.id
      AND sp.player_profile_id = v_purchase.player_profile_id
      AND sp.status = 'active'
      AND si.category = 'gloves'
      AND sp.id != p_purchase_id;
  ELSE
    UPDATE store_purchases sp
    SET status = 'inventory'
    WHERE sp.player_profile_id = v_purchase.player_profile_id
      AND sp.status = 'active'
      AND sp.store_item_id = v_item.id
      AND sp.id != p_purchase_id;
  END IF;

  UPDATE store_purchases SET status = 'active', side = v_side WHERE id = p_purchase_id;

  RETURN jsonb_build_object('message', FORMAT('%s equipado!', v_item.name));
END;
$$;

GRANT EXECUTE ON FUNCTION public.equip_store_item(UUID, TEXT) TO authenticated;
