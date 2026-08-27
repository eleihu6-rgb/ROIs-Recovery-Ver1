# Design: Unified FLY and Reserve puck colors

**Date:** 2026-08-14  
**Status:** Approved for implementation  
**Scope:** Shared Live/Scenario Gantt Canvas renderers

## Problem

The same duty changes color between panes:

- A normal FLY pairing is dark green in the Pairing pane but blue after assignment in the Roster pane.
- A Reserve pairing is dark green in the Pairing pane and blue after assignment in the Roster pane, while a pre-assigned standalone RES duty is light green.

This makes assignment state look like duty type and prevents planners from identifying FLY versus Reserve consistently.

## Decision

### Duty classification

Create one shared, pure Reserve-puck classifier used by both renderers.

A puck is Reserve when either:

1. `assignmentGroup === 'RES'`, or
2. its assignment code is one of `RES`, `CRAM`, `CRPM`, `PRAM`, `PRPM`.

Comparison is normalized with `trim().toUpperCase()`. Ordinary `SBY`, `ASBY`, and `SSB` are not included, so this change does not recolor general standby duties.

### Colors

| Duty | Pairing pane | Roster pane |
|---|---|---|
| Normal FLY | Existing Roster blue gradient (`#1e40af` → `#2563eb`) | Same blue gradient |
| Reserve pairing | Light-green gradient based on `#66CDAA` | Same light-green gradient |
| Pre-assigned standalone RES | Existing `#66CDAA` assignment color | Existing `#66CDAA` assignment color |
| DHD | Existing purple | Existing purple |
| Other ground/standby | Existing assignment/group color | Existing assignment/group color |

The Reserve gradient uses the existing renderer color-variant convention: a lightened `#66CDAA` top, `#66CDAA` bottom, and a darkened border. Text contrast follows the existing contrast-color helper.

### Renderer changes

- `pairing-renderer.ts`
  - Replace the normal-pairing dark-green gradient with the existing Roster blue gradient.
  - Before normal FLY rendering, detect Reserve by the shared classifier and use the Reserve assignment color.
  - Keep DHD and existing ground-duty behavior unchanged.
- `roster-renderer.ts`
  - In the segment-mode flight/pairing path, detect Reserve by the same classifier and use the Reserve assignment color.
  - Keep standalone ground RES behavior unchanged; it already resolves `RES` to `#66CDAA`.
- Put the classifier and shared puck-color constants in a focused shared color utility so Pairing and Roster cannot drift again.

## Testing

### Unit tests

- Reserve classifier returns true for:
  - group `RES`
  - assignments `RES`, `CRAM`, `CRPM`, `PRAM`, `PRPM`
  - mixed case and surrounding whitespace
- It returns false for normal FLY and ordinary `SBY` / `ASBY` / `SSB`.
- Shared color resolution returns:
  - blue for normal FLY
  - light green for Reserve

### Playwright

Drive the real Scenario Gantt UI with deterministic fixture data containing:

- one normal FLY pairing visible in Pairing and Roster panes
- one Reserve pairing visible in Pairing and Roster panes
- one standalone pre-assigned RES duty

Use the existing Gantt test hook (or add a focused read-only color probe if needed) to assert the rendered Canvas puck colors:

- normal FLY is blue in both panes
- Reserve is light green in both panes
- standalone RES remains light green

Then run `npm run check:ui` because frontend rendering code is touched.

## Local visual verification

After automated tests pass:

1. Start the local Gantt development server.
2. Open a Scenario with normal FLY and Reserve duties.
3. Verify both panes visually:
   - FLY remains blue before and after assignment.
   - Reserve remains light green before and after assignment.
   - DHD and other ground-duty colors are unchanged.

## Out of scope

- Flight pane status colors.
- Database `assignment_group.color` or `assignment.color_hex`.
- Recoloring ordinary SBY/ASBY/SSB.
- Layout, labels, borders unrelated to the duty-type color.
