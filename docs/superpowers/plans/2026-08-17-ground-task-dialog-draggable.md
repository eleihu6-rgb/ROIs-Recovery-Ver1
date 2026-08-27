# Ground Task Dialog Draggable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground Task create/edit/view-only window is an `AppDialog` so users can drag it by the blue title bar, matching Pairing Info.

**Architecture:** Replace the hand-rolled `fixed` overlay in `ground-task-dialog.tsx` with `@rois/ui` `AppDialog` (`draggable` default true). Keep form body and existing field testids. Point stale e2e locators at `data-testid="ground-task-dialog"`. Add a Playwright drag assertion copied from Scen-2022.

**Tech Stack:** React 19, `@rois/ui` AppDialog (Radix Dialog), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-ground-task-dialog-draggable-design.md`

## Global Constraints

- Touch only Ground Task dialog chrome + e2e locators/tests; no API / credit / assignment logic.
- Must use `AppDialog`; do not add a custom drag handler.
- Live + Scenario share `GroundTaskDialog` in `app-shell` — one change covers both.
- Footer: Cancel/Close left of primary Save; omit Save when `readOnly`; Delete stays in body danger zone.
- While `saving`, `dismissable={false}`.
- UI English; Playwright drives real UI (§Simulate-User).
- §Stale-Test: replace `div.bg-card` dialog locators with `getByTestId('ground-task-dialog')`.
- Do not git commit unless the user explicitly asked.

---

## File map

| File | Role |
|------|------|
| `e2e/tests/gantt/ground-task-dialog.spec.ts` | New drag test + locator update |
| `e2e/tests/gantt/scenario-ground-task-open.spec.ts` | Locator update |
| `gantt/src/components/roster/ground-task-dialog.tsx` | AppDialog migration |

---

### Task 1: Failing Playwright — Ground Task title bar is draggable

**Files:**
- Modify: `e2e/tests/gantt/ground-task-dialog.spec.ts`

**Interfaces:**
- Consumes: `create-ground-task-btn`, future `ground-task-dialog`, `[data-app-dialog-header]`
- Produces: Live-GT-drag test that fails until AppDialog is used

- [ ] **Step 1: Add the failing test** at the end of the existing `test.describe` in `e2e/tests/gantt/ground-task-dialog.spec.ts` (same `beforeEach` that seeds Live gantt):

```typescript
  test('Live-GT-drag — Ground Task AppDialog title bar moves the window', async ({ page }) => {
    await page.getByTestId('create-ground-task-btn').click()
    const dialog = page.getByTestId('ground-task-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByRole('heading', { name: 'Create Ground Task' })).toBeVisible()

    const header = dialog.locator('[data-app-dialog-header]')
    await expect(header).toBeVisible()
    const headerClass = (await header.getAttribute('class')) ?? ''
    expect(headerClass, 'title bar uses bg-primary').toContain('bg-primary')

    const before = await dialog.boundingBox()
    const start = await header.boundingBox()
    expect(before && start).toBeTruthy()
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
    await page.mouse.down()
    await page.mouse.move(start!.x + start!.width / 2 + 140, start!.y + start!.height / 2 + 90, { steps: 8 })
    await page.mouse.up()
    const after = await dialog.boundingBox()
    expect(Math.round(after!.x - before!.x), 'window moved right ~140px').toBeGreaterThan(110)
    expect(Math.round(after!.y - before!.y), 'window moved down ~90px').toBeGreaterThan(60)
  })
```

Do **not** migrate the component in this task.

- [ ] **Step 2: Run the new test — expect FAIL**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/ground-task-dialog.spec.ts --grep 'Live-GT-drag' --reporter=list --workers=1
```

Expected: FAIL — `ground-task-dialog` not found and/or no `[data-app-dialog-header]`.

- [ ] **Step 3: Commit only if the user asked.** Report RED output in the task report.

---

### Task 2: Migrate GroundTaskDialog to AppDialog + fix stale locators

**Files:**
- Modify: `gantt/src/components/roster/ground-task-dialog.tsx`
- Modify: `e2e/tests/gantt/ground-task-dialog.spec.ts` (replace every `page.locator('div.bg-card').filter({ has: heading })` with `page.getByTestId('ground-task-dialog')`)
- Modify: `e2e/tests/gantt/scenario-ground-task-open.spec.ts` (same locator swap)

**Interfaces:**
- Consumes: `AppDialog` from `@rois/ui`; `SquarePlus` from `lucide-react`; existing `open` / `close` / `readOnly` / `mode` / `saving` / `handleSubmit` / `handleDelete`
- Produces: `data-testid="ground-task-dialog"`; drag via default `draggable`

- [ ] **Step 1: Update imports**

Replace:

```typescript
import { Button, Input, Badge } from '@rois/ui'
import { X, Lock } from 'lucide-react'
```

with:

```typescript
import { AppDialog, Button, Input, Badge } from '@rois/ui'
import { Lock, SquarePlus } from 'lucide-react'
```

Remove unused `X`.

- [ ] **Step 2: Replace the outer overlay return**

Delete `if (!open) return null` and the wrapping `fixed inset-0` / custom header / custom footer. Keep the form body (error banner, grid fields, danger zone) as `AppDialog` children.

Use this shell (keep existing inner form JSX unchanged except drop the old header/footer wrappers):

```tsx
  const dialogTitle =
    readOnly ? 'Ground Task' : mode === 'create' ? 'Create Ground Task' : 'Edit Ground Task'

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next && !saving) close() }}
      data-testid="ground-task-dialog"
      className="sm:max-w-[500px]"
      icon={<SquarePlus className="h-4 w-4" />}
      dismissable={!saving}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{dialogTitle}</span>
          {mode === 'edit' && editItem && (
            <Badge variant="outline" className="text-2xs border-primary-foreground/40 text-primary-foreground">
              #{editItem.id}
            </Badge>
          )}
          {readOnly && (
            <Badge
              variant="outline"
              className="text-2xs border-primary-foreground/40 text-primary-foreground"
              data-testid="ground-task-view-only"
            >
              View only
            </Badge>
          )}
        </span>
      }
      footer={
        <>
          {mode === 'create' && selectedCrewIds.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              Will create <strong>{selectedCrewIds.length}</strong> roster{' '}
              {selectedCrewIds.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={close} className="text-xs">
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-xs" data-testid="ground-task-save-btn">
              {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          )}
        </>
      }
    >
      {/* existing error banner + form grid + danger zone; drop outer px-5 wrappers that duplicate AppDialog padding if they look double-padded — keep field testids */}
    </AppDialog>
  )
```

Update the file comment: no longer a raw `z-[9999]` overlay.

Danger zone Delete button stays in the body with `data-testid="ground-task-delete-btn"`.

- [ ] **Step 3: Stale locator updates**

In `e2e/tests/gantt/ground-task-dialog.spec.ts` and `e2e/tests/gantt/scenario-ground-task-open.spec.ts`, replace:

```typescript
const dialog = page.locator('div.bg-card').filter({ has: heading })
```

with:

```typescript
const dialog = page.getByTestId('ground-task-dialog')
```

Keep the heading visibility asserts where they already exist.

- [ ] **Step 4: Run Playwright**

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/ground-task-dialog.spec.ts \
  tests/gantt/scenario-ground-task-open.spec.ts \
  --reporter=list --workers=1
```

Expected: all tests in those files PASS, including Live-GT-drag.

- [ ] **Step 5: Commit only if the user asked.**

---

## Spec coverage check

| Spec § | Task |
|--------|------|
| §3 draggable title bar | Task 1 + 2 |
| §5 AppDialog | Task 2 |
| §6 testid, footer, dismissable while saving, badges | Task 2 |
| §6 stale locators | Task 2 |
| §7 Playwright drag | Task 1 then 2 GREEN |

## Placeholder scan

None.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-17-ground-task-dialog-draggable.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute in this session with checkpoints  

**Which approach?**
