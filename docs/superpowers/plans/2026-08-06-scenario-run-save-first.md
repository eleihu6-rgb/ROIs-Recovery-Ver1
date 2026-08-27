# Scenario Run — Save First Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before starting a scenario optimisation, require the user to save unsaved changes via a "Save & Run" confirm dialog (`Cancel` / `Save & Run`).

**Architecture:** In `scenario-toolbar.tsx`, the Run handler already gates the run behind the pre-run check dialog. Add a final gate: after the pre-run check passes, if `isDirty` is true, open a Save & Run `AppDialog`; on confirm, `await saveDetail()` then `runScenario(id)`; on `Cancel`, do nothing. `saveDetail()` toasts its own failures and keeps `isDirty === true`, so the component reads `useScenarioStore.getState().isDirty` after the await to decide whether the run may start.

**Tech Stack:** React 19 + Zustand + `@rois/ui` `AppDialog`; Vitest (gantt unit); Playwright (e2e).

## Global Constraints

- All dialogs must use `@rois/ui` `AppDialog` (§Pop-up Window Standard): `data-testid`, footer `Cancel` left / primary right, `dismissable` prop.
- UI strings in English (§前端语言规范).
- §Testing Discipline: every UI feature ships with a Playwright test; unit tests are acceptable for pure logic. Use TDD (write failing test → implement → green).
- §Help Authoring: the scenario-run help topic must match the new flow; `help-data.ts` `stepCount`/`overview` must stay in sync.
- `saveDetail(): Promise<void>` catches its own errors and toasts; it does not throw. `runScenario(id: number): Promise<void>`. `useScenarioStore.getState().isDirty: boolean` is the post-save success signal.
- Commits use the repo convention: `feat: <...>` with `Co-Authored-By: Claude <noreply@anthropic.com>`.

---
### Task 1: Save & Run guard in the scenario toolbar

**Files:**
- Modify: `gantt/src/components/scenario/scenario-toolbar.tsx`
- Create: `gantt/src/components/scenario/__tests__/scenario-toolbar.test.tsx`

**Interfaces:**
- Consumes: `useScenarioStore` selectors `isDirty`, `saving`, actions `saveDetail`, `runScenario`, `transitionStatus`, `refreshDetail`, `runningId`; `useShellStore` `setModule`, `setScenarioTabType`; `@rois/ui` `AppDialog`, `Button`, tooltips.
- Produces: Save & Run `AppDialog` with `data-testid="save-run-dialog"` and primary button `data-testid="save-run-confirm"`. `handleRun` / `handleConfirmedRun` open it when `isDirty` and the pre-run check passes; `handleSaveAndRun` saves then runs.

- [ ] **Step 1: Write the failing unit test**

Create `gantt/src/components/scenario/__tests__/scenario-toolbar.test.tsx`:

