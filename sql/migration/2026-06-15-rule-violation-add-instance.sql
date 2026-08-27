-- =============================================================================
-- Migration: add rule_instance to rule_violation + backfill 8002 → 006
-- Date: 2026-06-15
-- =============================================================================
-- Why: violations were stored at the TEMPLATE/function level only (rule_code='8002').
-- The Alert Center must show the INSTANCE (8002/006 vs 8002/009) and group by it, so
-- the violation record now carries rule_instance.
--
-- Backfill rationale: every existing 8002 violation is the 28-day cumulative-block
-- flight-time check (unit=HOUR, 28-day window, 40h limit) = instance 006 "Maximum
-- Flight Time". This is grounded in the stored data, not a guess.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE guarded on rule_instance IS NULL.
-- Run per airline schema (search_path), e.g. f8 / tg.
-- =============================================================================

ALTER TABLE rule_violation ADD COLUMN IF NOT EXISTS rule_instance varchar(20);

UPDATE rule_violation
   SET rule_instance = '006'
 WHERE rule_code = '8002'
   AND rule_instance IS NULL;
