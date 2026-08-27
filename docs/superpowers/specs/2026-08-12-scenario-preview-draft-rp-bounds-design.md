# Design: Scenario preview-draft RP bounds from scenario filter

## Problem

Scenario assign on SIT (scenario 740, crew 13645, Sep 25 CRAM) called `preview-draft` with pairing overlay correct, but `rpFrom/rpTo = 2026-08-01..08-31` (Live filter). Rule 7507 evaluated August → no 7507 → silent allow, no dialog.

Root cause: `legalityPreviewApi.checkDraft` always fills RP via `useFilterStore` (= `getFilterStore('live')`). Scenario Gantt uses `getFilterStore(scenarioId)`.

## Fix

- `currentGanttRpBounds(contextId)` reads `getFilterStore(contextId)`.
- `checkDraft`: when `contextType === 'scenario'` and `scenarioId` set, use that scenario’s filter store; else Live.
- Fallback if scenario has no selected RP ids: scenario `data.strDtLoc` / `endDtLoc` (YYYY-MM-DD), then existing dateRange bias.
- Live path unchanged. Explicit `rpFrom`/`rpTo` still win.

## Test

Regression: Live filter on August, scenario filter on September → scenario `checkDraft` posts September bounds.
