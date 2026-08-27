# Scenario Live Pairing Source Includes Filter-Matched RES Pairings

Date: 2026-07-28

## Problem

Scenario 710 references `Pairing Sc. 0 - Live`. Its Pairing Filter is scoped to
`Base = YYZ` and `Fleet = YYZ Fleet` (the effective fleet value from the
scenario filter). The Scenario Gantt currently shows matching Live FLY
pairings, but matching Live RES pairings such as CRAM/CRPM are absent.

The DB-backed Scenario Gantt first loads the source pairing universe using the
scenario pairing filter, then calls `pruneUnreferencedReservePairings()`. That
cleanup removes every `RES`/`SBY` pairing that is not referenced by a roster
assignment, including RES pairings that were correctly returned by the source
pairing query.

## Intended behavior

For a Live pairing source:

1. Pairings returned by the selected source query/snapshot are part of the
   source universe and must remain visible, including `RES`/`SBY` pairings.
2. The source query remains constrained by the
   scenario period, division, and Pairing Filter (`bases` / `fleets`).
3. Live roster pre-assignment geometry may still be appended as an explicit
   extra.
4. Reserve pairings appended only because of roster/SBY association must remain
   subject to the existing cleanup behavior unless they are part of the source
   universe.

This preserves the 2026-07-23 source-scope rule while correcting its overly
 broad cleanup of source-owned RES rows.

## S3 PO protection

This fix must not change the behavior of an RO scenario whose
`pairing_scenario_id` points to an imported S3 PO scenario:

- The PO/scenario pairing universe remains authoritative.
- The RO scenario's Live pairing-filter query is not added to the displayed
  PO universe.
- Live pre-assignment geometry remains limited to explicit roster-linked
  extras.
- Unrelated Live RES/FLY pairings must not become visible merely because they
  match the RO filter.

The implementation should pass the source-universe identity set explicitly
from each path rather than changing the global reserve-pruning rule or
removing the existing PO-vs-Live source distinction.

## Design

Carry the identity set of source-universe pairings into the final reserve
cleanup. `pruneUnreferencedReservePairings()` will keep a reserve pairing when
either:

- it is referenced by an assignment, or
- its pairing id belongs to the source-universe identity set.

Each path supplies the source-universe ids before any Live lead-in geometry is
merged:

- DB-backed path: ids returned by the source pairing query.
- Snapshot path: ids present in the parsed input pairing section.
- Live-refresh path: ids present in the regenerated input pairing section.
- Seed path: ids present in the RO input or referenced PO geometry before
  lead-in geometry is appended.

For a PO-backed RO DB path, the source-universe ids are only the resolved PO
scenario pairing ids. The implementation must not include ids from the Live
filter query because that query is not the source for that path.

No frontend changes are required. The DTO shape, Pairing Filter, sorting, and
Pairing pane remain unchanged.

## Tests

Add focused backend regression coverage:

- A Live-source DB fixture returns matching FLY and unassigned matching CRAM /
  CRPM source pairings; both remain in the final payload.
- An extra unreferenced RES pairing that is not in the source identity set is
  still removed.
- A PO-backed RO fixture keeps the PO source universe and explicit Live
  pre-assignment geometry, but does not include unrelated Live RES pairings
  that happen to match the RO filter.
- Existing SBY association tests continue to prove that matching roster SBY
  rows can render as PRAM/PRPM.

Run:

```text
cd live-server
npm test -- src/services/scenario/__tests__/scenario-gantt-db-service.test.ts
```

Then run the relevant Scenario Gantt Playwright regression against the real
UI/API path. The final verification must report the exact command and result.

## Risks

- Snapshot and seed paths must use the same source-vs-extra distinction or the
  bug will remain source-dependent.
- Existing tests that intentionally exclude unrelated reserve pairings must
  remain unchanged.
- The change must not broaden the Live source SQL scope beyond the existing
  period, division, base, and fleet predicates.
