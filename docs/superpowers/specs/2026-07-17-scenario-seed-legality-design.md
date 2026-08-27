# Scenario Seed Legality Design

Date: 2026-07-17
Status: Approved by user in chat

## Problem

Scenario 672 is an RO DRAFT scenario with no loaded rows in `scenario.roster_flight`.
The Scenario Gantt therefore renders `dataSource='seed'`: it builds the scoped RO input
and overlays live pre-occupied roster rows as read-only PA assignments.

Persisted Scenario legality currently computes only from `scenario.roster_flight`.
For a seed scenario that table is empty, so legality returns `READY` with zero
violations while the Gantt displays live-backed FLY assignments that can violate rule
8056. This makes the roster pane show no violation bells even when the visible data has
FLY-to-FLY gaps below the configured threshold.

## Goal

When an RO DRAFT/FAILED scenario has no loaded scenario roster and the Gantt uses the
seed view, Scenario legality must compute against the same seed/live-backed assignment
data the Gantt displays.

## Non-Goals

- Do not write seed assignments into `scenario.roster_flight`.
- Do not change persisted legality for DONE or already loaded scenarios.
- Do not change live legality.
- Do not add client-side 8056 calculation in the Gantt.

## Design

Add a seed-aware branch to the Scenario legality compute script.

The script already resolves the scenario's tied numeric `ruleset_id` and runs the shared
Rust-backed `computeViolations` core. It will also detect whether the scenario has any
loaded rows in `scenario.roster_flight`.

If rows exist, the current `scenarioSource` path is used unchanged.

If no rows exist and the live scenario master row is `file_type='RO'` with
`status IN ('DRAFT','FAILED')`, the script uses a new `seedSource` adapter. That adapter
mirrors `buildGanttDataSeed`:

- Build the scoped crew and pairing universe from the scenario's `filter_params`.
- Read live `roster_flight` for those scoped crew ids as the visible PA assignments.
- Resolve pairing spans from the same scoped live pairing/segment rows used by the seed
  Gantt payload.
- Feed those rows to the existing `computeViolations` source methods.

The result is still persisted into `scenario.rule_violation` and read by the existing
Scenario Gantt violation store. For seed scenarios, this persisted result represents the
current seed/live-backed preview baseline. Recheck recomputes it from the current live
roster.

## Freshness

Existing loaded scenarios keep the `roster_version` freshness model.

For seed scenarios, `roster_version=1` is used as the seed-preview baseline. This
intentionally makes pre-fix `READY` rows with `computed_version=0` stale, so opening the
scenario after deployment triggers a real seed legality compute instead of continuing to
serve the old empty result.

Automatic live-roster staleness detection after that first seed compute is deferred; the
seed view is a read-only preview, and this fix is scoped to making its baseline
calculation match what is displayed. Manual Recheck still forces recomputation from the
current live-backed seed data.

## Testing

- Add a focused live-server regression test for seed-source 8056 input construction:
  a DRAFT RO scenario with no scenario roster, scoped crew, live FLY rows, and a
  FLY-to-FLY gap below 100h must produce at least one 8056 violation.
- Keep existing Scenario legality status tests green.
- Run TypeScript verification for live-server.

## Risks

- Seed legality reads live roster rows, so results can change when live data changes.
  This is intentional because the seed Gantt view also changes from live-backed data.
- Broad all-rule seed support depends on the source adapter implementing every method
  used by `computeViolations`. The adapter should mirror the scenario source methods
  with live tables plus the scoped crew/pairing constraints.
