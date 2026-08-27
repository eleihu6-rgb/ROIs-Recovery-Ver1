---
name: 127-pairing-open-credit-badge
description: Add or maintain the gantt Pairing pane "open/partial coverage total credit" badge (HH:MM next to the count badge, shown only when Coverage narrows to Open/Partial) and the pane-title "Main"-removal. Use when touching pairing-pane credit aggregates, coverage-gated toolbar badges, the shared pairing-credit util, or when a feature must land in BOTH the Live legacy pairing pane AND the Scenario SharedPairingPane. Also the canonical note that the pairing Coverage DEFAULT is ['open','partial'] (NOT all-states).
---

# Pairing open-credit badge + Main-title removal

A shipped gantt feature (F316, branch `feat/gantt/res-pairing-creator`). Read
`docs/modules/gantt/live-scenario-gantt-playbook.md` §9 first (this skill is the how-to; the
playbook is the canonical reference). Always load **115-gantt-playbook** before gantt work.

## Product principle (drives every design choice here)
The planner's focus is **always uncovered work = open + partial pairings** ("what still needs crew, how
do I cover it?"). Full/over trips are already done — noise for that job. So the pairing board is biased to
open+partial: the Coverage filter **defaults to `['open','partial']`** and the credit badge sums **only**
those trips (= how much flying still needs crewing), never a total over all pairings. When adding ANY
pairing aggregate/summary, scope it to the uncovered set by default; don't total all-pairings or default a
filter to all-states.

## What it does
1. **Open-credit badge** — next to the pairing pane count badge, a `Clock` badge shows the summed
   credit (HH:MM) of the still-uncovered pairings, **only** when the Coverage filter is a non-empty
   subset of `{open, partial}`. Credit comes from each pairing's own credit (the "Cred" column).
2. **"Main" removal** — pane titles dropped the redundant "Main": `Roster Main`→`Roster`,
   `Pairing Main`→`Pairing` (Sub labels unchanged; Flight was already just "Flight").

## Key facts (verified 2026-06-23 against the running app)
- **Pairing Coverage DEFAULT is `['open','partial']`** (`gantt/src/stores/filter-store.ts:66`,
  `DEFAULT_PAIRING_FILTER`) — NOT `[...ALL_COVERAGE]`. The pane opens narrowed, so the badge shows
  out of the box. Older specs/notes claiming an all-states default are STALE (pre-existing red:
  `pairing-coverage-badge` Live-1111/1112; `scenario-pairing-filter` Scen-2017/2018 — the open+partial
  hard filter yields 2 rows, not 3). The Filter-dialog coverage *toggle* is also flaky in the e2e
  demo env — don't drive coverage through the dialog; set it via the `applyPairingFilter` test hook.
- **Live pairing is still the LEGACY fork** (`panes/pairing-pane.tsx` → its own `PaneToolbar`); only
  roster/flight are thin wrappers over Shared panes. Scenario pairing uses `SharedPairingPane` →
  toolbar render-prop → `ScenarioPaneToolbar`. So a pairing-pane feature must be wired in BOTH places
  until 5B-2 (switch Live pairing to SharedPairingPane) lands. Keep the math in ONE util.
- **In Live, Coverage is an overlay** (float-to-top; not sent to server) → sum over LOADED rows
  matching the selection. **In Scenario it's a hard filter** (`coverageMatches` drops rows) → sum over
  the filtered rows. `sumCoverageCredit` re-filters by `classifyCoverage` so both are correct.

## The shared util (single source of truth)
`gantt/src/utils/pairing-credit.ts`:
- `pairingCreditedMinutes(item)` — credit deduped by `dutySeq` (= the "Cred" column). Was duplicated
  inline in Live `pairing-pane.tsx` and exported from `scenario-gantt-source.ts`; now centralized here.
- `isOpenPartialCoverage(cov)` — non-empty AND every state ∈ {open, partial} (the badge gate).
- `sumCoverageCredit(items, coverageSel)` — Σ credit of items whose `classifyCoverage ∈ coverageSel`.

## Wiring map (where to touch)
- Util: `gantt/src/utils/pairing-credit.ts` (+ `scenario-gantt-source.ts` imports it; SharedPairingPane imports it).
- Live: `panes/pairing-pane.tsx` computes `openCreditText` (gate `isOpenPartialCoverage(coverageSel)`,
  sum over `pairingItems`) → `PaneToolbar` `openCredit` prop → badge (`pane-open-credit` testid).
- Scenario: `SharedPairingPane` computes `openCreditText` → `toolbar(rowCount, openCredit)` render-prop →
  `scenario-pairing-pane.tsx` → `ScenarioPaneToolbar` renders the badge.
- Titles: `panes/roster-pane.tsx:151`, `panes/pairing-pane.tsx` (`pairingTitle`), `shared/roster-pane.tsx`
  (SortDialog paneLabel). `pane.ts`/`header.tsx` toggle labels are a DIFFERENT surface — leave them.
- Test hook: `gantt-test-hook.ts` `pairingOpenCredit()` (mirrors the badge math; `applyPairingFilter`
  widened to accept `coverage`). Badge style: `bg-primary/10 text-primary`, `Clock h-3 w-3`, `text-2xs`,
  `font-mono tabular-nums` (token-only; passes `npm run check:ui`). Per §Pane-Toolbar-Home it lives in
  the count-badge cluster, never its own band.

## Tests (all green)
- Unit: `gantt/src/utils/__tests__/pairing-credit.test.ts` (math, dedup, gate, exclusion).
- Live e2e: `e2e/tests/gantt/pairing-open-credit-badge.spec.ts` (Live-1295..1298): titles drop Main;
  default open+partial → badge = `pairingOpenCredit()` value; widening to all hides it; open ≤ open+partial.
- Scenario e2e: `e2e/tests/gantt/scenario-pairing-open-credit.spec.ts` (Scen-2095): mock 3 pairings
  (open/partial/full, 480 min each) → badge = `16:00` (480+480, full excluded). No engine-server.
- Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps
  --workers=1 <spec>` (workers=1 — parallel contention vs the slow remote DB flakes the first cold load).
- Bump `gantt/src/version.ts` `FRONTEND_VERSION` (+1, frontend-only). Run `npm run check:ui` + `tsc`.
