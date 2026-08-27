# Rule Severity From `rule.severity` Design

**Date:** 2026-08-09  
**Status:** approved via user “请继续” after gap analysis  
**Goal:** Every user-facing violation surface (draft preview dialog, Alert Center, recheck persistence) shows Soft / Overridable / Hard from `rule.severity`, never from hardcoded engine constants.

## Background

`7504/001` has `severity = 1` (Soft) in the rule table, but draft preview and recheck emit `severity: 2`, so the confirm dialog shows **OVERRIDABLE**. Local WIP remaps only in `previewDraftLegality`; Alert/recheck write paths still hardcode.

## Approach (chosen)

**Single remap at `computeViolations` exit** after `resolveRulesetRules` also loads `severity`. Live recheck, scenario recheck, and draft preview all call this entry → one fix covers persist + preview.

Preview keeps `normalizePreviewViolations` for response shaping and `allowed = severity < 3` (Hard blocks). Remap map becomes optional defense; primary severity already corrected by the core.

Confirm dialog adds a Soft summary badge (`severity === 1`) alongside Hard / Overridable.

## Non-Goals

- No change to rule-manager editors (already use `rule.severity`)
- Legacy one-off `persist-*.mjs` CLIs may keep constants until retired; gantt path uses recheck core
- No historical `rule_violation` backfill (next recheck rewrites)

## Validation

- Unit: `applyRulesetSeverity` / `normalizePreviewViolations` (7504 engine=2 → Soft=1)
- Fix legality-preview preflight path regression
- Soft badge present when severity=1 in confirm dialog (unit or light component assertion)
- Focused vitest / node:test PASS
