# Flight Detail Block Hours Implementation Plan

> **For agentic workers:** Use executing-plans / inline execution. Steps use checkbox syntax.

**Goal:** Derive Flight Detail Block Hours from ATD/ATA when both exist, else STD/STA.

**Architecture:** Pure `deriveFlightBlockMinutes` + Vitest; wire dialog. Ignore `flight.blkMin` for display.

**Tech Stack:** gantt TS, Vitest, date-fns parseISO

## Global Constraints

- English UI unchanged (`Block Hours`, `BH`)
- Shared Live/Scenario dialog
- §No-Auto-Commit unless asked

---

### Task 1: Helper + Vitest (TDD)

**Files:**
- Create: `gantt/src/components/flight/derive-flight-block-minutes.ts`
- Create: `gantt/src/components/flight/__tests__/derive-flight-block-minutes.test.ts`

```ts
export const deriveFlightBlockMinutes = (input: {
  actDepDtUtc: string | null | undefined
  actArvDtUtc: string | null | undefined
  schDepDtUtc: string | null | undefined
  schArvDtUtc: string | null | undefined
}): number | null
```

Cases: both actuals → actual delta; no ATA → scheduled; invalid arv≤dep → null; missing scheduled pair → null.

Run: `cd gantt && npx vitest run src/components/flight/__tests__/derive-flight-block-minutes.test.ts`

### Task 2: Wire dialog

Modify `flight-detail-dialog.tsx` Block Hours row to use helper instead of `flight.blkMin`.

### Task 3: Verify

- Vitest PASS
- Optionally extend Scen-2020: ops Scheduled flight with STD/STA asserts Block Hours `5:10` (or fixture-specific) if times known — else skip if times vary by mock
- `npm run check:ui`
