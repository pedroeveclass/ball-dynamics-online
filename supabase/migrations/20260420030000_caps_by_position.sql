-- ═══════════════════════════════════════════════════════════
-- HISTORICAL PLACEHOLDER — already applied on remote.
--
-- This migration introduced an earlier draft of the per-position
-- attribute caps (4-arg get_attribute_cap) where archetype + position
-- stacked via LEAST() and GK WALL was 65. The refined rule (archetype
-- explicit tier REPLACES position cap; POS_WALL = 70) is implemented
-- by a later migration — 20260420060000_caps_by_position_refined.sql
-- — which supersedes all logic defined here.
--
-- This file exists only so the Supabase migration history stays
-- consistent with the remote database. Content is intentionally a
-- no-op on re-run; the refined migration overwrites get_attribute_cap,
-- train_attribute and auto_train_attribute.
-- ═══════════════════════════════════════════════════════════

SELECT 1 WHERE FALSE;
