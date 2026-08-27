# Live Violation Crew Attribution Fix

## Problem

Live Gantt persisted legality violations are fetched from `rule_violation` with a real
`crewId`, but the frontend stores them only by `pairingId`. Alert Center and crew-bell
rows then expand a pairing violation to every loaded crew on that pairing. This makes a
crew see another crew's 8002 message when they share a pairing, as seen with pairing
`10381` in `f8_sit_live`.

## Design

- Preserve the owner `crewId` from `/api/violations` when writing persisted violations
  into the Live session-violation store.
- Store persisted violations by a composite crew+pairing key while keeping session
  violations pairing-scoped until the session API returns a crew owner.
- Build Live roster bells, hover tooltips, and Alert Center rows from persisted
  violations only when the stored `crewId` matches the rendered crew row.
- Keep backend read/write contracts unchanged: `rule_violation` and `/api/violations`
  already carry `crew_id`; the change is frontend attribution only.

## Acceptance

- If crew A and crew B share a pairing, a persisted violation owned by crew B does not
  create a bell, tooltip, per-crew popup, or Alert Center row for crew A.
- The owned crew still sees the violation on its roster row and in Alert Center.
- Existing session-edit violations continue to render pairing-scoped as before.

## Tests

- Add focused Vitest coverage for the Live source attribution helpers.
- Add focused store coverage proving persisted entries with the same pairing but
  different crew owners remain distinct.
- Run the touched Gantt tests and TypeScript build scope.