```tsx
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScenarioToolbar } from '../scenario-toolbar'
import type { ScenarioDetail, RoFilterParams } from '@/types'

// ─── Store mock: callable selector + getState() (used by handleSaveAndRun) ───
const storeState = {
  isDirty: false,
  saving: false,
  saveDetail: vi.fn(async () => {}),
  runScenario: vi.fn(async () => {}),
  transitionStatus: vi.fn(async () => {}),
  refreshDetail: vi.fn(async () => {}),
  runningId: null as number | null,
}
const useScenarioStoreMock = ((selector: (s: typeof storeState) => unknown) => selector(storeState)) as never
;(useScenarioStoreMock as { getState: () => typeof storeState }).getState = () => storeState

vi.mock('@/stores/scenario-store', () => ({ useScenarioStore: useScenarioStoreMock }))
vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (s: unknown) => unknown) =>
    selector({ setModule: vi.fn(), setScenarioTabType: vi.fn() }),
}))
vi.mock('@rois/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AppDialog: ({ open, title, children, footer, 'data-testid': testId }: {
    open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode; 'data-testid'?: string
  }) => (open ? (
    <div data-testid={testId}>
      <div>{title}</div>
      {children}
      {footer}
    </div>
  ) : null),
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

const runnableFilterParams: RoFilterParams = {
  crew: { bases: ['YEG'], fleets: [], ranks: [], status: 'ACTIVE', birthday: { from: '', to: '' }, seniority: { min: null, max: null } },
  pairing: { bases: ['YEG'], fleets: [], ranks: [], types: [], duration: { min: null, max: null } },
}

const runnableDetail: ScenarioDetail = {
  id: 701,
  name: 'RO Scenario',
  fileType: 'RO',
  status: 'DRAFT',
  strDtLoc: '2026-07-01',
  endDtLoc: '2026-07-31',
  division: 'P',
  optimizedCount: 0,
  leadinLive: 0,
  updatedBy: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
  worksetId: 1,
  version: 0,
  rulesetId: 103,
  pairingScenarioId: 0,
  filterParams: runnableFilterParams,
  comments: null,
  createdBy: null,
  createdAt: '2026-07-01T00:00:00.000Z',
}

const render = (detail: ScenarioDetail = runnableDetail): HTMLDivElement => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioToolbar detail={detail} />)
  })
  return container
}

beforeEach(() => {
  storeState.isDirty = false
  storeState.saving = false
  storeState.saveDetail.mockReset()
  storeState.saveDetail.mockImplementation(async () => {})
  storeState.runScenario.mockReset()
  storeState.transitionStatus.mockReset()
  storeState.refreshDetail.mockReset()
})

describe('ScenarioToolbar — Save & Run guard', () => {
  it('dirty + runnable → Run opens the Save & Run dialog, does not run yet', () => {
    storeState.isDirty = true
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeTruthy()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('clean + runnable → Run starts the optimisation directly, no dialog', () => {
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
    expect(storeState.runScenario).toHaveBeenCalledWith(701)
  })

  it('dirty → Cancel closes the dialog without saving or running', () => {
    storeState.isDirty = true
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const cancel = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancel') as HTMLButtonElement
    act(() => cancel.click())
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
    expect(storeState.saveDetail).not.toHaveBeenCalled()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('dirty → Save & Run saves first, then starts the optimisation', async () => {
    storeState.isDirty = true
    storeState.saveDetail.mockImplementation(async () => { storeState.isDirty = false })
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const confirm = container.querySelector('[data-testid="save-run-confirm"]') as HTMLButtonElement
    await act(async () => { confirm.click() })
    expect(storeState.saveDetail).toHaveBeenCalled()
    expect(storeState.runScenario).toHaveBeenCalledWith(701)
    expect(storeState.saveDetail.mock.invocationCallOrder[0])
      .toBeLessThan(storeState.runScenario.mock.invocationCallOrder[0])
  })

  it('dirty → Save & Run does NOT run when the save fails', async () => {
    storeState.isDirty = true
    storeState.saveDetail.mockImplementation(async () => { /* isDirty stays true → save failed */ })
    const container = render()
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    const confirm = container.querySelector('[data-testid="save-run-confirm"]') as HTMLButtonElement
    await act(async () => { confirm.click() })
    expect(storeState.saveDetail).toHaveBeenCalled()
    expect(storeState.runScenario).not.toHaveBeenCalled()
  })

  it('dirty + blockers → Pre-run Check appears first (not Save & Run)', () => {
    storeState.isDirty = true
    const container = render({ ...runnableDetail, pairingScenarioId: null })
    act(() => {
      (container.querySelector('[data-testid="scenario-run-btn"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="run-check-dialog"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="save-run-dialog"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-toolbar.test.tsx`
Expected: FAIL — `save-run-dialog` / `save-run-confirm` not found (feature not implemented yet).

- [ ] **Step 3: Implement the Save & Run guard**

In `gantt/src/components/scenario/scenario-toolbar.tsx`:

(a) Add state next to the existing `useState` calls (around line 100):

```tsx
const [saveRunOpen, setSaveRunOpen] = useState(false)
```

(b) Add the dirty gate and the save-and-run handler, and route both run paths through the gate. Replace `handleRun` (lines ~109-124) and `handleConfirmedRun` (lines ~126-129):

```tsx
const handleRun = (): void => {
  // Kill: no validation needed
  if (isRunning) {
    void transitionStatus(detail.id, 'FAILED')
    return
  }

  const check = checkRunConditions(detail)
  // If there are any issues, show the pre-run check dialog
  if (check.blockers.length > 0 || check.warnings.length > 0) {
    setRunCheck(check)
    return
  }

  startRun()
}

const handleConfirmedRun = (): void => {
  setRunCheck(null)
  startRun()
}

/** Final gate before starting the optimisation: unsaved edits must be saved first. */
const startRun = (): void => {
  if (isDirty) {
    setSaveRunOpen(true)
    return
  }
  void runScenario(detail.id)
}

const handleSaveAndRun = async (): Promise<void> => {
  setSaveRunOpen(false)
  await saveDetail()
  // saveDetail toasts on failure and keeps isDirty=true — only run when the save landed.
  if (useScenarioStore.getState().isDirty) return
  void runScenario(detail.id)
}
```

