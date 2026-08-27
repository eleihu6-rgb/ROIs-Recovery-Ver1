# Legality Rule Sets card — vertical clip at short viewports

**Date:** 2026-08-25  
**Status:** Corrected (height, not narrow width)  
**Scope:** `legality-rule-sets-view.tsx` Rule Sets list cards

## Problem

At short viewport heights, Rule Sets cards compress vertically. The second meta row (`updatedBy`, type chips, division, Enabled, rule count) is clipped to thin color bars.

## Root cause

Cards sit in a `flex flex-col` list. Default `flex-shrink: 1` plus card `overflow-hidden` lets CSS treat `min-height: auto` as ~0, so cards shrink below content height instead of forcing the list to scroll.

(Earlier “narrow column / flex-wrap” fix addressed a different axis and did not stop the crush.)

## Decision

1. `shrink-0` on each ruleset card button — never compress; list scrolls (`overflow-y-auto`).
2. `overflow-x-hidden` instead of `overflow-hidden` — keep horizontal truncate without enabling vertical min-size collapse.
3. Keep meta-row `flex-wrap` as a harmless width aid.
