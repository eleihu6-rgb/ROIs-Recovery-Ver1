# Rule 8072 Short Alert Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verbose rule 8072 Alert Center message with `Crew count out of range (Current: X, Allowed: min–max).` while keeping `Row N:` via `withParamRowPrefix`.

**Architecture:** Single producer of user-facing English 8072 text is `rule8072` in `legality-recheck-core.mjs`. Change only that template string; update unit and Playwright assertions that match the old prose. No engine / PBS / C++ changes.

**Tech Stack:** Node.js (node:test), Playwright E2E, live-server legality recheck scripts

## Global Constraints

- Message body exactly: `Crew count out of range (Current: {qualified}, Allowed: {min}–{max}).`
- En-dash `–` (U+2013) between min and max
- Do not change detection logic, anchors, severity, or numeric fields
- Do not change PBS PyO3 machine format or C++ legacy messages
- Do not migrate already-persisted DB rows (new text after next recheck)
- Spec: `docs/superpowers/specs/2026-08-15-rule-8072-short-message-design.md`

## File map

| File | Role |
|------|------|
| `live-server/scripts/legality-recheck-core.mjs` | Build persisted `message` for 8072 |
| `live-server/scripts/__tests__/legality-recheck-core.test.mjs` | Unit coverage of mapped message |
| `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts` | UI/API regression for Alert text |

---

### Task 1: Shorten 8072 message + update automated tests

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` (the `message:` line inside `rule8072`)
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs` (assertion in `rule8072 maps F8 default row into persisted 8072 violations`)
- Modify: `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts` (assertions that match `/valid qualification/`)

**Interfaces:**
- Consumes: existing `withParamRowPrefix`, `qualified`, `minLimits`, `maxLimits` from `check-8072` TSV mapping
- Produces: `message` string shape `Row N: Crew count out of range (Current: …, Allowed: …–…).`

- [ ] **Step 1: Update the failing unit assertion (TDD)**

In `live-server/scripts/__tests__/legality-recheck-core.test.mjs`, in test `rule8072 maps F8 default row into persisted 8072 violations`, replace:

```js
assert.match(out[0].message, /valid qualification \(FC-GREEN\)/)
```

with:

```js
assert.equal(
  out[0].message,
  'Row 1: Crew count out of range (Current: 2, Allowed: 0–1).',
)
```

(The fixture uses qualified=2, min=0, max=1, rowIndex 0 → Row 1.)

- [ ] **Step 2: Run unit test — expect FAIL**

```bash
cd /home/qianggong/Documents/Crew/rois-ai/live-server && node --test scripts/__tests__/legality-recheck-core.test.mjs --test-name-pattern 'rule8072 maps F8 default'
```

Expected: FAIL — actual message still contains the long `valid qualification` sentence.

- [ ] **Step 3: Change the message template**

In `live-server/scripts/legality-recheck-core.mjs`, inside `rule8072`, replace the `message:` assignment with:

```js
message: withParamRowPrefix(
  m.rowIndex,
  `Crew count out of range (Current: ${qualified}, Allowed: ${minLimits}–${maxLimits}).`,
),
```

Keep all other fields (`crew_id`, `pairing_id`, `segment_id`, `actual_value`, `limit_value`, etc.) unchanged. `planned` / `filled` may remain unused in the message (still parsed from TSV).

- [ ] **Step 4: Run unit test — expect PASS**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Update Playwright assertions**

In `e2e/tests/gantt/rule-8072-flight-qualification.spec.ts`, replace any `/valid qualification/` (or `/valid qualification \(\*\)/`) expectations with matches for the short copy, e.g.:

```ts
expect(rows.some((v) => /Crew count out of range \(Current: \d+, Allowed: \d+–\d+\)/.test(v.message))).toBe(true)
```

and for visible Alert Center text:

```ts
await expect(rows8072.first()).toContainText(/Crew count out of range/)
```

- [ ] **Step 6: Run Playwright**

```bash
cd /home/qianggong/Documents/Crew/rois-ai && npx playwright test e2e/tests/gantt/rule-8072-flight-qualification.spec.ts --reporter=list
```

Expected: all tests in that file PASS. If the suite needs local live-server/gantt already up, use the same env the existing 8072 E2E docs use; do not weaken assertions.

- [ ] **Step 7: Commit only when the user asks**

Do not `git commit` unless explicitly requested (§No-Auto-Commit).

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Short message body with Current/Allowed | Task 1 Step 3 |
| En-dash between min–max | Task 1 Step 3 |
| Keep `Row N:` via `withParamRowPrefix` | Task 1 Step 3 |
| Unit test update | Task 1 Steps 1–4 |
| E2E update | Task 1 Steps 5–6 |
| No engine/PBS/C++/DB migration | Out of plan (not implemented) |

Placeholder scan: none. Type consistency: N/A (string-only change).