(c) Add the Save & Run dialog JSX right after the pre-run check `AppDialog` (after its closing `</AppDialog>` around line 340):

```tsx
{/* Unsaved changes — require saving before the optimisation starts */}
<AppDialog
  open={saveRunOpen}
  onOpenChange={(open) => { if (!open) setSaveRunOpen(false) }}
  title="Unsaved changes"
  icon={<AlertTriangle className="h-4 w-4" />}
  description="You have unsaved changes to this scenario. Save before starting the optimisation?"
  dismissable={!saving}
  data-testid="save-run-dialog"
  className="sm:max-w-[420px]"
  footer={
    <>
      <Button variant="ghost" disabled={saving} onClick={() => setSaveRunOpen(false)}>
        Cancel
      </Button>
      <Button data-testid="save-run-confirm" disabled={saving} onClick={() => { void handleSaveAndRun() }}>
        {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Save & Run
      </Button>
    </>
  }
>
  <p className="text-xs text-muted-foreground">
    Saving first ensures the optimisation runs with the latest edits.
  </p>
</AppDialog>
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-toolbar.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Typecheck + full scenario unit suite**

Run: `cd gantt && npx tsc --noEmit && npx vitest run src/components/scenario`
Expected: tsc exit 0; all scenario unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario/scenario-toolbar.tsx gantt/src/components/scenario/__tests__/scenario-toolbar.test.tsx
git commit -m "feat(scenario): require saving unsaved changes before running optimisation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
### Task 2: E2E regression test

**Files:**
- Create: `e2e/tests/gantt/scenario/scenario-run-save-first.spec.ts`

**Interfaces:**
- Consumes: `seedGanttAuth` / `ganttApiUrl` from `e2e/utils/gantt-hook`, `gotoScenarioList` from `e2e/pages/gantt/scenario-nav`. Uses the real live-server; the run POST is intercepted so no real optimisation starts.

- [ ] **Step 1: Write the e2e test**

```ts
/**
 * Scenario run with unsaved edits must prompt Save & Run first.
 *
 * Seeds a runnable DRAFT RO scenario (no blockers/warnings) via API, then drives
 * the real UI: rename → Run → Save & Run dialog. Cancel keeps edits unsaved and
 * fires no run; Save & Run persists the name and fires the run request (the run
 * POST is intercepted so no real optimisation starts).
 */
import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'
import { ganttApiUrl, seedGanttAuth } from '../../../utils/gantt-hook'

const unique = `E2E RunSaveFirst ${Date.now()}`

