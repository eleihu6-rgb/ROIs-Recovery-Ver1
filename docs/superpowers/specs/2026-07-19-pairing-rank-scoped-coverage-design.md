# Pairing Rank-Scoped Coverage Filter

**Date:** 2026-07-19  
**Status:** Implemented  
**Related:** [2026-07-02 pairing rank filter](2026-07-02-gantt-pairing-rank-filter-design.md)

## Problem

Selecting Rank=CA with Coverage Open+Partial still showed pairings whose CA seats were already filled when another rank was short (e.g. `CA(1)FO(1:0)`), because coverage was whole-pairing while rank only checked slot presence.

## Decision

When `pairing.ranks` is non-empty, classify coverage on selected-rank slots only. Empty ranks → whole-pairing (unchanged).

| Composition | Rank filter | Open+Partial |
|-------------|-------------|--------------|
| CA(1:0) FO(1) | CA | keep |
| CA(1) FO(1:0) | CA | hide |
| CA(1) FO(1:0) | (none) | keep (whole-pairing partial) |

Live: hard-hide non-matches whenever coverage is narrowed (with or without ranks), matching Scenario. Rank scoping still applies when ranks are set.
