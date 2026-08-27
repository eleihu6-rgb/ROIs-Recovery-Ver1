# Scenario Detail Success Badge Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the existing readable success badge palette to the two Scenario detail badges circled in the screenshot.

**Architecture:** Keep the change local to Scenario detail components. Use the same no-border success palette in `scenario-basic-info.tsx` for RO type and in `scenario-detail-panel.tsx` for DONE status, with tests checking the rendered classes/computed styles.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest focused component tests, Playwright real UI test.

## Global Constraints

- Use background `#DFF7EA`, text `#065F46`, no border, semibold.
- Apply only to Basic Info `RO` type badge and detail header `DONE` status badge.
- Do not change Scenario list styling, data refresh, status logic, or layout.
- Do not change PO/TO/RUNNING/FAILED/PUBLISHED palettes.
- Do not add dependencies.

---

### Task 1: Detail Success Badge Palette

**Files:**
- Modify: `gantt/src/components/scenario/scenario-basic-info.tsx`
- Modify: `gantt/src/components/scenario/scenario-detail-panel.tsx`
- Modify: `gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx`
- Create: `gantt/src/components/scenario/__tests__/scenario-detail-panel.test.tsx`
- Modify: `e2e/tests/gantt/scenario-id-badge.spec.ts`

**Interfaces:**
- Consumes: `ScenarioBasicInfo` `detail.fileType` and `ScenarioDetailPanel` `detail.status`.
- Produces: Updated badge class names on `[data-testid="scenario-type-badge"]` for RO and `[data-testid="scenario-status-badge"]` for DONE.

- [ ] **Step 1: Write failing component assertions**

Update `scenario-basic-info.test.tsx` so the RO type badge expects `bg-[#DFF7EA]`, `text-[#065F46]`, `font-semibold`, and no `border`.

Create `scenario-detail-panel.test.tsx` with a mocked store and child components that renders a DONE detail and asserts the status badge has `bg-[#DFF7EA]`, `text-[#065F46]`, `font-semibold`, no `border`, and text `Done`.

- [ ] **Step 2: Run component tests to verify failure**

Run:

```bash
npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-basic-info.test.tsx src/components/scenario/__tests__/scenario-detail-panel.test.tsx --run
```

Expected: FAIL because the components still use emerald utility classes.

- [ ] **Step 3: Apply minimal implementation**

Replace the RO and DONE mapping values with:

```ts
'bg-[#DFF7EA] text-[#065F46]'
```

Use it for `TYPE_BADGE.RO` in `scenario-basic-info.tsx` and `STATUS_BADGE_CLASS.DONE` in `scenario-detail-panel.tsx`. Keep the existing base `font-semibold` class on each badge.

- [ ] **Step 4: Update Playwright coverage**

Extend `scenario-id-badge.spec.ts` to open/select a DONE RO scenario, read computed styles for `scenario-type-badge` and `scenario-status-badge`, and assert:

```ts
backgroundColor === 'rgb(223, 247, 234)'
color === 'rgb(6, 95, 70)'
fontWeight >= 600
borderTopWidth === '0px'
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm --prefix gantt run test -- src/components/scenario/__tests__/scenario-basic-info.test.tsx src/components/scenario/__tests__/scenario-detail-panel.test.tsx --run
npm --prefix gantt exec -- tsc -p gantt/tsconfig.json --noEmit
npm run check:ui
GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=https://crew-f8-usva-sit.roiscloud.com/live GANTT_TEST_USER=<user> GANTT_TEST_PASS=<pass> npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-id-badge.spec.ts --reporter=list
```

Expected: all commands exit 0. Run the Playwright command from `e2e/` while Vite serves `http://localhost:5566/altair/` with `VITE_LIVE_TARGET=https://crew-f8-usva-sit.roiscloud.com/live`.
