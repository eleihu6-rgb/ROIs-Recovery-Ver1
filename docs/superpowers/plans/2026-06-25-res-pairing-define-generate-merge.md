# RES Pairing Planner Define Generate Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge RES Pairing Planner creation and generation into the `Define` page and remove the visible `Review & Generate` tab.

**Architecture:** Reuse the existing `ReviewGenerate` component as a generation panel appended to `DefineWorkspace`. The dialog tab shell becomes a two-tab interface (`Define`, `Manage existing`) while stale internal `review` tab state falls back to `Define`.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, Playwright E2E, Tailwind CSS v4 utility classes, existing `@rois/ui` helpers.

## Global Constraints

- Keep the change scoped to the RES Pairing Planner UI and directly affected E2E tests.
- Do not change backend APIs, database schema, or reserve generation semantics.
- Preserve the existing empty text: `No cells defined. Go to the Define tab and apply a plan first.`
- Preserve conflict policy labels and descriptions: `Skip` / `Leave existing pairings unchanged`, `Overwrite` / `Replace existing pairing composition`, `Add` / `Insert new pairings alongside existing`.
- Preserve `res-generate` button behavior, API call, filter refresh, dialog close, and last-result banner state.
- Do not modify unrelated untracked files such as `e2e/results/`.

---

## File Structure

- Modify `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx`: remove the visible review tab, remove standalone review rendering, keep stale `review` fallback to Define.
- Modify `gantt/src/components/res-pairing/define-workspace.tsx`: append `ReviewGenerate` below the calendar/entry grid.
- Modify `gantt/src/components/res-pairing/review-generate.tsx`: update file header comments so the component is described as a reusable generation panel.
- Modify `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts`: generate directly from Define instead of clicking `res-tab-review`; assert the removed tab is not visible.
- Modify `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts`: same two-tab workflow update for YYZ cabin acceptance.

## Task 1: Add Tests For Two-Tab Define Generate Workflow

**Files:**
- Modify: `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts`
- Modify: `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts`

**Interfaces:**
- Consumes: existing Playwright selectors `res-planner-dialog`, `res-tab-define`, `res-tab-review`, `res-generate`.
- Produces: failing acceptance coverage that expects `res-tab-review` to be absent and `res-generate` to be available from Define after applying cells.

- [ ] **Step 1: Update the YVR acceptance test to assert the Review tab is absent and generate from Define**

Replace this block in `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts`:

```ts
  // 6) review & generate (the only thing that writes — triggered by THIS click, via the UI)
  await page.getByTestId('res-tab-review').click()
  await page.getByTestId('res-generate').click()
```

with:

```ts
  // 6) generate from Define (the only thing that writes — triggered by THIS click, via the UI)
  await expect(page.getByTestId('res-tab-review')).toHaveCount(0)
  await expect(page.getByTestId('res-tab-define')).toBeVisible()
  await page.getByTestId('res-generate').click()
```

- [ ] **Step 2: Update the YYZ cabin acceptance test to assert the Review tab is absent and generate from Define**

Replace this block in `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts`:

```ts
  // generate (UI-triggered write)
  await page.getByTestId('res-tab-review').click()
  await page.getByTestId('res-generate').click()
```

with:

```ts
  // generate from Define (UI-triggered write)
  await expect(page.getByTestId('res-tab-review')).toHaveCount(0)
  await expect(page.getByTestId('res-tab-define')).toBeVisible()
  await page.getByTestId('res-generate').click()
```

- [ ] **Step 3: Run the focused tests to verify they fail before implementation**

Run:

```bash
cd e2e && npx playwright test tests/gantt/res-pairing-yvr-acceptance.spec.ts tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts
```

Expected before implementation: both tests fail because `res-tab-review` still exists, so `toHaveCount(0)` fails.

- [ ] **Step 4: Commit the failing test updates**

```bash
git add e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts
git commit -m "test: expect RES generation from define tab" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2: Merge Generate Panel Into Define Page

**Files:**
- Modify: `gantt/src/components/res-pairing/define-workspace.tsx`
- Modify: `gantt/src/components/res-pairing/review-generate.tsx`

**Interfaces:**
- Consumes: `ReviewGenerate` React component exported from `./review-generate`.
- Produces: Define page layout that renders current generation summary, conflict policy, and `res-generate` button below the calendar grid.

- [ ] **Step 1: Update `review-generate.tsx` comments to describe reusable panel behavior**

Replace the top file comment in `gantt/src/components/res-pairing/review-generate.tsx`:

```ts
// gantt/src/components/res-pairing/review-generate.tsx
//
// Review & Generate tab body for the RES Pairing Planner dialog.
// Shows a grouped overview of the planned cells, a conflict-policy selector,
// and the Generate button that writes RES pairings and then:
```

with:

```ts
// gantt/src/components/res-pairing/review-generate.tsx
//
// Review/generate panel for the RES Pairing Planner Define page.
// Shows a grouped overview of the planned cells, a conflict-policy selector,
// and the Generate button that writes RES pairings and then:
```

- [ ] **Step 2: Import `ReviewGenerate` into `define-workspace.tsx`**

Change the import block in `gantt/src/components/res-pairing/define-workspace.tsx` from:

```ts
import { ResCalendar } from './res-calendar'
import { ResEntryPanel } from './res-entry-panel'
```

to:

```ts
import { ResCalendar } from './res-calendar'
import { ResEntryPanel } from './res-entry-panel'
import { ReviewGenerate } from './review-generate'
```

- [ ] **Step 3: Render the generation panel below the Define calendar grid**

Replace the bottom JSX block in `gantt/src/components/res-pairing/define-workspace.tsx`:

```tsx
      {/* Main layout: calendar (left) + entry panel (right) */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 360px' }}>
        {/* Calendar */}
        <ResCalendar
          year={year}
          month={month}
          onMonthChange={handleMonthChange}
        />

        {/* Entry panel */}
        <ResEntryPanel year={year} month={month} />
      </div>
    </div>
  )
}
```

with:

```tsx
      {/* Main layout: calendar (left) + entry panel (right) */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 360px' }}>
        {/* Calendar */}
        <ResCalendar
          year={year}
          month={month}
          onMonthChange={handleMonthChange}
        />

        {/* Entry panel */}
        <ResEntryPanel year={year} month={month} />
      </div>

      {/* Generate controls live at the end of Define so setup and creation stay on one page. */}
      <ReviewGenerate />
    </div>
  )
}
```

- [ ] **Step 4: Run TypeScript type-check for this task**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: `0` TypeScript errors.

- [ ] **Step 5: Commit the Define page merge**

```bash
git add gantt/src/components/res-pairing/define-workspace.tsx gantt/src/components/res-pairing/review-generate.tsx
git commit -m "feat: show RES generate controls on define page" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3: Remove Visible Review Tab And Add Fallback Rendering

