-- ═══════════════════════════════════════════════════════════
-- Track the pickup slot_id on match_participants for Várzea games.
--
-- Context: league matches resolve display position via
-- `lineup_slot_id → lineup_slots.slot_position`. Pickup matches have
-- no lineup, so the sidebar used to fall back to `primary_position`
-- (wrong — e.g. a human with primary ATA who entered the DEF slot
-- showed as "ATA"). This column records which pickup slot the
-- participant occupies so the front-end can show the right label.
-- NULL for every non-pickup participant.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS pickup_slot_id TEXT;

COMMENT ON COLUMN public.match_participants.pickup_slot_id IS
  'Slot id from src/lib/pickupSlots.ts (e.g. GK, DEF1, MC, ATA, CB1, ST2). Set only for matches with match_type=pickup.';
