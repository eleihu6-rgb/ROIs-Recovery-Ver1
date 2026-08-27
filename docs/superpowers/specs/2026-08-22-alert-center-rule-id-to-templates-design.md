# Alert Center Rule ID → Rule Templates instance

**Date:** 2026-08-22  
**Module:** gantt — Legality Alert Center + Rule Templates  
**Status:** Design approved in chat; Implemented

## Goal

Clicking a **Rule ID** cell in the Legality Alert Center (e.g. `8030/001`) closes the Alert Center and navigates to **Legality → Rule Templates**, focusing that catalog instance (search + expand params + scroll into view).

## Non-goals

- Do not change row-click “bring crew to top” for other cells.
- Do not open Rule Sets / catalog tree (user chose Rule Templates).
- Do not add URL deep-links in this change.
- Do not invent a new params dialog outside Rule Templates.

## Decision summary

- Approach **A**: shell navigation + `pendingFocus` on `useRuleInstancesStore`.
- Rule ID click uses `stopPropagation` so the row’s `onCrewClick` does not fire.
- Parse `ruleIdOf(row)` as `function` + optional `instance` (`8030/001` → fn=`8030`, inst=`001`; bare `8030` → fn only).

## Behavior

1. Style Rule ID as a clickable control (`button` or link-like), `data-testid="alert-rule-id-{ruleId}"`.
2. On click: `onClose()` Alert Center → `setActiveModule('legality')` → `setLegalityItem('rule-instances')` → `requestFocus({ function, instance })`.
3. `RuleInstancesView` effect on `pendingFocus`: find matching rule in loaded catalog; set search to `function/instance` (or function); expand that row’s params; `scrollIntoView` on the row; clear pending.
4. If no matching **template** row (page lists templates only): keep search filled; `notify.warn` / toast that the instance was not found in Rule Templates.

## Files

- `gantt/src/components/panes/violation-list-dialog.tsx` — Rule ID click handler
- `gantt/src/stores/rule-instances-store.ts` — `pendingFocus` + `requestFocus` / `clearPendingFocus`
- `gantt/src/components/legality/rule-instances-view.tsx` — consume pending focus
- Playwright: extend Alert Center / legality e2e — click Rule ID → Templates row focused

## Out of scope follow-ups

- Deep-link non-template copies into Rule Sets when not listed under Templates.
- Keep Alert Center open behind Legality.
