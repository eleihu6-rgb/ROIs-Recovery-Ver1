# Flight Detail Composition card coverage backgrounds

**Date:** 2026-08-22  
**Module:** gantt — Flight Detail dialog  
**Status:** Implemented

## Goal

Tint each **Flight Composition** rank card background by per-rank fill so planners can scan coverage at a glance, without washing out rank labels or `actual / plan` text.

## Non-goals

- Do not change overall flight `crewData.status` (`full` / `partial` / `cancelled`).
- Do not change rank label colors (CA/FO/FA/IFD) or existing `comp-act` over/under number colors.
- Do not add dictionary-driven color tokens in this change.
- Do not change Live vs Scenario data merge.

## Decision summary

- Approach **A**: CSS modifiers on `.comp-card` using existing dialog tokens `--fdd-green-dim` / `--fdd-amber-dim` / `--fdd-red-dim` (~10% opacity — light enough for text).
- Over-fill (`actual > plan`) uses the same **full** (green) background as exact fill.
- Live and Scenario share `FlightDetailDialog` (§Gantt-Unify).

## Per-card rules

| Condition | Modifier class | Background |
|-----------|----------------|------------|
| `plan > 0` and `actual >= plan` (includes over-fill) | `full` | `var(--fdd-green-dim)` |
| `plan > 0` and `0 < actual < plan` | `partial` | `var(--fdd-amber-dim)` |
| `plan > 0` and `actual === 0` | `empty` | `var(--fdd-red-dim)` |
| `plan === 0` | (none) | keep default `--fdd-card-hi` |

Helper (pure): `deriveCompositionCardCoverage(actual, plan) → 'full' | 'partial' | 'empty' | null` — apply as `comp-card ${coverage ?? ''}`.

## Files

- `gantt/src/components/flight/derive-composition-card-coverage.ts` (+ unit test)
- `gantt/src/components/flight/flight-detail-dialog.tsx` — set class from helper
- `gantt/src/components/flight/flight-detail-dialog.css` — `.comp-card.full|.partial|.empty` backgrounds
- Playwright: assert at least one `full` and one `empty` class on composition cards in an existing Flight Detail scenario (e.g. Scen-2020 / scenario-detail-dialogs) when fixtures allow

## Out of scope follow-ups

- Soften or strengthen tint opacity via theme tokens.
- Border tint matching background state.
