# Plan — Windowed first-paint ("first-40 wow") for Live Apply

**Date:** 2026-06-13  **Branch:** perf/gantt-live/apply-speed  **Status:** implementing

## Goal
Cut Apply→visible to ~1–2s by painting only the viewport rows (+buffer) first, then loading
the full dataset in the background so scroll/sort/operate work normally. Targets the root
cause: today Apply downloads the *entire* filtered set (≈12 MB roster + all crew + all
4,260 pairings) before anything shows.

## Design — two phases

**Phase 1 (awaited → instant paint):**
- Crew + roster in ONE call via the existing bootstrap endpoint:
  `bootstrap(pageSize = INITIAL_ROWS, sortBy/sortOrder = default, rosterWindowDays = daysInFirstMonth)`
  → first N slim crew, **server-sorted by the default sort** (so the top is correct
  instantly), plus their **first calendar month** of roster (fits the viewport).
- Pairings: `fetchPairings(pageSize = INITIAL_ROWS, sorted)` — first N, in parallel.
- `markDirty()` → paint. This is the "wow".

**Phase 2 (background, not awaited → sets `fullyLoaded`):**
- Crew: `fetchCrews(pageSize = 0, sorted)` → full crew, merge, `crew.fullyLoaded = true`.
- Roster: then `fetchRoster(allCrewIds, fullRange)` → full roster (replaces window).
- Pairings: `fetchPairings(pageSize = 0, sorted)` → all, `pairing.fullyLoaded = true`.
- Flights: only if the flight pane is visible (unchanged).

`INITIAL_ROWS = 40` (≈2× the ~20 rows visible at 2K; fixed buffer for v1).

## Sort correctness (decided)
Client-side sort needs the complete set. During the phase-1→2 window, crew/pairing are
partial. Decision: **sort waits for full load.** `applySort` awaits the in-flight
`fullyLoaded` promise before sorting; the sort control shows a brief spinner if not ready.
By ~3–5s the background load is done, so this path is rarely hit. (In the non-windowed
fallback paths, `fullyLoaded` is true immediately, so sort is unaffected.)

## Store changes
- crew-store / pairing-store: add `fullyLoaded: boolean` + `whenFullyLoaded(): Promise<void>`;
  `applySort` awaits it when not loaded. Set `fullyLoaded=false` at phase-1, `true` at phase-2.
- apply-filters: orchestrate phase-1 (await) then phase-2 (void background), only for the
  no-crew-filter + roster-visible case (the default Apply). Filtered / no-roster paths keep
  current behavior with `fullyLoaded=true`.

## Tests
- Unit: crew/pairing `fullyLoaded` lifecycle + `applySort` awaits when not loaded.
- Backend: bootstrap honors a small pageSize (returns N) — already covered by pageSize tests.
- Measure locally (Ryan): phase-1 paint counts (~40 crew/pairing) appear fast; counts grow
  to full afterward; sort after full load reorders correctly.

## Out of scope (v1)
- Dynamic INITIAL_ROWS from measured viewport height (fixed 40 for now).
- Incremental roster backfill (v1 re-fetches full roster in background; optimize later).
