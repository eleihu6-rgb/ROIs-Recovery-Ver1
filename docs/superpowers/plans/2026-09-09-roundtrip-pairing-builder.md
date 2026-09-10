# Round-trip Pairing Builder Implementation Plan

**Goal:** Ship Option C Ver2 in Live Gantt and validate ten ADD rotations departing 20 September 2026.
**Architecture:** Shared pane action gated by a build capability; Live dialog and backend search/validated commit; one committed rotation per request; incremental newest-first focus tier.
**Tech Stack:** React, AppDialog, Zustand, Fastify, Drizzle/PostgreSQL, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-09-09-pairing-builder-design.md (approved for development by user).

## Tasks

- [x] Backend: test pure rotation chooser before implementation. Search flights by UTC-converted calendar bounds, base/fleet, open operating coverage. Pack multiple base turns within block cap, permit real layovers only, include optional selected seed. Strict commit revalidates exact flight IDs and parameters under row locks, writes via parameterized existing pairing writer. Preserve manual writer defaults.
- [x] UI: Option C AppDialog with MapPin/UsersRound/SlidersHorizontal/Plane/Route section icons. Reference/config sourced fields. Find open flights, one flight selection and complete preview, deselect for batch. Scope edit invalidates search. Build each candidate sequentially; detail-load only committed pairing and place its full row at top.
- [x] Row order: created focus tier bypasses existing filters/sort and precedes pinned rows; use same header/canvas ordered collection; scroll pane to zero per success. Clear result focus restores prior order. Keep canonical entities and deduplicate.
- [x] Validation: pure chooser/parameter persistence tests, route integration and PostgreSQL read smoke, UI checks/builds, real Playwright writes ten ADD pairings from 20-Sep outbound flights: 5 layover, 2 two-segment single-duty, 3 four-segment single-duty. Inspect row 1/row 2 after every build plus screenshot per checkpoint; verify actual duty/segment timestamps.
- [x] Document receipts, remaining limitations and manual cases. Retain validation pairings for planner inspection; do not delete existing pairings.

## API Contract

Prefix /api/pairing/roundtrip.
GET /options: { bases: string[], fleets: string[], ranks: string[], defaults: Rules, composition: {narrow: Composition[],wide: Composition[]}, narrowFleets:string[] }.
Rules = { checkinMin:number, debriefMin:number, restMin:number, maxDutyBlockMin:number, singleLegExemption:boolean }.
Composition = {rank:string,plan:number}.
Scope = {startDate:string,endDate:string,ganttStart:string,ganttEnd:string,timezone:string,base:string,fleet:string,composition:Composition[],rules:Rules}.
Dates are YYYY-MM-DD in specified timezone; include full pairing check-in/final-debrief bounds. Flight candidates may return any day within scope; validation selects outbound 20-Sep explicitly.
POST /search {scope}: {flights: Flight[],rotations: Rotation[]}.
Flight = {id:number,fltNum:string,depArp:string,arvArp:string,schDepDtUtc:string,schArvDtUtc:string,blockMin:number,fleet:string}.
Rotation = {key:string,flightIds:number[],dutyFlightIds:number[][],blockMin:number,layoverMinutes:number[]}.
POST /build {scope,flightIds:number[]}: {pairingId:number,label:string,dutyCount:number,segCount:number}.
Envelope existing {code,data,message}. Validation/conflict return controlled 400/409.
Chooser starts with base departures, closes through forward connected legs, packs same-duty base turns up to cap. Flight used once in search result. No unbounded DFS: indexed station connection lists and bounded traversal. Return uncovered flights honestly.

## Test Assertions

Pure fixtures: 4 one-hour segments with 45-minute turns => one duty, 240 block;
two 7h single legs with >=20h ground gap => two duties;
720-minute ground interval with 120-minute next brief => insufficient free rest;
broken station, repeated ID, out-of-window, changed fleet and over-cap => reject.
UI: response receipt C => panelOrder[0]===C and panelOrder[1]===B before next request;
select interior segment => complete base loop; clear selection => all eligible rotations.
Run focused Vitest commands in live-server, then npm run build; gantt npm run build;
root npm run check:ui; targeted Playwright config/test and screenshot receipt.

## Execution Notes

Existing user edits retained (pairing-api detail normalization and earlier integrity tests).
Use feature branch in current shared workspace so approved prototype and user changes stay available.
No new dependencies, no destructive rebuild sweep, no reset/checkout of user changes.
