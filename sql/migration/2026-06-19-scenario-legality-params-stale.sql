-- 2026-06-19  Scenario legality: params_stale soft-invalidation flag
-- Spec: docs/superpowers/specs/2026-06-19-legality-auto-recheck-on-param-change-design.md §4.4
--
-- Out-of-window scenarios get a soft "rule params changed since last check" flag instead of a
-- forced recompute. ensureLegality reports it; a manual Recheck clears it.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
alter table scenario.legality_status
  add column if not exists params_stale boolean not null default false;
