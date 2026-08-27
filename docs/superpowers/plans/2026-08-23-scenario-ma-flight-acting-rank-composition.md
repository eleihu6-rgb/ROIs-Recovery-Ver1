# Plan: Scenario MA Flight Acting Rank Composition

Spec: `docs/superpowers/specs/2026-08-23-scenario-ma-flight-acting-rank-composition-design.md`

## Tasks

1. **Display fallback** — `build-scenario-flight-crew.ts`: empty `flightActingRank` → `rosterActingRank`. Test in `build-scenario-flight-crew.test.ts`.
2. **Save path** — `scenario-patch-service.ts`: INSERT `flight_acting_rank = COALESCE($6,'')`; reassign/undelete also sync `flight_acting_rank`. Test in `scenario-patch-service.test.ts`.
3. **Verify** — run both Vitest files; no Playwright (pure store/API composition logic; UI surfaces via existing Flight Detail).
