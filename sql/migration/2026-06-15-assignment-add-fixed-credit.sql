-- =============================================================================
-- 2026-06-15  assignment: add fixed_credit_min column + import per-assignment fixed credit
-- =============================================================================
-- Adds a FIXED (flat) credit-hours value per assignment — the credit an assignment earns
-- regardless of its duration (e.g. VAC=4:00, FC=7:00, NQ=2:30, TAXI=0:20; AL/leave/GDO=0).
-- Live equivalent of the legacy 7502 "Minimum CH" floor, now data-driven per assignment.
-- Stored in MINUTES (HH:MM × 60). NULL = no fixed credit.
--
-- Idempotent. EXISTING assignment codes: ONLY fixed_credit_min is updated (description,
-- type, color and all factors are preserved). NEW codes are inserted with placeholder
-- description/type/color (refine later). F8 schema (search_path).
-- =============================================================================

ALTER TABLE assignment ADD COLUMN IF NOT EXISTS fixed_credit_min integer;
COMMENT ON COLUMN assignment.fixed_credit_min IS '固定信用积分（分钟）：该任务不论时长的固定 credit；NULL=无固定 credit';

-- 5 columns / 5 values per row; created_by/updated_by fall back to DEFAULT 'system'.
INSERT INTO assignment (assignment, description, type, color_hex, fixed_credit_min)
VALUES
  ('ACPG', 'ACPG', 'T', 'CCCCCC', 240),
  ('ADM', 'ADM', 'W', 'CCCCCC', 240),
  ('AL', 'AL', 'L', 'CCCCCC', 0),
  ('ALS', 'ALS', 'L', 'CCCCCC', 0),
  ('ASBY', 'ASBY', 'S', 'CCCCCC', 240),
  ('BMT', 'BMT', 'T', 'CCCCCC', 240),
  ('BO', 'BO', 'O', 'CCCCCC', 0),
  ('CBT', 'CBT', 'T', 'CCCCCC', 240),
  ('COD', 'COD', 'W', 'CCCCCC', 240),
  ('CRM', 'CRM', 'T', 'CCCCCC', 240),
  ('CUG', 'CUG', 'W', 'CCCCCC', 240),
  ('DWP', 'DWP', 'W', 'CCCCCC', 240),
  ('EPTP', 'EPTP', 'T', 'CCCCCC', 240),
  ('FC', 'FC', 'W', 'CCCCCC', 420),
  ('FLY5T', 'FLY5T', 'W', 'CCCCCC', 240),
  ('FLYAC', 'FLYAC', 'W', 'CCCCCC', 240),
  ('FLYF8', 'FLYF8', 'W', 'CCCCCC', 240),
  ('FLYPD', 'FLYPD', 'W', 'CCCCCC', 240),
  ('FLYTS', 'FLYTS', 'W', 'CCCCCC', 240),
  ('FLYWS', 'FLYWS', 'W', 'CCCCCC', 240),
  ('FLYXX', 'FLYXX', 'W', 'CCCCCC', 240),
  ('FTG', 'FTG', 'T', 'CCCCCC', 240),
  ('GDO', 'GDO', 'O', 'CCCCCC', 0),
  ('GRD', 'GRD', 'W', 'CCCCCC', 240),
  ('GT', 'GT', 'W', 'CCCCCC', 240),
  ('ILADJ', 'ILADJ', 'L', 'CCCCCC', 0),
  ('ILL', 'ILL', 'L', 'CCCCCC', 240),
  ('INV', 'INV', 'W', 'CCCCCC', 240),
  ('JURY', 'JURY', 'W', 'CCCCCC', 240),
  ('LEAVE', 'LEAVE', 'L', 'CCCCCC', 0),
  ('LFT', 'LFT', 'W', 'CCCCCC', 240),
  ('MLOA', 'MLOA', 'L', 'CCCCCC', 0),
  ('MLP', 'MLP', 'W', 'CCCCCC', 240),
  ('MTG', 'MTG', 'W', 'CCCCCC', 240),
  ('NQ', 'NQ', 'W', 'CCCCCC', 150),
  ('OBDO', 'OBDO', 'O', 'CCCCCC', 240),
  ('OFC', 'OFC', 'W', 'CCCCCC', 240),
  ('PATL', 'PATL', 'L', 'CCCCCC', 0),
  ('POFC', 'POFC', 'W', 'CCCCCC', 240),
  ('PPD', 'PPD', 'W', 'CCCCCC', 240),
  ('PRAM', 'PRAM', 'S', 'CCCCCC', 240),
  ('PRMM', 'PRMM', 'S', 'CCCCCC', 240),
  ('PRMOD', 'PRMOD', 'S', 'CCCCCC', 240),
  ('PRPM', 'PRPM', 'S', 'CCCCCC', 240),
  ('RCO', 'RCO', 'L', 'CCCCCC', 0),
  ('RESNQ', 'RESNQ', 'S', 'CCCCCC', 240),
  ('RSGN', 'RSGN', 'L', 'CCCCCC', 0),
  ('RVAC', 'RVAC', 'L', 'CCCCCC', 240),
  ('SCM', 'SCM', 'W', 'CCCCCC', 240),
  ('SIM', 'SIM', 'T', 'CCCCCC', 240),
  ('ST', 'ST', 'W', 'CCCCCC', 0),
  ('ST180', 'ST180', 'W', 'CCCCCC', 0),
  ('ST300', 'ST300', 'W', 'CCCCCC', 0),
  ('ST90', 'ST90', 'W', 'CCCCCC', 0),
  ('ST95', 'ST95', 'W', 'CCCCCC', 0),
  ('TAXI', 'TAXI', 'W', 'CCCCCC', 20),
  ('TDG', 'TDG', 'T', 'CCCCCC', 240),
  ('TGDO', 'TGDO', 'O', 'CCCCCC', 0),
  ('TGS', 'TGS', 'T', 'CCCCCC', 240),
  ('TRNG', 'TRNG', 'T', 'CCCCCC', 240),
  ('TSPD', 'TSPD', 'W', 'CCCCCC', 240),
  ('TTT', 'TTT', 'T', 'CCCCCC', 240),
  ('UAV', 'UAV', 'L', 'CCCCCC', 0),
  ('UBMT', 'UBMT', 'T', 'CCCCCC', 0),
  ('UFF', 'UFF', 'L', 'CCCCCC', 0),
  ('UFTG', 'UFTG', 'T', 'CCCCCC', 0),
  ('UILL', 'UILL', 'L', 'CCCCCC', 0),
  ('UNION', 'UNION', 'W', 'CCCCCC', 240),
  ('UNMCS', 'UNMCS', 'L', 'CCCCCC', 0),
  ('UNS', 'UNS', 'L', 'CCCCCC', 0),
  ('UPD', 'UPD', 'L', 'CCCCCC', 0),
  ('VAC', 'VAC', 'L', 'CCCCCC', 240),
  ('VGDO', 'VGDO', 'O', 'CCCCCC', 0),
  ('VR', 'VR', 'W', 'CCCCCC', 240),
  ('WATRS', 'WATRS', 'W', 'CCCCCC', 30),
  ('WCB', 'WCB', 'L', 'CCCCCC', 0),
  ('WCNW', 'WCNW', 'L', 'CCCCCC', 0),
  ('WILD', 'WILD', 'W', 'CCCCCC', 0)
ON CONFLICT (assignment) DO UPDATE
  SET fixed_credit_min = EXCLUDED.fixed_credit_min,   -- existing rows: update ONLY fixed credit
      updated_at = now(),
      updated_by = 'credit_import';
