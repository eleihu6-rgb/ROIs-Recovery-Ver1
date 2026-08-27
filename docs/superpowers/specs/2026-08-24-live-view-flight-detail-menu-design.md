# Live «View flight detail» Context Menu Design

## Status

Implemented (2026-08-24). Plan: `docs/superpowers/plans/2026-08-24-live-view-flight-detail-menu.md`.

## Goal

Parity with Scenario: Live Roster and Live Pairing right-click menus offer **View flight detail** when a flight id is known, opening the shared Flight Detail dialog (Live crew path).

## Background

- Scenario (`scenario-context-menu.tsx`) already shows **View pairing detail** and **View flight detail** when `pairingId` / `fltId` are present.
- Live (`roster/context-menu.tsx`) shows **View pairing detail** on roster duties with a pairing, and on the pairing pane, but never **View flight detail**.
- Live Flight pane already has **Flight Detail** (different label); out of scope for this change.
- Live `RosterItem` already carries `fltId` (per-segment `roster_flight`). Pairing pane mock tasks already carry `findFltId` from the clicked segment.

## Scope

| In scope | Out of scope |
|----------|----------------|
| Live Roster context menu | Renaming Flight pane «Flight Detail» |
| Live Pairing context menu | Unifying Live/Scenario into one menu component |
| Help copy for Live context menu | Changing Crew Assignment Live vs Scenario data logic |
| Playwright coverage for the new menu action | DB / API changes |

## Behavior

### Visibility

| Pane | Show **View flight detail** when |
|------|-----------------------------------|
| Live Roster | `task.fltId != null` (ground / non-flight duties: hidden) |
| Live Pairing | `findFltId != null` on the mock task for the clicked segment |

### Action

- Label: `View flight detail` (exact Scenario wording).
- Icon: `Plane` (same as Scenario).
- Handler: `useUiStore.getState().openFlightDetail(fltId)` with **no** `scenarioId` (Live Flight Detail path).
- Placement: immediately after **View pairing detail** when that item is present; on Pairing pane, insert with the other detail / navigate actions near the top (after **View pairing detail**).

### Flight Detail data (unchanged)

Opening from Live uses the existing Live branch in `flight-detail-dialog.tsx`:

- Flight: local flight store, else `GET /api/flight/:id`.
- Crew Assignment: `GET /api/flight/:id/crew` only (no scenario merge).

Scenario continue to pass `scenarioId` and keep scenario-build + Live merge. No change to that path.

## Implementation approach

**Minimal edit in `gantt/src/components/roster/context-menu.tsx` only** (plus Help + e2e):

1. Roster block (`paneType` starts with `roster`, has task): when `task.fltId != null`, push menu item after View pairing detail / before Locate Pairing (or after the pairing-detail group).
2. Pairing block: when `findCtx.findFltId != null`, push **View flight detail** after **View pairing detail**.
3. Reuse existing `openFlightDetail` already subscribed in this component.

Do **not** extract a shared helper or migrate menus in this change (§Minimal-First).

## Testing

- Playwright (Live): right-click a roster flying puck with `fltId`, assert menu contains **View flight detail**, click it, assert Flight Detail dialog opens with matching flight id / route.
- Playwright (Live): right-click a pairing-pane segment that has `findFltId`, same assertion.
- Ground-task / no-fltId roster right-click: item absent.
- Prefer real UI + existing gantt hooks; no direct API write substitutes for the menu click (§Simulate-User).

## Docs

Update `gantt/src/components/help/topics/live/live-context-menu.tsx` (and related Help mentions if they still say Scenario-only for View flight detail) so Live Roster/Pairing document the new item.

## Non-goals / risks

- Multi-segment pairings: each roster/pairing segment puck has its own `fltId`; the menu opens that segment’s flight — intentional, matches Scenario.
- If `fltId` is null on some Live flying rows (legacy/label-only), the item stays hidden; do not invent flight id from label in this change.
