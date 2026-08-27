# Flight Detail Composition from Pairings — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement tasks directly in-session with TDD).

**Goal:** Fill Flight Detail composition plan from aggregated `pairing_composition` on operating pairings (P+C) when `flight_composition` lacks a rank.

**Architecture:** Extend Live `flightService.getCrewList` only. Scenario Flight Detail already merges Live crew API.

**Tech Verification:** 2026-08-21-flight-detail-composition-from-pairings-design.md

## Files

| File | Role |
|------|------|
| `live-server/src/services/flight/flight-service.ts` | Aggregate pairing plans; merge with flight_composition |
| `live-server/src/__tests__/services/flight/flight-service.test.ts` | Vitest for aggregate + flight_comp wins + DHD excluded |

## Task 1: Failing Vitest for pairing aggregate plan

Add tests that mock a third query (pairing agg) and assert FA/IFD/CA/FO plans.

## Task 2: Implement aggregate in `getCrewList`

After loading `flight_composition`, query distinct operating pairings on `flt_id` (non-DHD segs) and sum `pairing_composition.plan` by `acting_rank`. Per rank: `plan = flightComp ?? pairingAgg ?? 0`.

## Task 3: Run Vitest and confirm
