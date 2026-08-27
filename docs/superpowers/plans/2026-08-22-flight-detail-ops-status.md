# Flight Detail Ops STATUS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Flight Detail Flight Info → Status as Cancelled / Finished / Delayed / On Time / Scheduled per the 2026-08-22 ops-status spec (15-minute delay threshold; Finished when both ATD and ATA exist).

**Architecture:** Extract a pure `deriveFlightOpsStatus` helper next to the dialog (testable with Vitest). Wire it into `LoadedDetailBody` Status badge. Add `data-testid="flight-detail-ops-status"` for E2E. Keep Live/Scenario on the shared dialog path.

**Tech Stack:** React/TS (gantt), Vitest, Playwright

## Global Constraints

- English UI labels only: `Cancelled`, `Finished`, `Delayed`, `On Time`, `Scheduled`
- Delay threshold: `ATD − STD > 15` minutes for Delayed
- Do not change crew composition `status` / coverage cards
- No new hard-coded colors; reuse `badge-cancel` / `badge-partial` / `badge-full` / `badge-type`
- §No-Auto-Commit unless user asks

## File map

| File | Role |
|------|------|
| `gantt/src/components/flight/derive-flight-ops-status.ts` | Pure status derivation |
| `gantt/src/components/flight/derive-flight-ops-status.test.ts` | Vitest cases for all 5 tiers |
| `gantt/src/components/flight/flight-detail-dialog.tsx` | Call helper; expose testid |
| `e2e/tests/gantt/flight-detail-ops-status.spec.ts` | Playwright: Scenario → Scheduled (no actuals) |

---

### Task 1: Pure helper + Vitest (TDD)

**Files:**
- Create: `gantt/src/components/flight/derive-flight-ops-status.ts`
- Create: `gantt/src/components/flight/__tests__/derive-flight-ops-status.test.ts`

**Interfaces:**
- Produces:
```ts
export type FlightOpsStatusLabel = 'Cancelled' | 'Finished' | 'Delayed' | 'On Time' | 'Scheduled'

export type FlightOpsStatusResult = {
  label: FlightOpsStatusLabel
  badgeClass: 'badge-cancel' | 'badge-partial' | 'badge-full' | 'badge-type'
  unit: string
  unitColor?: string
}

export const deriveFlightOpsStatus = (input: {
  isCancelled: boolean
  actDepDtUtc: string | null | undefined
  actArvDtUtc: string | null | undefined
  schDepDtUtc: string | null | undefined
}): FlightOpsStatusResult
```

- [ ] **Step 1: Write failing Vitest**

```ts
import { describe, expect, it } from 'vitest'
import { deriveFlightOpsStatus } from './derive-flight-ops-status'

describe('deriveFlightOpsStatus', () => {
  it('Cancelled wins even with actuals', () => {
    expect(deriveFlightOpsStatus({
      isCancelled: true,
      actDepDtUtc: '2026-09-07T10:00:00.000Z',
      actArvDtUtc: '2026-09-07T14:00:00.000Z',
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    }).label).toBe('Cancelled')
  })

  it('Finished when ATD and ATA exist', () => {
    expect(deriveFlightOpsStatus({
      isCancelled: false,
      actDepDtUtc: '2026-09-07T09:45:00.000Z',
      actArvDtUtc: '2026-09-07T14:50:00.000Z',
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    }).label).toBe('Finished')
  })

  it('Delayed when ATD only and ATD-STD > 15', () => {
    const r = deriveFlightOpsStatus({
      isCancelled: false,
      actDepDtUtc: '2026-09-07T10:00:00.000Z',
      actArvDtUtc: null,
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    })
    expect(r.label).toBe('Delayed')
    expect(r.unit).toBe('+20 min')
  })

  it('On Time when ATD only and delay ≤ 15', () => {
    expect(deriveFlightOpsStatus({
      isCancelled: false,
      actDepDtUtc: '2026-09-07T09:50:00.000Z',
      actArvDtUtc: null,
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    }).label).toBe('On Time')
  })

  it('Scheduled when no ATD', () => {
    expect(deriveFlightOpsStatus({
      isCancelled: false,
      actDepDtUtc: null,
      actArvDtUtc: null,
      schDepDtUtc: '2026-09-07T09:40:00.000Z',
    }).label).toBe('Scheduled')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `cd gantt && npx vitest run src/components/flight/derive-flight-ops-status.test.ts`
Expected: FAIL cannot resolve module / function undefined

- [ ] **Step 3: Implement helper**

Logic order: Cancelled → Finished (both actuals) → if ATD and no ATA: Delayed if depDelta > 15 else On Time → Scheduled. Reuse minute delta via `date-fns` `parseISO` or shared `deltaMinutes` copied locally to keep helper free of React. Delayed unit `+${depDelta} min`; On Time unit via signed `+Nm` / `-Nm` / `0m` matching dialog `formatDelta`; Finished/Scheduled empty unit; Cancelled empty unit + `unitColor: 'var(--red)'`; Delayed `var(--amber)`; On Time `var(--green)`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd gantt && npx vitest run src/components/flight/derive-flight-ops-status.test.ts`

- [ ] **Step 5: Commit only if user asks** (skip auto-commit)

---

### Task 2: Wire dialog + testid

**Files:**
- Modify: `gantt/src/components/flight/flight-detail-dialog.tsx` (status block ~103–128 and Status badge ~254–258)

- [ ] **Step 1: Replace inline if/else with helper**

```ts
import { deriveFlightOpsStatus } from './derive-flight-ops-status'

const ops = deriveFlightOpsStatus({
  isCancelled: flight.isCancelled,
  actDepDtUtc: flight.actDepDtUtc,
  actArvDtUtc: flight.actArvDtUtc,
  schDepDtUtc: flight.schDepDtUtc,
})
// use ops.label, ops.badgeClass, ops.unit, ops.unitColor
```

Badge:

```tsx
<span
  className={`badge ${ops.badgeClass}`}
  data-testid="flight-detail-ops-status"
  style={{ fontSize: 10, padding: '1px 8px' }}
>
  {ops.label}
</span>
```

Keep ATD/ATA delta display in the times grid unchanged (still uses local `depDelta` / `arvDelta`).

- [ ] **Step 2: Typecheck / lint as needed**

- [ ] **Step 3: Commit only if user asks**

---

### Task 3: Playwright regression (Scenario → Scheduled)

**Files:**
- Create: `e2e/tests/gantt/flight-detail-ops-status.spec.ts`  
  OR extend Scen-2020 in `e2e/tests/gantt/scenario-detail-dialogs.spec.ts` with one assertion after dialog opens:

```ts
await expect(dialog.getByTestId('flight-detail-ops-status')).toHaveText('Scheduled')
```

Prefer extending Scen-2020 (already opens Scenario flight with null actuals) to avoid a second heavy scenario bootstrap — unless Scen-2020 env is flaky; then a focused Live mock route is acceptable.

- [ ] **Step 1: Add assertion (or focused spec)**
- [ ] **Step 2: Run** `npx playwright test e2e/tests/gantt/scenario-detail-dialogs.spec.ts --grep Scen-2020 --reporter=list` (from `e2e/`)
- [ ] **Step 3: `npm run check:ui`** — expect PASS 0 hard violations
- [ ] **Step 4: Commit only if user asks**

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Cancelled / Finished / Delayed>15 / On Time≤15 / Scheduled | Task 1 |
| Badge classes / no new colors | Task 1–2 |
| Shared Live+Scenario dialog | Task 2 |
| Playwright Scheduled path | Task 3 |
| No composition status change | (untouched) |
