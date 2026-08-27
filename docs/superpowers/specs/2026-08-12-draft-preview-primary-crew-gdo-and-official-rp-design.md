# Design: Draft preview — primary-crew 7505/7507 dialog + official RP bounds

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Approach:** Frontend only — (1) soft-dialog Min-GDO filter to primary crews; (2) never send padded Gantt `dateRange` as `rpFrom`/`rpTo`

## Problem

Scenario (and Live) drag-assign runs `checkLiveDraftLegality` → `POST /api/legality/preview-draft`. Two independent bugs made the Warning dialog look like it was blocking the dropped crew’s Min-GDO when it was not.

### Bug 1 — pairing-mate 7505/7507 in the confirm dialog

`expandAffectedWithPairingMates` expands `affectedCrewIds` with every crew already on the edited pairing so composition / 1001 can run. `isRelated` then treats **every** 7505/7507 as related (`return true`), so a mate who was already under Min DO (e.g. crew `2807`) opens the soft dialog while assigning to crew `13645`.

Captured case (scenario 740, pairing `138734` onto `13645`):

- Request `focusPairingIds: [138734]`, large `affectedCrewIds` (mates).
- Response: many lead-in **1001**s; the only **7507** is `crewId: "2807"`, pairing `138732`, `days off(9) must be at least 10 in 1 RP (2026-09-01, 2026-09-30)`.
- `13645` has **no** 7507 in that response. UI RpDO=11 is consistent.

### Bug 2 — padded viewport sent as RP

`currentGanttRpBounds` falls through to `resolveViolationViewBounds(filter.dateRange, …)`. Gantt `dateRange` is the official RP **plus ±7d lead-in**. The same capture posted `rpFrom: "2026-08-25"`, `rpTo: "2026-10-07"` instead of Sep 1–30. 7505/7507 then scan that span as RP months. Official selected `roster_period` strings / scenario `strDtLoc`/`endDtLoc` already exist in the helper but are skipped when RP ids do not resolve.

## Decision

### 1. Soft dialog: 7505/7507 only for primary crews

In `checkLiveDraftLegality` (`gantt/src/stores/roster-store.ts`):

| Set | Source | Used for |
|-----|--------|----------|
| `primaryCrewIds` | Caller `affectedCrewIds` **before** mate expand | 7505/7507 `isRelated` |
| `previewCrewIds` | `expandAffectedWithPairingMates(...)` | `checkDraft` body, before/after item filter (unchanged) |

`isRelated` for `ruleCode` 7505 or 7507:

```text
String(v.crewId) ∈ primaryCrewIds
```

Replace the current unconditional `return true`.

Keep the existing “surface 7505/7507 even if the same finding existed before the edit” rule, but only for primary crews.

Callers already pass the edited crew(s):

- Scenario assign: `[op.toCrewId]`
- Scenario remove: `[op.crewId]`
- Scenario reassign: `[op.fromCrewId, op.toCrewId]`
- Live draft move/swap/assign: from/to crew ids

Do **not** shrink the preview crew set. Mates still go to the engine for 1001 / composition. Session bells via `syncPeriodGdoSessionViolations(afterResult.violations)` stay on the full after-set (mate bells may light; they must not block this confirm).

Other rules keep pairing-id / time-window relatedness (including spacing expand for 7504/8056).

### 2. Preview RP: official calendar bounds only

In `currentGanttRpBounds` (`gantt/src/services/legality-preview-api.ts`), resolve `rpFrom`/`rpTo` in this order:

1. Filter `selectedRosterPeriodIds` that match `roster_period` rows → min `rpStart` / max `rpEnd` as `YYYY-MM-DD` (compare ids with `String()`).
2. Scenario context (`contextId` is a number) with `strDtLoc` and `endDtLoc` → those calendar dates (`slice(0, 10)`).
3. `selectedRosterPeriodRange` present → existing `ymdFromRpInstant` (mid-day bias so end-of-local-day does not become the next UTC date).
4. Otherwise return **no** bounds. `checkDraft` must omit `rpFrom`/`rpTo` so the backend uses official `roster_period` / scenario ctx. **Never** send padded `filter.dateRange`.

`checkDraft` already prefers explicit `input.rpFrom`/`rpTo`. Keep that.

`checkDraft` already picks the scenario filter store when `contextType === 'scenario'` and `scenarioId` is set. Keep that (do not inherit Live’s selected RP).

This helper is only for **draft preview** RP. Do not change Alert Center / persisted-violation display windows (`resolveViolationViewBounds` for query overlap stays as-is).

## Out of scope

- Backend `preview-draft` / `legality-recheck-core` RP math.
- Stopping mate expand for non-GDO rules.
- Dialog copy changes (crew name on each row).
- Session bell / Alert Center filtering.
- Soft vs Hard policy (7505/7507 remain overridable / Continue).

## Verification

### Vitest — dialog filter (`roster-store-draft-legality.test.ts`)

- Assign to primary `13645` with after-preview 7507 on mate `2807` → that 7507 is **not** passed to `showConfirmDialog`. Related 1001s may still open the dialog. If the after-set is only the mate 7507, the dialog is not shown.
- Primary crew’s own 7507 still opens the dialog, including when `pairingId` is not the edited pairing.
- Existing “still surface 7505 when the crew already violated before the edit” stays green for a **primary** crewId.

### Vitest — RP bounds (`legality-preview-api-rp.test.ts`)

- Scenario, empty `selectedRosterPeriodIds`, padded `dateRange` Aug 25–Oct 7, `strDtLoc`/`endDtLoc` Sep → POST `rpFrom: "2026-09-01"`, `rpTo: "2026-09-30"`.
- Live and Scenario: no selected RP ids, no `selectedRosterPeriodRange`, no scenario dates → POST body **omits** `rpFrom`/`rpTo` (must not contain Aug 25–Oct 7).
- Live with selected RP ids still forwards `rpStart`/`rpEnd` strings.
- Explicit `input.rpFrom`/`rpTo` still win.

### Playwright

If a stable Scenario assign fixture can inject or observe the confirm dialog: drop onto a primary crew whose pairing mates have a 7507; assert the dialog does **not** contain the mate’s Min-GDO message. If SIT data cannot pin `2807`, Vitest covers the filter; do not weaken the unit test to skip E2E when the UI path has no reliable fixture.

## Success criteria

Dragging pairing `138734` onto crew `13645` in scenario 740:

1. Network `preview-draft` has `rpFrom`/`rpTo` of **2026-09-01** / **2026-09-30** (or omitted, never Aug 25–Oct 7).
2. Soft dialog does not show crew `2807`’s 7507. If `13645` is legal after the drop, no Min-GDO dialog for this edit (1001s still follow existing relatedness).
