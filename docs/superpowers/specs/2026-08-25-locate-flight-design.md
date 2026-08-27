# Locate Flight (Live + Scenario)

**Date:** 2026-08-25  
**Status:** Implemented  
**Scope:** Context-menu Locate Flight on Roster / Pairing, gated on Flight pane open

## Behavior

- Show **Locate Flight** only when a Flight pane is already open (Live: `pane-store` flight visible; Scenario: `scenarioHasPaneType(..., 'flight')`). Do not auto-open the pane.
- Sources: roster duty with `fltId`, or pairing segment with `findFltId`.
- Action: float the Flight-pane **row containing that flight** to the top via found ids, select the flight, scrollY = 0, scroll X so the block is on-screen when needed.

## Design

§Gantt-Unify: shared helpers + found-tier ordering in Live/Scenario flight sources; menus stay thin adapters.
