# Design: 7501 puck “!” on all in-window FLY pairings

**Status:** Approved (user: 方案1 + 行为/落点/验证 OK)  
**Cases:** crew `2438` (pairings `15676` + `15806` in one SDFD window; only anchor `15806` showed `!`); crew `718` (single long pairing `15629` — already paints every day; must stay equivalent)

## Problem

Rule 7501 persists a single row with one `trigger_pairing` / `pairing_id` (latest-ending overlapping FLY pairing, else nearest). Live/Scenario puck maps and puck-hover tooltips only paint that **anchor** pairing’s tasks (after the window-overlap filter from `2026-07-31-violation-puck-window-overlap-design.md`).

When several FLY pairings sit inside the same SDFD window, planners only see `!` on the anchor ring (e.g. Aug 13–14), not on earlier contributing rings (e.g. Aug 11–12). That under-communicates which duties participate in the breached window.

## Goals / non-goals

**Goals**

- For **7501 only**, paint puck `!` on **every FLY pairing** of the affected crew that has at least one task overlapping the violation time window.
- Puck hover on those tasks shows the **same** 7501 message as the anchor.
- Live and Scenario share the same paint/tooltip semantics (§Gantt-Unify).

**Non-goals**

- No change to Rust `trigger_pairing`, persistence, Alert Center row counts, or crew-row bell.
- No change for 8002 or other rules (existing “puck stays on anchor” designs remain).
- No DB migration / new columns.

## Approach (scheme 1 — display only)

Keep one persisted 7501 row and its anchor `pairing_id`. Expand **frontend** puck severity + puck-mode tooltip when `ruleCode === '7501'` and a usable paint window exists (`windowStartDt`/`windowEndDt`, else `startDt`/`endDt` via `resolveViolationPaintWindow`).

### FLY pairing definition

A pairing is a **FLY pairing** for this feature if any loaded roster task of that pairing for the crew has `assignmentGroup === 'FLY'`.

### Which tasks get `!`

For a given crew-scoped 7501 violation with window `W`:

1. Group that crew’s loaded roster items by `pairingId` (skip null / ground-only keys).
2. Keep pairings that are FLY pairings (above).
3. For each kept pairing, bump severity (and allow tooltip) for each task whose `[schStrDtUtc, schEndDtUtc]` overlaps `W` (same overlap helper as today).

Same-pairing DHD (or other non-FLY segments) that overlap `W` still get `!` once the pairing qualifies as FLY — consistent with painting the whole ring’s overlapping duties.

### Missing / invalid window

If `resolveViolationPaintWindow` returns null, keep **legacy** behavior for that row (anchor pairing only / existing map paths). Do not invent a full-crew spray.

### Tooltip

In puck hover (`collectViolationTooltipEntries` mode 2): for 7501, also consider display/scenario violations keyed under **other** pairings when `v.crewId` matches the hovered task’s crew and the hovered task overlaps `W` and belongs to a FLY pairing. Deduplicate by existing `ruleCode:message` key. Crew-header hover unchanged.

## Shared helper

Extend `gantt/src/utils/violation-puck-window.ts` (or adjacent util) with something equivalent to:

- `isFlyPairing(tasks: RosterItem[]): boolean`
- `crewFlyTasksOverlappingWindow(crewTasks: RosterItem[], violation: ViolationTimeWindow): RosterItem[]`

Reuse `resolveViolationPaintWindow` / overlap logic; do not duplicate date math in Live vs Scenario.

## Touch points

| Area | Change |
|------|--------|
| `buildLiveViolationMap` | For 7501 + crew-attributed display/session rows, bump via helper over crew tasks, not only `itemsByPairingId.get(anchorId)` |
| Scenario `buildViolationMap` | Same semantics for 7501 |
| `collectViolationTooltipEntries` (puck) | Surface 7501 from non-anchor keys when task overlaps window on a FLY pairing |
| Unit tests | Live map + tooltip (+ Scenario map if covered today) |
| E2E (optional if data stable) | `2438` Aug: `!` on both `15676` and `15806` |

Do **not** add 7501 to `CREW_BELL_ONLY_RULES`.

## Relationship to prior specs

- **Supersedes (7501 puck only):** the implication in `2026-07-15-8002-visible-window-overlap-design.md` / anchor-only puck for cumulative rules — **for 7501 display**, not for 8002.
- **Keeps:** `2026-07-31-violation-puck-window-overlap-design.md` — still hide `!` when the anchor (and now any candidate) has **no** task overlapping the window (e.g. crew 923 Aug FLY + Sep window).
- **Orthogonal:** `2026-08-01-7501-edit-focus-worst-window-design.md` (which window is selected); this spec only changes **where** that window’s row paints on the canvas.

## Success criteria

- Crew `2438`-shaped fixture: one 7501 anchored on pairing B, window covering pairings A and B → tasks of **both** A and B that overlap the window have puck severity; hover on A shows the 7501 message.
- Crew `923`-shaped: Aug tasks + Sep-only window → still **no** Aug puck `!`.
- Crew `718`-shaped: single multi-day FLY pairing → still `!` on each overlapping day (no regression).
- Non-7501 rules unchanged.
- Alert Center / bell still one row per persisted 7501.
