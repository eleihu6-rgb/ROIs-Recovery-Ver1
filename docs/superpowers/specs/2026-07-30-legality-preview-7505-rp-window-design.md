# Design: Legality preview uses Gantt RP for 7505 / 7507

**Date:** 2026-07-30  
**Status:** Approved (user: check 7505/7507 against current Gantt RP)

## Problem

Draft legality preview (`POST /api/legality/preview-draft`) sets `ctx.dateFrom` / `ctx.dateTo` to a padded check window (~task ± 365 / +31 days). Rules **7505** and **7507** treat that range as the rostering period (`crewLocalRpWindowUtc` → `rp_days`). Param bands only match **30–30** / **31–31** day RPs, so preview never emits Min-GDO findings and the assign Warning dialog never opens—even when the same crew violates under a real calendar-month RP.

## Decision

1. **Frontend** always sends `rpFrom` / `rpTo` (inclusive `YYYY-MM-DD`) on preview-draft.
   - Prefer selected `roster_period.rp_start` / `rp_end` **strings** (not `Date#toISOString` of end-of-local-day ms — that shifts e.g. 31 Jul → 01 Aug UTC and breaks 31-day bands).
   - Fallback: toolbar/view bounds with a mid-day bias when converting ms → YMD.
2. **Backend** accepts optional `rpFrom` / `rpTo` (both required together). Preview still loads roster via the padded `checkFrom`/`checkToExclusive` source window. Context gains `rpFrom` / `rpTo` when provided.
3. **`rule7505` / `rule7507`** use `ctx.rpFrom ?? ctx.dateFrom` and `ctx.rpTo ?? ctx.dateTo`, then **`listInclusiveCalendarMonths`** so each calendar month is checked as its own RP (fixes live mutation recheck windows of ~33–400 days that never matched 30/31 bands).
4. **Draft dialog**: 7505/7507 findings after an edit always open the Warning dialog even if the same finding existed before the edit.
5. **Draft bell / Alert Center**: preview 7505/7507 hits are written into `sessionViolationStore` so the crew bell lights before Save; after Save, live recheck persists into `rule_violation` (month-split) for the shared Alert Center.

## Out of scope

- Persisting sit `rule_violation` for 7505 (separate recheck run).
- Changing leave-code VAC vs LEAVE vocabulary.
- Changing Soft vs Hard dialog policy (7505 remains Soft / Continue).

## Verification

- Unit: core uses `rpFrom`/`rpTo` when set; API schema accepts the fields.
- Frontend: `checkDraft` includes RP from filter bounds.
- Playwright or focused Vitest: preview with July RP yields 7505 when Min DO not met (or mock-level assert that RP is forwarded).
