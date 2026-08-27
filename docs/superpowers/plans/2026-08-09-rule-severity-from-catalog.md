# Rule Severity From Catalog — Plan

**Goal:** Remap violation severity from `rule.severity` in `computeViolations`; finish preview; Soft badge.

### Task 1 — Core remap
- Modify `live-server/scripts/legality-recheck-core.mjs`: select severity in `resolveRulesetRules`; export `applyRulesetSeverity`; call at end of `computeViolations`
- Test: `scripts/__tests__/apply-ruleset-severity.test.mjs`

### Task 2 — Preview
- Keep/finish `normalizePreviewViolations` + `allowed < 3`
- Fix preflight test path (`process.cwd()` relative to live-server)
- Drop redundant severity query if core remaps (optional keep as belt-and-suspenders)

### Task 3 — Confirm dialog Soft badge
- `gantt/src/components/roster/rule-confirm-dialog.tsx` — softCount badge
- Small unit test or e2e assert if feasible

### Task 4 — Verify
```bash
cd live-server && npx vitest run src/__tests__/services/rule/legality-preview.test.ts
cd live-server && node --test scripts/__tests__/apply-ruleset-severity.test.mjs
```
