---
name: 123-live-mcred-draft-recompute
description: Make the Live gantt roster-pane MCred (monthly credit) update in real time as the planner de-assigns / adds duties before Save (and revert on undo), plus the roadmap for authoritative server reconcile (Phase B) and cross-user live refresh (Phase C). Use when MCred / monthly-credit does not move on de-assign, when extending the optimistic credit delta, or when wiring the preview-stats endpoint or the roster-updated WS handler. Also the reference for the viewportYearMonth-vs-UTC tz trap that breaks MCred e2e.
---

# Live MCred Draft Recompute

## What this is

In the **Live** gantt, the roster left-panel **MCred** column is a server aggregate, not a roster
sum: it's `stats.mcred` from `crew-store.crewStatsMap` (keyed `crewId:yearMonth`), fetched from
`crew_manday_{fd|cc_am}_monthly.credit` via `crew-stats-service.ts`. So de-assigning a duty did
**not** move MCred (not before Save, and not after — the async manday worker is eventually-consistent
and `clearCrewStatsCache()` only refetches on a month-scroll).

**Phase A (SHIPPED 2026-06-22, F308, branch `feat/gantt/live-mcred-draft-recompute`)** makes the
displayed value `mcred = stats.mcred + draftDelta`, where `draftDelta = credit(virtual roster) −
credit(base roster)` per crew per displayed month, computed client-side. De-assign/add moves MCred
immediately and undo/redo reverts it — Live-only (Scenario is edit-locked).

Phases B (authoritative server preview reconcile) and C (cross-user `roster-updated` refetch) are
designed but NOT built. Full plan: `docs/superpowers/plans/2026-06-22-live-mcred-realtime-recompute.md`.

## Before touching anything

1. Load the gantt playbook (`115-gantt-playbook` / `docs/modules/gantt/live-scenario-gantt-playbook.md`),
   especially §13(h) **MCred** and §13(f) credit columns.
2. Remember §Gantt-Unify: the draft/undo edit mechanism is genuinely **Live-only**; the credit util is shared.

## Phase A anatomy (what shipped — the files)

- `gantt/src/utils/format-credit.ts` — `sumCrewCreditMinutes(items, yearMonth)`: total credited minutes
  for one crew in a month. Flying duties (pairingId≠null) deduped by `(pairingId,dutySeq)` taking
  `dutyActCreditedMinutes` (same value repeats per segment — mirrors backend `MAX(duty_act_credited_minutes)`);
  ground items add `actCreditedMinutes`. `schStrDtUtc` typed `string | null` (roster rows allow null).
  Unit test in `src/utils/__tests__/format-credit.test.ts`.
- `gantt/src/components/layout/app-layout.tsx` — assign-pairing segment placeholders now carry
  `dutyActCreditedMinutes: seg.dutyActCreditedMinutes ?? null` so an *added* pairing contributes to the delta.
  (Only the live path; `layout/pane-container.tsx` is legacy/unused for docked panes — do NOT edit it.)
- `gantt/src/components/gantt/source/live-gantt-source.ts` — `draftCreditDeltaByCrew(baseItems, virtualItems,
  yearMonth)` helper; `buildPanelRows` takes a `creditDelta` param; mcred cell =
  `formatBlockMinutes(Math.round(stats.mcred + (creditDelta.get(cid) ?? 0)))`. The `useRosterModel` memo
  subscribes `baseItems` (`s[rosterKey].baseItems`) + `items` (virtual) and lists both + `viewportYearMonth`
  in deps. Recomputes free on every addOp/undo/redo because `items` is a fresh array each edit.
- `gantt/src/utils/gantt-test-hook.ts` — `rosterMcred()` returns rendered `{crewId, mcred}` panel text
  (reads `panelRowsByPane.get('roster-main')`, published by the shared roster pane).
- `gantt/src/components/roster/draft-toolbar.tsx` — added `draft-undo-btn` / `draft-redo-btn` testids
  (delete is `draft-delete-btn`, save is `draft-save-btn`).
- E2E: `e2e/tests/gantt/mcred-draft-recompute.spec.ts` (`Live-1310`).

## ⚠️ The tz trap (root-caused + FIXED F309)

**Symptom (the real bug a user hit):** de-assign removes the puck (roster count drops) but MCred does not
move — even though Phase A is deployed. **Cause:** `viewportYearMonth` was derived from
`new Date(viewportLeftDayMs).getMonth()` (**host/OS LOCAL tz**) while roster items match by
`schStrDtUtc.slice(0,7)` (**UTC**). A planner whose OS tz is **west** of the gantt display tz (e.g. macOS
set to Pacific while the gantt shows Toronto/YOW) viewing June resolves the viewport to **May**, so the
`/api/crew/stats` request sends `yearMonth=2026-05` AND the credit delta sums zero June items → frozen MCred.
Internally consistent (stats+delta agree), just the wrong month — and it bites real users, not only e2e.

**Fix:** `yearMonthInTimeZone(utcInstant, timezone)` in `gantt-utils.ts` (cached tz formatter) reads the
left-edge instant's month in `useTimezoneStore.timezone`; `live-gantt-source.ts` computes `viewportYearMonth`
via a `useGanttViewStore` selector over `xToTime(scrollX, rangeStart, pxPerHour)` (stable "YYYY-MM" string →
no scroll re-render). **Rule going forward: any "viewport month" must use the DISPLAY tz, never
`Date#getMonth()`.**

