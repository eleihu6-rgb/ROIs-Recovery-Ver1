# Scenario rubber-band box-select

**Date:** 2026-08-25  
**Status:** Approved → Implementing  
**Scope:** Scenario Gantt Roster / Pairing / Flight panes — Live-parity drag-box multi-select

## Problem

Live supports empty-canvas drag → rubber-band → select all intersecting tasks (Ctrl = additive). Scenario shared panes already have the interaction plumbing, but:

- Roster gates the overlay on Live-only `liveChrome.enableRubberBand`
- Scenario roster callbacks omit `onRubberBandSelect`
- Scenario pairing/flight set `canRubberBand: false`

## Design

§Gantt-Unify: enable in the shared layer; Scenario sources flip capabilities / wire the handler. No forked UI.

1. `SharedRosterPane`: `enableRubberBand = liveChrome?.enableRubberBand ?? true`
2. Scenario roster `onRubberBandSelect` → `hitTestTasksInRect` → `handleSelectTasks` (additive union)
3. Scenario pairing + flight: `canRubberBand: true`
4. Help + Playwright regression

Box-select is selection-only (works read-only).
