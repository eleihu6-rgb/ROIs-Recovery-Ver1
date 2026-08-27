# Reserve Priority Default → "2331112" + 动态 Algorithm default 提示行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the Reserve Priority algorithm-parameter default from "3113222" to "2331112" (static), and make the dialog's "Algorithm default" helper line render dynamically from `item.defaultValue`.

**Architecture:** The default lives in the `scenario_parameter` `scenario_id=0` template row, seeded into new scenarios by `ensureScenarioDefaults`. Only the template `defaultValue` constant changes; `saveValues` does **not** mutate the template (Option A — a mutable default would break the dialog's "Changed" indicator). The frontend renders the helper line from `item.defaultValue`, which the API already returns.

**Tech Stack:** Fastify + TypeScript (live-server), React 19 + Vitest (gantt), Playwright (e2e).

## Global Constraints

- **§No-Auto-Commit:** Do NOT run `git commit`/`git push` without an explicit user command. Every task ends by staging/leaving changes for review; at the end present the diff and await the user's commit command. (Project `CLAUDE.md`.)
- **§Stale-Test:** The E2E assertion that changes is an intentional spec-driven update — update it, do not leave it red.
- **§UI-Standard-Gate:** The dialog edit touches no new styles; `npm run check:ui` must still pass with 0 hard violations.
- **Static default:** The `scenario_id = 0` default is NOT updated on save (Option A). The solver's `DEFAULT_RESERVE_WEEKDAY_PRIORITY` in `pbs-engine` is intentionally unchanged (confirmed by user).
- **No manual SQL:** The existing `ensureDefaultTemplates` upsert (`on conflict ... do update set param_val = excluded.param_val`) propagates the constant change into the DB `scenario_id=0` row on the next call.
- Reference spec: `docs/superpowers/specs/2026-08-13-reserve-priority-default-design.md` (revised to Option A on 2026-08-14).

---

### Task 1: Backend — change the initial default constant only

**Files:**
- Modify: `live-server/src/services/scenario/scenario-parameter-service.ts:83` (defaultValue)
- Test: `live-server/src/__tests__/services/scenario-parameter-service.test.ts` (no new tests — existing tests must stay green)

**Interfaces:**
- None new. No write-back helper is added.

- [ ] **Step 1: Change the initial default** (`scenario-parameter-service.ts:83`)

```ts
      defaultValue: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
```

(From `{ mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 }`.)

- [ ] **Step 2: Run the backend tests**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-parameter-service.test.ts`
Expected: all existing tests PASS (8 tests).

- [ ] **Step 3: Stage for review (no auto-commit — §No-Auto-Commit)**

Paste the PASS summary. Do NOT `git commit`.

---

### Task 2: Frontend — dynamic "Algorithm default" helper line

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameters-dialog.tsx` (add formatter near `summarizeParameters` at `:88-94`; use in `renderReservePriority` at `:270-299`)
- Test: `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`

**Interfaces:**
- Produces: `formatReservePriorityDefault(defaultValue: unknown): string` — exported from the dialog file; renders e.g. `"Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3."`

- [ ] **Step 1: Write the failing formatter test** — add `formatReservePriorityDefault` to the import on line 7 and append:

```tsx
describe('formatReservePriorityDefault', () => {
  it('groups weekdays by priority, chronological within group, groups ascending', () => {
    expect(formatReservePriorityDefault({ mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 }))
      .toBe('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')
    expect(formatReservePriorityDefault({ mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 }))
      .toBe('Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`
Expected: FAIL with "formatReservePriorityDefault is not defined".

- [ ] **Step 3: Implement the formatter** — add after `valuesEqual` (`scenario-parameters-dialog.tsx:86`)

```ts
const DAY_SHORT: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

/** Renders the current algorithm default as "Thu/Fri/Sat 1, Mon/Sun 2, ..." (ascending priority). */
export const formatReservePriorityDefault = (defaultValue: unknown): string => {
  const value = asRecord(defaultValue)
  const byPriority = new Map<number, string[]>()
  for (const [key] of WEEKDAYS) {
    const n = Number(value[key])
    if (!Number.isInteger(n) || n < 1 || n > 9) continue
    const days = byPriority.get(n) ?? []
    days.push(DAY_SHORT[key])
    byPriority.set(n, days)
  }
  const parts = [...byPriority.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([priority, days]) => `${days.join('/')} ${priority}`)
  return `Algorithm default: ${parts.join(', ')}.`
}
```

- [ ] **Step 4: Use it in `renderReservePriority`** — replace the hardcoded paragraph (`scenario-parameters-dialog.tsx:275-278`)

```tsx
        <p className="text-xs leading-relaxed text-muted-foreground">
          1 = highest priority; reserves on higher-priority weekdays are covered first.{' '}
          {formatReservePriorityDefault(item.defaultValue)}
        </p>
```

- [ ] **Step 5: Update the existing reserve-priority dialog test** — in `scenario-parameters-dialog.test.tsx`, change the mock on lines 162-163 to the new default and the assertion on line 176

```tsx
          defaultValue: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
          value: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
```
```tsx
    expect(container.textContent).toContain('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')
```

- [ ] **Step 6: Run the dialog tests to verify they pass**

Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Stage for review (no auto-commit — §No-Auto-Commit)**

Paste the PASS summary. Do NOT `git commit`.

---

### Task 3: E2E — update the helper-line assertion

**Files:**
- Modify: `e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts:38`

- [ ] **Step 1: Update the assertion** (the helper line is now dynamic; with the new default it renders as below)

```ts
  await expect(page.getByText('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')).toBeVisible()
```

- [ ] **Step 2: Run the E2E spec** (requires a live-server with the Task 1 backend change deployed/running, `SCENARIO_GANTT_SOURCE=db`, and a gantt dev server)

Run: `npx playwright test e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts --reporter=list`
Expected: the Reserve Priority tab test PASSes (its assertion now matches the new default).

> Environment note: this spec hits scenario #595 on the remote live-server DB. The helper line reads `item.defaultValue` from the DB `scenario_id=0` template, which only reflects "2331112" after the Task 1 backend code is running and `ensureDefaultTemplates` has upserted the new constant.

- [ ] **Step 3: Stage for review (no auto-commit — §No-Auto-Commit)**

Paste the PASS/FAIL summary. Do NOT `git commit`.

---

### Task 4: Full validation + stage for review

- [ ] **Step 1: Run the backend Vitest file**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario-parameter-service.test.ts`
Expected: all PASS.

- [ ] **Step 2: Run the gantt Vitest file**

Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`
Expected: all PASS.

- [ ] **Step 3: Run the UI standard gate**

Run: `npm run check:ui` (repo root)
Expected: 0 hard violations (no new styles were touched).

- [ ] **Step 4: Run the E2E spec** (if backend is available)

Run: `npx playwright test e2e/tests/gantt/scenario/scenario-params-team-rules.spec.ts --reporter=list`
Expected: PASS for the Reserve Priority test.

- [ ] **Step 5: Present the diff and await commit command**

Summarize the changed files (`scenario-parameter-service.ts`, `scenario-parameters-dialog.tsx`, the two test files, the E2E spec) and paste all PASS/FAIL receipts (§No-Illusion). Do NOT `git commit`/`git push` until the user commands it.
