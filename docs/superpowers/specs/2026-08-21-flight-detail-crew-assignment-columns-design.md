# Design: Flight Detail · Crew Assignment columns

**Date:** 2026-08-21  
**Status:** Implemented  
**Scope:** `gantt` Flight Detail dialog (Live + Scenario shared)

## Problem

Flight Detail → **Crew Assignment** shows nine columns (Seq, Crew ID, Name, Rank, Acting, Label, Source, MBH, MFDP). Planners only need identity + rank + source; the extra columns add noise without decision value in this modal.

## Goals

- Show exactly five columns, English UI labels:
  1. **CREW ID**
  2. **NAME**
  3. **ACTIVE RANK** (was Rank → `crewRank`)
  4. **ACTING RANK** (was Acting → `actingRank`)
  5. **SOURCE**
- Apply once to the shared dialog so **Live and Scenario** stay aligned (§Gantt-Unify).
- Keep empty / unfilled row behavior; update `colSpan` for five columns.

## Non-goals

- No API / DTO changes (unused fields may still be returned).
- No footer button changes (`Assign Crew` / `Edit` stay disabled as today).
- No Flight Composition section changes.
- No new table abstraction / component split.

## Approach

Surgical edit of `gantt/src/components/flight/flight-detail-dialog.tsx` (+ CSS column classes in `flight-detail-dialog.css`):

- Remove Seq / Label / MBH / MFDP header and cells.
- Rename Rank → Active Rank, Acting → Acting Rank.
- Preserve acting-equals-active → `—` display rule and source chip styles.
- Unfilled rows: warn text spans remaining columns correctly; empty state `colSpan={5}`.

## Testing

Playwright (Live and/or Scenario path that already opens Flight Detail):

- Assert table headers equal the five labels above.
- Assert headers Seq, Label, MBH, MFDP are absent.

## Out of scope follow-ups

If MBH/MFDP are later needed, surface them in a dedicated credit panel — not this table.
