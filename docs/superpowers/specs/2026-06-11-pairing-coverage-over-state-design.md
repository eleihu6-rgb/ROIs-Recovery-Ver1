# Pairing Coverage — add `over` (over-staffed) state

**Date:** 2026-06-11
**Module:** gantt (live Pairing pane) + live-server (pairing list service)
**Status:** Design approved

## Problem

The live Pairing pane classifies each pairing's crewing coverage into three states — `open`, `partial`, `full` — exposed as a Coverage filter (bring-to-top overlay) with chips. **Over-staffed** pairings (a rank slot with `fill > plan`, e.g. `CA(2:3)`) have no state of their own: today they fall through inconsistently.

The classification logic is **copy-pasted in four places** and they disagree on over-staffing:

| Site | "full" rule | Over-staffed verdict |
|---|---|---|
| `live-server/.../pairing-service.ts` (authoritative list filter) | `plan === fill` | `partial` (amber) |
| `gantt/.../pairing-api.ts` `getDetail` backfill | `fill >= plan` | `full` (green) |
| `gantt/.../panes/pairing-pane.tsx` `computeCoverage` | via `p.isFull` | follows whichever isFull it got |
| `gantt/.../scenario-gantt/scenario-pairing-pane.tsx` | `fill === plan` | `partial` |

So the same over-staffed pairing can show a green left-edge border (detail-loaded) or amber (list-loaded), and cannot be filtered for.

## Goal

Add a first-class `over` coverage state, selectable in the Pairing-pane Coverage filter alongside `open`/`partial`/`full`, with chips and bring-to-top behavior identical to the other states. Unify the classifier so all surfaces agree.

**Out of scope:** the scenario Pairing pane (`scenario-pairing-pane.tsx`) keeps its own 3-state copy untouched. No timeline-bar visual cue (the Comp column already conveys coverage).

## Coverage model (canonical)

Input: a pairing's composition slots `{ plan, fill }[]`. Output: exactly one state.

```
comp empty (no requirement)          → full
total fill == 0                      → open
some slot fill <  plan               → partial      // shortage wins (decided)
some slot fill >  plan (none short)  → over
otherwise (every slot fill == plan)  → full
```

**Precedence (decided): shortage wins.** A pairing over-staffed on one rank but short on another (e.g. `CA(2:3)` + `FO(1:0)`) classifies as `partial` — a row that still needs crew never hides under `over`. `over` requires *no* shortage anywhere plus at least one surplus.

### Shared classifier

New util `gantt/src/utils/pairing-coverage.ts`:

```ts
export type CoverageState = 'open' | 'partial' | 'full' | 'over'
export const classifyCoverage = (comp: { plan: number; fill: number }[]): CoverageState => { ... }
```

Consumed by `pairing-pane.tsx` and `pairing-api.ts` (replacing their local copies). `live-server` is a separate package and cannot import it, so `pairing-service.ts` keeps a **mirrored** copy with a cross-reference comment; both get the same unit-test table so they can't drift.

## Changes

### gantt (frontend)

1. **`src/utils/pairing-coverage.ts`** (new) — `CoverageState`, `ALL_COVERAGE = ['open','partial','full','over']`, `classifyCoverage()`. (Move the `CoverageState`/`ALL_COVERAGE` source of truth here; `filter-store.ts` re-exports for back-compat.)
2. **`src/stores/filter-store.ts`** — `CoverageState`/`ALL_COVERAGE` gain `over`. Replace hardcoded `coverage.length < 3` (activeFilterCount, etc.) with `< ALL_COVERAGE.length`. `DEFAULT_PAIRING_FILTER.coverage` stays `['open','partial']`.
3. **`src/components/layout/filter-dialog.tsx`** — `COVERAGE_OPTIONS` → `Open · Partial · Full · Over`. Replace `< 3` and the `['open','partial','full']` reset literal with `ALL_COVERAGE`-derived values (count, chip, reset-on-remove).
4. **`src/components/panes/pairing-pane.tsx`** — `computeCoverage` → `classifyCoverage`. Replace the two `coverage.length < 3` checks (chip condition, `coverageActive`) with `< ALL_COVERAGE.length`. Reset-on-remove → all four.
5. **`src/services/pairing-api.ts`** — `getDetail` backfill `isFull` via the classifier ("no shortage" = `full` or `over`), so detail- and list-loaded pairings agree.
6. **Left-edge border** (`pane-header-canvas.tsx` consumer / `isFull` semantics) — green when **no shortage** (`full`/`over`), amber when `open`/`partial`. Comp column text unchanged (`plan:fill`, red when they differ).
7. **`src/utils/bring-matches-to-top.ts`** — `bringPairingCoverageToTop`: `coverage.length >= 3` → `>= ALL_COVERAGE.length`.

### live-server (backend)

8. **`src/services/pairing/pairing-service.ts`** — replace inline `itemIsFull` + coverage classification with the mirrored `classifyCoverage`; `coverageActive` uses `< 4` (all states). `isFull` field = no-shortage.
9. **`src/routes/pairing/pairing.ts`** — validate the `coverage` CSV against the four known states (still `z.string`, parsed defensively).

### Versioning

10. **`gantt/src/version.ts`** — `FRONTEND_VERSION +1` and `BACKEND_VERSION +1` (change spans both).

## Testing

- **Vitest (gantt + live-server):** `classifyCoverage` table — open / partial / full / over, plus mixed `over-on-one + short-on-another → partial`, empty comp → full, all-zero → open. Both copies share the table.
- **Playwright `e2e/tests/gantt/pairing-coverage-over.spec.ts`:**
  - Coverage filter now offers **Over**; selecting it renders an **"Over"** chip.
  - An over-staffed pairing (`CA(2:3)`) floats to the top under Over and the matched-count badge reflects it.
  - A mixed over+short pairing classifies as **Partial** — it does *not* float under Over (asserts shortage-wins).
  - Regression baseline: before this change "Over" is not a selectable option at all.

## Risks

- **Missed `< 3` site** → coverage silently treated as "no narrowing" or vice-versa. Mitigation: derive every count from `ALL_COVERAGE.length`; grep audit in the plan.
- **Classifier drift** between gantt and live-server copies. Mitigation: identical shared test table + cross-reference comments.