**Files:**
- Modify: `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx`

**Interfaces:**
- Consumes: `ResPlannerTab` still currently includes `'review'` from `gantt/src/stores/res-planner-store.ts`.
- Produces: visible tab list containing only `define` and `manage`; stale `review` state renders `DefineWorkspace`.

- [ ] **Step 1: Remove the standalone `ReviewGenerate` import**

Change this import block in `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx`:

```ts
import { DefineWorkspace } from './define-workspace'
import { ReviewGenerate } from './review-generate'
import { ManageExisting } from './manage-existing'
```

to:

```ts
import { DefineWorkspace } from './define-workspace'
import { ManageExisting } from './manage-existing'
```

- [ ] **Step 2: Remove the visible `Review & Generate` tab entry**

Change `TABS` in `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx` from:

```ts
const TABS: { id: ResPlannerTab; label: string; testId: string }[] = [
  { id: 'define',  label: 'Define',             testId: 'res-tab-define'  },
  { id: 'review',  label: 'Review & Generate',  testId: 'res-tab-review'  },
  { id: 'manage',  label: 'Manage existing',    testId: 'res-tab-manage'  },
]
```

to:

```ts
const TABS: { id: Extract<ResPlannerTab, 'define' | 'manage'>; label: string; testId: string }[] = [
  { id: 'define', label: 'Define', testId: 'res-tab-define' },
  { id: 'manage', label: 'Manage existing', testId: 'res-tab-manage' },
]
```

- [ ] **Step 3: Make stale review state fall back to Define**

Change `TabBody` in `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx` from:

```tsx
/** Tab body — all three tabs wired. */
const TabBody = ({ tab }: { tab: ResPlannerTab }) => {
  if (tab === 'define') {
    return <DefineWorkspace />
  }
  if (tab === 'review') {
    return <ReviewGenerate />
  }
  return <ManageExisting />
}
```

to:

```tsx
/** Tab body — review is intentionally folded into Define. */
const TabBody = ({ tab }: { tab: ResPlannerTab }) => {
  if (tab === 'manage') {
    return <ManageExisting />
  }
  return <DefineWorkspace />
}
```

- [ ] **Step 4: Run TypeScript type-check for this task**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: `0` TypeScript errors.

- [ ] **Step 5: Commit the tab shell update**

```bash
git add gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx
git commit -m "feat: remove RES review generate tab" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4: Final Verification

**Files:**
- No source edits expected unless verification exposes an issue.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: verified two-tab workflow with generation controls at the bottom of Define.

- [ ] **Step 1: Search for stale review tab selector usage**

Run:

```bash
rg -n "res-tab-review|Review & Generate|ReviewGenerate" gantt/src e2e/tests/gantt
```

Expected: no `res-tab-review` usage in active source or tests. `ReviewGenerate` should only appear in `define-workspace.tsx` and its own component declaration/comment.

- [ ] **Step 2: Run Gantt type-check**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: `0` TypeScript errors.

- [ ] **Step 3: Run focused Playwright tests**

Run:

```bash
cd e2e && npx playwright test tests/gantt/res-define-workspace.spec.ts tests/gantt/res-pairing-yvr-acceptance.spec.ts tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts
```

Expected: all selected tests pass. If the environment lacks required live-server/gantt services, record the exact failure and run at minimum the TypeScript check plus stale-selector search.

- [ ] **Step 4: Visual check in the browser if dev services are available**

Open the Gantt app, then:

1. Click the RES Pairing Planner button.
2. Confirm the tab bar shows only `Define` and `Manage existing`.
3. Confirm the bottom of Define shows `No cells defined. Go to the Define tab and apply a plan first.`, `Conflict policy`, `Skip`, `Overwrite`, `Add`, and a disabled `Generate` button before cells are defined.
4. Apply a plan and confirm the Generate button is available from the same Define page.

- [ ] **Step 5: Commit any verification-driven fixes**

If Task 4 requires source or test changes, commit them:

```bash
git add gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx gantt/src/components/res-pairing/define-workspace.tsx gantt/src/components/res-pairing/review-generate.tsx e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts
git commit -m "fix: align RES planner define generate workflow" -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```

If Task 4 requires no changes, do not create an empty commit.
