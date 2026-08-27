# Gantt Row Zebra Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve alternating row contrast across all five supported Gantt pane instances while keeping Live and Scenario on the shared rendering path.

**Architecture:** Add one shared row-background helper in the Gantt canvas constants layer and consume it from both the timeline body renderer and the fixed-panel header renderer. Use the existing theme-aware Gantt color model so all panes and both Live/Scenario sources inherit the same behavior.

**Tech Stack:** React 19, Vite, TypeScript, Canvas 2D, Playwright.

## Global Constraints

- Current Gantt supports five pane instances: Roster Main, Roster Sub, Pairing Main, Pairing Sub, Flight.
- Apply the same behavior to Live Gantt and Scenario Gantt through shared components only.
- Do not add Live-only, Scenario-only, Roster-only, Pairing-only, or Flight-only branches.
- Preserve current row parity.
- Preserve existing overlay layering for selection, frozen rows, today/weekend highlights, grid lines, task blocks, bells, and locks.
- Increment `FRONTEND_VERSION` for frontend runtime code changes.
- Run Gantt TypeScript check, `npm run check:ui`, and browser/Playwright verification.

---

### Task 1: Shared Row Stripe Helper

**Files:**
- Modify: `gantt/src/components/gantt/gantt-constants.ts`
- Modify: `gantt/src/components/gantt/renderers/base-renderer.ts`
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx`
- Test: `gantt/src/components/gantt/__tests__/gantt-row-stripes.test.ts`

**Interfaces:**
- Produces: `getRowBackgroundColor(rowIndex: number, colors: Pick<GanttColors, 'bgColor' | 'bgColorAlt'>): string`
- Consumes: `GanttColors.bgColor` and `GanttColors.bgColorAlt`

- [ ] **Step 1: Add a focused test for row stripe parity**

Create `gantt/src/components/gantt/__tests__/gantt-row-stripes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getRowBackgroundColor } from '../gantt-constants'

describe('getRowBackgroundColor', () => {
  const colors = {
    bgColor: '#ffffff',
    bgColorAlt: '#eef2f7',
  }

  it('keeps existing odd-row alternate stripe parity', () => {
    expect(getRowBackgroundColor(0, colors)).toBe('#ffffff')
    expect(getRowBackgroundColor(1, colors)).toBe('#eef2f7')
    expect(getRowBackgroundColor(2, colors)).toBe('#ffffff')
    expect(getRowBackgroundColor(3, colors)).toBe('#eef2f7')
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd gantt && npx vitest run src/components/gantt/__tests__/gantt-row-stripes.test.ts`

Expected: FAIL because `getRowBackgroundColor` is not exported yet.

- [ ] **Step 3: Add the shared helper and stronger default alternate color**

In `gantt/src/components/gantt/gantt-constants.ts`, update the fallback alternate color and export the helper:

```ts
export const BG_COLOR_ALT = '#eef2f7'

export const getRowBackgroundColor = (
  rowIndex: number,
  colors: Pick<GanttColors, 'bgColor' | 'bgColorAlt'>,
): string => {
  return rowIndex % 2 === 1 ? colors.bgColorAlt : colors.bgColor
}
```

- [ ] **Step 4: Use the helper in the timeline body renderer**

In `gantt/src/components/gantt/renderers/base-renderer.ts`, import `getRowBackgroundColor` and replace row stripe branching with:

```ts
ctx.fillStyle = getRowBackgroundColor(i, colors)
ctx.fillRect(0, Math.max(y, hh + fzH), canvasWidth, rh)
```

For frozen rows, replace the base background assignment with:

```ts
ctx.fillStyle = getRowBackgroundColor(i, colors)
ctx.fillRect(0, y, canvasWidth, rh)
```

- [ ] **Step 5: Use the helper in fixed-panel normal rows**

In `gantt/src/components/gantt/pane-header-canvas.tsx`, import `getRowBackgroundColor` and replace `drawSingleRow` base background with:

```ts
ctx.fillStyle = getRowBackgroundColor(i, colors)
ctx.fillRect(0, y, canvasWidth, rowHeight)
```

- [ ] **Step 6: Use the helper in fixed-panel Pairing two-line rows**

In `drawTwoLineRow`, replace the base background branch with:

```ts
ctx.fillStyle = getRowBackgroundColor(i, colors)
ctx.fillRect(0, y, canvasWidth, PAIRING_ROW_HEIGHT)
```

- [ ] **Step 7: Run the focused test to verify it passes**

Run: `cd gantt && npx vitest run src/components/gantt/__tests__/gantt-row-stripes.test.ts`

Expected: PASS.

### Task 2: Theme Token Alignment

**Files:**
- Modify: `packages/ui/src/styles/globals.css`

**Interfaces:**
- Consumes: `--gantt-bg-alt` from `getGanttColors()`
- Produces: stronger default light-theme alternate row token

- [ ] **Step 1: Update the default light theme alternate row token**

In `packages/ui/src/styles/globals.css`, update only the default root Gantt alternate background:

```css
--gantt-bg-alt: #eef2f7;
```

Leave non-default themes unchanged unless visual verification shows illegible contrast.

- [ ] **Step 2: Confirm no one-off pane color constants were introduced**

Run: `rg -n "Roster.*bg|Pairing.*bg|Flight.*bg|row.*#eef2f7|bgColorAlt" gantt/src/components/gantt gantt/src/components/panes packages/ui/src/styles/globals.css`

Expected: the new hard-coded color appears only as the fallback/token, and pane renderers use the shared helper.

### Task 3: Version Bump and Verification

**Files:**
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Produces: incremented `FRONTEND_VERSION`

- [ ] **Step 1: Increment `FRONTEND_VERSION`**

In `gantt/src/version.ts`, increase `FRONTEND_VERSION` by 1 and update its comment to describe the row zebra contrast change.

- [ ] **Step 2: Run TypeScript check**

Run: `cd gantt && npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run UI standard check**

Run: `npm run check:ui`

Expected: exit 0 with zero hard violations.

- [ ] **Step 4: Run focused test**

Run: `cd gantt && npx vitest run src/components/gantt/__tests__/gantt-row-stripes.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser verification**

Start or reuse the Gantt dev server, open the Gantt view, and inspect the five supported panes: Roster Main, Roster Sub, Pairing Main, Pairing Sub, Flight.

Expected: alternating row backgrounds are visibly continuous across fixed panel and timeline body in Live and Scenario shared Gantt views.