**Diagnosis recipe** (if MCred ever looks frozen again): intercept `/api/crew/stats`, read the `yearMonth=`
param; compare to `Intl.DateTimeFormat().resolvedOptions().timeZone` (host) vs the gantt's display tz.
**E2E:** `Live-1310` pins `test.use({ timezoneId: 'America/Vancouver' })` as the regression guard — a Pacific
host must still recompute the June edit.

## E2E recipe (de-assign, the proven path)

```
test.use({ timezoneId: 'UTC' })                         // ← MANDATORY (see tz trap)
seedGanttAuth → GanttDashboardPage.goto() → poll counts().roster > 0
probe = readHook('rosterProbe')                         // first visible flying puck {crewId,pairingId,...}
poll rosterMcred()[crew] != ''                          // MCred is async post-first-paint
before = rosterMcred()[crew]
canvas.click({ position: puckClickXY(probe), button:'right' })   // geometry from roster-box-delete.spec.ts
getByRole('button', { name: /^Delete/ }).click()        // deletes whole pairing-from-crew (a draft op)
poll roster() no longer has probe.id                    // puck gone
poll rosterMcred()[crew] != before  →  toMinutes(after) < toMinutes(before)
getByTestId('draft-undo-btn').click() → poll rosterMcred()[crew] == before
```

Run: `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps
tests/gantt/mcred-draft-recompute.spec.ts --reporter=list` (gantt vite must be up on :5173;
`--no-deps` skips pbs auth).

## Verify discipline (§No-Illusion)

- Unit: `cd gantt && npx vitest run src/utils/__tests__/format-credit.test.ts`.
- Full gantt unit: `cd gantt && npx vitest run` (247 green at ship time).
- Typecheck: `cd gantt && npx tsc --noEmit` (no new errors).
- UI gate (if markup touched): `npm run check:ui` (root) — 0 hard violations.
- Version: any frontend change → `FRONTEND_VERSION` +1 in `gantt/src/version.ts` (Phase B also +1 backend).

## Phase C — cross-user live update (SHIPPED 2026-06-22, B161/F310)

When A saves, B sees the new roster AND updated MCred with no refresh. Proven two-user (`Live-1313`):
1.1 A de-assign drops A's MCred while B stays put pre-save; 1.2 A undo reverts A's roster+MCred; 2 A save →
B converges on the new roster + MCred.

- **Backend (`live-server/src/routes/draft/draft.ts`):** the commit captures edited rows' dates (`collect`),
  recomputes credit **synchronously** via `recalcMandayCredit(db, {crewIds, startDt, endDt})` (window =
  min−2d…max+10d around edited duties) BEFORE `wsBroadcastAll('roster-updated', crewIds)`. So the single WS
  event carries fresh credit. **Do NOT rely on the async `manday:recalc` queue** — it shares
  `rule-check-realtime` with rule-check workers; phantom/foreign consumers grab+discard the job, and jobId
  dedup + retained completed jobs block re-runs. Sync recompute in the request is the reliable path.
- **Frontend (`gantt/src/stores/lock-store.ts`):** `refreshCrewsFromBroadcast(crewIds)` replaces the old
  `markDirty()` stub on `roster-updated` — refetches `rosterApi.getView` + `replaceCrewItems` and
  `clearCrewStatsCache()` + `loadCrewStats(getLiveViewportYearMonth())` for the broadcast crews THIS user has
  loaded (`selectedCrewIds` ∩ broadcast). `getLiveViewportYearMonth()` (`utils/viewport-month.ts`) reads the
  month in the DISPLAY tz (reuses `yearMonthInTimeZone`).

### Two-user e2e gotchas (learned the hard way)
- **One live-server only.** Multiple live-server processes (incl. stray `.claude/worktrees/*` ones) share Redis
  and compete for / corrupt the manday queue. `pgrep -fl "live-server/.*tsx watch"` → kill extras → one fresh.
- **`tsx watch` may NOT reload iCloud-dir backend edits** reliably. After editing live-server, restart it
  (`pkill -f "live-server/.*tsx watch"; npm run dev`) and confirm via `/api/health`; don't trust HMR.
- **Saved de-assigns PERSIST** (soft-delete) and drain crew credit across runs → use `rosterProbeWithCredit`
  (crew mcred>0 AND pairing `dutyActCreditedMinutes>0`) so each run finds a still-credited crew above the floor.
- **Select via `selectRosterTasks([id])` + click `draft-delete-btn`** (real toolbar button) instead of canvas
  geometry — credited crews can be below the fold after data erosion. The mutation still flows through real UI
  buttons (Delete/Save/Undo), satisfying §Simulate-User.

## Phase B — authoritative reconcile (NOT built)

`POST /api/draft/preview-stats`: apply the draft ops in a Drizzle transaction, run the crew-scoped manday
recompute, read stats, THROW a sentinel to force rollback (nothing persists); client debounces (~300ms) and
prefers the preview over the optimistic delta. Eliminates the optimistic-vs-authoritative gap on 75/65
guarantee-band crews (where the naive delta is wrong and reverts after save). Plan Tasks B1–B4.

## Anti-patterns

- Recomputing MCred *absolutely* from loaded roster items — the loaded window may be narrower than the month
  and `stats.mcred` follows a credit model (guarantee bands), not a raw sum. Always **base + delta**.
- Editing `layout/pane-container.tsx` (legacy/unused) or summing per-segment without `(pairingId,dutySeq)`
  dedup (double-counts multi-sector duties).
- Forgetting `test.use({ timezoneId: 'UTC' })` → flaky/false-negative MCred e2e.
- Faking the user action by calling the assign/remove API directly (§Simulate-User) — drive the real
  canvas + context menu / toolbar.
