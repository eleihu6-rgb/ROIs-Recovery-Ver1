# Recovery Case 4 Implementation Plan

**Goal:** Build an unpaired-flight rotation and fill open pairing seats through common Recovery.
**Architecture:** Add explicit open incident context; reuse roundtrip validation/writer, Recovery presentation, legality preview, Cost Library and draft operations. Preserve alert-based Cases 1–3.
**Tech Stack:** React/Zustand/TypeScript, Fastify/Drizzle/PostgreSQL, Vitest/Playwright.
**Spec:** ../specs/2026-09-14-recovery-case-004-design-Ver1.md

## Constraints

ET Sep 17–25 2026 fixture; no shared Case 1–3 crew/pairing/flight IDs. No commits.
Saved builds survive close. Partial seats preserve assignments. Donor vacancies remain Partial.

## Tasks

- [x] Add anchor alternatives to roundtrip search with `chooseRecoveryRotations(flights, scope, anchorFlightId)` returning rotations and explicit truncation. Existing search without anchor retains its behavior. Build validates anchor membership and strict selected scope.
- [x] Verify with `cd live-server && npx vitest run src/__tests__/services/pairing/recovery-rotations.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts`.
- [x] Add open-pairing staffing model, identity-based costs and draft conversion. Standby retains its exception marker; move-up removes the actual donor assignment only; empty-seat assignment has no fictitious source crew. Test legality, capacity and cost contracts.
- [x] Mount open-flight/open-pairing entry in existing Recovery component, with Pairing Options before roster groups, roundtrip preview and saved row focus. Reuse AppDialog and cost breakdown; preserve existing violation entry.
- [x] Build protected ID manifests read-only, then prepare disjoint fixture using existing creation utilities. Verify before/after protected records and reject concurrency mismatches.
- [x] Drive real UI build, close/resume, partial staffing, each costed strategy, preview/apply/save/reload and reset. Capture and inspect versioned screenshots. Re-run protected case regressions.
- [x] Update Case 4 Help, content tests and recovery skill from evidence. Run Help coverage, `npm run check:ui`, scoped type checks and diff checks. Save durable context with test and restoration receipts.

## Delivery

See `docs/test-cases/crew-recovery/2026-09-14-case4-delivery-Ver1.md` for final commands, screenshots, restored state and existing broad-gate failures. Implementation and scoped verification are complete; no commit or push.
