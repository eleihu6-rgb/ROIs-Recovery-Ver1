# Scenario List Success Badge Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scenario list success badges clearer on selected and hover-highlighted rows.

**Architecture:** Keep the change local to `ScenarioListItem`. Replace the current translucent emerald success classes with one shared no-border success badge class using a pale green fill, deep green text, and semibold text.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest focused component test.

## Global Constraints

- Use the approved palette: background `#DFF7EA`, text `#065F46`, no border, semibold.
- Apply the success treatment to the RO id badge and positive optimized roster count badge.
- Keep zero-result rows neutral.
- Do not change Scenario list data refresh, status logic, or layout structure.
- Do not add dependencies.

---

### Task 1: Scenario List Badge Contrast

**Files:**
- Modify: `gantt/src/components/scenario/scenario-list-item.tsx`
- Modify: `gantt/src/components/scenario/__tests__/scenario-list-item.test.tsx`
- Modify: `e2e/tests/gantt/scenario-id-badge.spec.ts`

**Interfaces:**
- Consumes: `ScenarioListItem` props and existing `ScenarioItem.optimizedCount`.
- Produces: Updated class names on `[data-testid="scenario-item-id"]` for RO rows and `[data-testid="scenario-item-optimized-count"]` when optimized count is positive.

- [ ] **Step 1: Write the failing test**

Update `scenario-list-item.test.tsx` so the dense layout test expects:

```ts
expect(idBadge?.className).toContain('bg-[#DFF7EA]')
expect(idBadge?.className).toContain('text-[#065F46]')
expect(idBadge?.className).toContain('font-semibold')
expect(idBadge?.className).not.toContain('border')

expect(optimized?.className).toContain('bg-[#DFF7EA]')
expect(optimized?.className).toContain('text-[#065F46]')
expect(optimized?.className).toContain('font-semibold')
expect(optimized?.className).not.toContain('border')
```

Keep the zero-result test asserting no green success classes.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-list-item.test.tsx --run
```

Expected: FAIL because the component still emits `bg-emerald-500/10 text-emerald-500`.

- [ ] **Step 3: Write minimal implementation**

In `scenario-list-item.tsx`, add:

```ts
const SUCCESS_BADGE_CLASS = 'bg-[#DFF7EA] text-[#065F46] font-semibold'
```

Use it for the RO type badge path and for positive optimized count badges. Keep PO and TO classes unchanged.

- [ ] **Step 4: Run verification**

Run:

```bash
npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-list-item.test.tsx --run
npm --prefix gantt exec -- tsc -p gantt/tsconfig.json --noEmit
npm run check:ui
GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live GANTT_TEST_USER=<user> GANTT_TEST_PASS=<pass> npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-id-badge.spec.ts --reporter=list
```

Expected: all commands exit 0. Run the Playwright command from `e2e/` while local Vite is serving `http://localhost:5566/altair/` with `VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live`. If `check:ui` flags arbitrary hex colors, replace the class with an approved tokenized style path before finalizing.