test('Run with unsaved changes prompts Save & Run; cancel keeps unsaved, confirm saves then runs', async ({ page, request }) => {
  const token = await seedGanttAuth(page, request)

  // Precondition: a runnable DRAFT RO scenario (pairing 0-Live, filters set → no warnings).
  const createRes = await request.post(`${ganttApiUrl}/api/scenario`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: unique,
      fileType: 'RO',
      division: 'P',
      rulesetId: 103,
      pairingScenarioId: 0,
      strDtLoc: '2026-07-01',
      endDtLoc: '2026-07-31',
      filterParams: {
        crew: { bases: ['YEG'], fleets: [], ranks: [], status: 'ACTIVE', birthday: { from: '', to: '' }, seniority: { min: null, max: null } },
        pairing: { bases: ['YEG'], fleets: [], ranks: [], types: [], duration: { min: null, max: null } },
      },
    },
  })
  expect(createRes.ok(), `seed create failed: ${createRes.status()}`).toBeTruthy()
  const scenarioId = ((await createRes.json()) as { data: { id: number } }).data.id

  // Intercept the run POST so no real optimisation job is created.
  let runRequested = false
  await page.route('**/api/scenario/*/run', async (route) => {
    runRequested = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { taskId: 'e2e-mock' } }) })
  })

  const getName = async (): Promise<string> =>
    ((await (await request.get(`${ganttApiUrl}/api/scenario/${scenarioId}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { data: { name: string } }).data.name

  try {
    await page.goto('/altair/')
    await gotoScenarioList(page)
    await page.getByTestId('scenario-nav-ro').click()
    await expect(page.getByTestId('scenario-new-btn')).toBeVisible()

    await page.getByPlaceholder('Search scenarios…').fill(unique)
    const item = page.getByTestId('scenario-list-item').filter({ hasText: unique })
    await expect(item).toBeVisible({ timeout: 40_000 })
    await item.click()
    await expect(page.getByTestId('scenario-detail-panel')).toBeVisible()

    // Make it dirty: rename (unsaved edit). Save button lights up.
    const nameInput = page.getByTestId('scenario-name-input')
    const saveBtn = page.getByTestId('scenario-save-btn')
    await nameInput.fill(`${unique} edited`)
    await expect(saveBtn).toBeEnabled()

    // Run → the Save & Run dialog appears (scenario is runnable → no pre-run check).
    await page.getByTestId('scenario-run-btn').click()
    await expect(page.getByTestId('save-run-dialog')).toBeVisible()

    // Cancel → nothing saved, no run request, still dirty.
    await page.getByTestId('save-run-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('save-run-dialog')).toBeHidden()
    expect(runRequested).toBe(false)
    await expect(saveBtn).toBeEnabled()
    expect(await getName()).toBe(unique)

    // Run again → Save & Run → name persisted and run request fired.
    await page.getByTestId('scenario-run-btn').click()
    await expect(page.getByTestId('save-run-dialog')).toBeVisible()
    await page.getByTestId('save-run-confirm').click()
    await expect(page.getByTestId('save-run-dialog')).toBeHidden()
    await expect(saveBtn).toBeDisabled({ timeout: 15_000 })
    expect(runRequested).toBe(true)
    expect(await getName()).toBe(`${unique} edited`)
  } finally {
    await request.delete(`${ganttApiUrl}/api/scenario/${scenarioId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
  }
})
```

- [ ] **Step 2: Run the e2e test**

Run: `cd e2e && npx playwright test tests/gantt/scenario/scenario-run-save-first.spec.ts --config config/playwright.config.ts --reporter=list --workers=1 --project=gantt`
Expected: PASS (with `gantt-setup` auth passing too).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario/scenario-run-save-first.spec.ts
git commit -m "test(gantt/e2e): Run with unsaved changes prompts Save & Run

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
### Task 3: Sync the scenario-run help topic

**Files:**
- Modify: `gantt/src/components/help/topics/scenario/scenario-run.tsx`
- Modify: `gantt/src/components/help/help-data.ts:226-231`

**Interfaces:**
- Consumes: existing `HelpStep` / `HelpNote` / `HelpControlsRef` helpers in `../../help-article`.

- [ ] **Step 1: Add the Save & Run step to the article**

In `scenario-run.tsx`, insert a new step between the current "warnings → Proceed Anyway" step (`HelpStep n={3}`) and the "Optimization started successfully" step (`HelpStep n={4}`), renumbering the remaining steps by +1:

```tsx
<HelpStep n={4}>
  If the scenario has <strong>unsaved changes</strong>, a <strong>Unsaved changes</strong>{' '}
  dialog appears instead of starting immediately. Choose <strong>Save &amp; Run</strong> to save
  the scenario and start the optimisation, or <strong>Cancel</strong> to keep editing. The run only
  starts after the scenario is saved.
</HelpStep>
```

(Renumber the former steps 4→5, 5→6, 6→7, 7→8, 8→9.)

Update the `Play icon (Kick off run)` entry in `HelpControlsRef` to:

```tsx
{ icon: <Play className="h-4 w-4 text-muted-foreground" />, name: 'Play icon (Kick off run)', description: 'Opens the pre-run check, prompts to save unsaved changes, then starts the optimisation.' },
```

- [ ] **Step 2: Sync help-data**

In `help-data.ts` (`scenario-run` entry): set `stepCount: 9` and update `overview`:

```
stepCount: 9,
overview: 'Before running, the system checks that required fields are set (dates, rule set, pairing scenario). The pre-run check dialog lists blockers or warnings, and unsaved changes must be saved before the engine starts.',
```

- [ ] **Step 3: Run the help unit tests**

Run: `cd gantt && npx vitest run src/components/help`
Expected: PASS (help-data and topic tests, including any `stepCount` assertions).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/help/topics/scenario/scenario-run.tsx gantt/src/components/help/help-data.ts
git commit -m "docs(gantt/help): document Save & Run prompt before starting optimisation

Co-Authored-By: Claude <noreply@anthropic.com>"
```
