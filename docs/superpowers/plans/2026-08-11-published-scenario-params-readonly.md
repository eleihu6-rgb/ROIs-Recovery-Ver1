# Published/Running Scenario: Algorithm Parameters View-Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For PUBLISHED and RUNNING scenarios, the "Algorithm Parameters" button opens a read-only dialog (all values visible, none editable), and the backend rejects parameter writes for those statuses.

**Architecture:** Decouple "can open the dialog" from "panel read-only" in the gantt Scenario UI. The dialog already renders every editor disabled when its `disabled` prop is set; we change the footer to Close-only in that mode so no draft is committed. On the backend, extend the existing RUNNING 409 guard on the dedicated `PUT /:id/parameters` route to also cover PUBLISHED, and add an equivalent guard on the generic `PUT /:id` route (the path the frontend actually uses).

**Tech Stack:** React 19 + Vite (gantt), Fastify + Vitest (live-server), Playwright (e2e).

## Global Constraints

- §UI-Standard-Gate: no new `text-[Npx]`, no hardcoded colors, no hardcoded radii, icon + text rows use `flex items-center`; `text-xs` rows with a leading icon use `gap-1.5`; leading icon `h-3.5 w-3.5 shrink-0` + `text-muted-foreground`. Run `npm run check:ui` and paste PASS.
- §Minimal-First: touch only what the spec requires. No new `readOnly` prop — reuse the existing `disabled` prop as the read-only signal. Backend guard covers only `algorithmParameters`, not other fields.
- §Surgical: don't refactor unrelated code.
- §Stale-Test: update Scen-2060 and the basic-info unit test that assert the OLD "button disabled for PUBLISHED" behavior — same intent, new assertions.
- §No-Illusion: every task ends by running its tests and pasting the PASS result.
- UI language is English; comments/commits may be Chinese.
- Version bump: none needed (docs + runtime code changes go through the normal dev/build bump; do not hand-edit version files).

---
## Task 1: Read-only dialog mode (Close-only footer, no draft commit)

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameters-dialog.tsx:446-455` (footer)
- Test: `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`

**Interfaces:**
- Consumes: existing `ScenarioParametersDialog` props — `disabled` (read-only signal, already wired), `onOpenChange`, `onDraftChange`.
- Produces: `disabled=true` renders a single `Close` footer button and never calls `onDraftChange`. Later tasks rely on this behavior.

- [ ] **Step 1: Write the failing test**

Add to the bottom of the `describe('ScenarioParametersDialog', ...)` block in `scenario-parameters-dialog.test.tsx`:

```tsx
it('renders read-only when disabled: Close-only footer, inputs disabled, no draft commit', async () => {
  vi.mocked(scenarioApi.getParameters).mockResolvedValue({
    items: [
      {
        code: 'solver_limits',
        type: 'OBJ',
        description: 'Limits',
        idx: 10,
        schema: { maxIterations: { type: 'number', label: 'Max Iterations' } },
        defaultValue: { maxIterations: 100 },
        value: { maxIterations: 100 },
        hasScenarioValue: false,
      },
    ],
    summary: { templateCount: 1, configuredCount: 0 },
  })
  const container = document.createElement('div')
  const root = createRoot(container)
  const onDraftChange = vi.fn()
  const onOpenChange = vi.fn()

  await act(async () => {
    root.render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={onOpenChange} onDraftChange={onDraftChange} disabled />)
  })

  const numberInput = container.querySelector<HTMLInputElement>('input[aria-label="Max Iterations"]')
  expect(numberInput).not.toBeNull()
  expect(numberInput?.disabled).toBe(true)

  // No Done button in read-only mode — Close replaces Cancel + Done.
  expect(container.querySelector<HTMLButtonElement>('button[data-action="done"]')).toBeNull()

  const closeButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Close')
  expect(closeButton).toBeTruthy()

  await act(async () => {
    closeButton?.click()
  })

  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(onDraftChange).not.toHaveBeenCalled()

  await act(async () => { root.unmount() })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `gantt/`):
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```
Expected: the new test FAILS — the current footer always renders Cancel + Done, so there is no `Close` button and `done` button exists.

- [ ] **Step 3: Implement the read-only footer**

In `scenario-parameters-dialog.tsx`, replace the `footer` definition (lines 446-455):

```tsx
const footer = disabled ? (
  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
    Close
  </Button>
) : (
  <>
    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
      Cancel
    </Button>
    <Button type="button" data-action="done" onClick={handleComplete} disabled={loading || saving}>
      Done
    </Button>
  </>
)
```

Note: the `Done` button loses its `disabled ||` term because in the `disabled === false` branch `disabled` is always false — the button is now `disabled={loading || saving}`. The `Close` button path never touches `handleComplete`, so `onDraftChange` is never fired and `isDirty` stays false.

- [ ] **Step 4: Run test to verify it passes**

Run (from `gantt/`):
```bash
npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```
Expected: all tests PASS, including the new read-only test.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario/scenario-parameters-dialog.tsx gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
git commit -m "feat(gantt): scenario params dialog opens read-only (Close-only footer) when disabled

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 2: Open the dialog from a locked scenario (button decouple + lock icon)

**Files:**
- Modify: `gantt/src/components/scenario/scenario-basic-info.tsx:2` (import), `:370-399` (button + dialog)
- Test: `gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx:228-233` (update stale test + add lock-icon test)

**Interfaces:**
- Consumes: `disabled` prop (= `isReadonly`, i.e. RUNNING or PUBLISHED) from `ScenarioBasicInfoProps`; `Lock` from `lucide-react`.
- Produces: `[data-testid="scenario-parameters-open"]` button is always enabled for RO/TO; renders a `svg.lucide-lock` icon when `disabled` is true. `ScenarioParametersDialog` still receives `disabled={disabled}` so Task 1's read-only mode engages.

- [ ] **Step 1: Update the stale unit test and add lock-icon assertions**

Replace the test `disables algorithm parameters for Published scenarios` (lines 228-233) in `scenario-basic-info.test.tsx`:

```tsx
it('keeps the algorithm parameters button enabled for Published scenarios (view-only, lock icon)', async () => {
  const container = await render({ ...roDetail, status: 'PUBLISHED' }, true)

  const parametersButton = container.querySelector('[data-testid="scenario-parameters-open"]') as HTMLButtonElement | null
  expect(parametersButton?.disabled).toBe(false)
  expect(container.querySelector('svg.lucide-lock')).toBeTruthy()
})

it('shows no lock icon on the algorithm parameters button while editable', async () => {
  const container = await render(roDetail)

  expect(container.querySelector('svg.lucide-lock')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `gantt/`):
```bash
npx vitest run src/components/scenario/__tests__/scenario-basic-info.test.tsx
```
Expected: the updated Published test FAILS — the button is currently `disabled` (no lucide-lock icon rendered; `disabled === true`).

- [ ] **Step 3: Implement the button change**

In `scenario-basic-info.tsx`:

1. Add the lucide import at the top (after the existing imports):
```tsx
import { Lock } from 'lucide-react'
```

2. Replace the Algorithm Parameters button + dialog block (lines 370-399) with:

```tsx
<div className="flex flex-col gap-1 min-w-0">
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="scenario-parameters-open"
          className="flex h-7 w-full items-center gap-1.5 rounded border border-border bg-background px-2 text-xs text-foreground hover:bg-accent/60"
          onClick={() => setParametersOpen(true)}
        >
          {disabled && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="shrink-0">Algorithm Parameters</span>
          <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{parameterSummary}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-xs">{parameterSummary}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <ScenarioParametersDialog
    scenarioId={detail.id}
    scenarioDetail={detail}
    division={divisionValue}
    draftItems={parameterDraft}
    open={parametersOpen}
    disabled={disabled}
    onOpenChange={setParametersOpen}
    onDraftChange={updateParameterDraft}
    onLoaded={updateParameterSummary}
  />
</div>
```

The button is now always clickable (removed `disabled={disabled}` and `disabled:opacity-50`); `disabled &&` renders the lock icon in view-only mode; `gap-2` → `gap-1.5` per the §样式与排版标准 (text-xs row with a leading icon). The dialog keeps `disabled={disabled}`, which Task 1 turns into read-only mode.

- [ ] **Step 4: Run test to verify it passes**

Run (from `gantt/`):
```bash
npx vitest run src/components/scenario/__tests__/scenario-basic-info.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario/scenario-basic-info.tsx gantt/src/components/scenario/__tests__/scenario-basic-info.test.tsx
git commit -m "feat(gantt): open algorithm params read-only from locked scenarios

PUBLISHED/RUNNING scenarios keep the button enabled (lock icon) and open the
dialog in view-only mode.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 3: Backend — reject parameter writes for RUNNING/PUBLISHED

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts:597-626` (dedicated route guard) and `:655-675` (generic PUT guard)
- Test: Create `live-server/src/__tests__/unit/scenario-params-readonly-route.test.ts`

**Interfaces:**
- Consumes: existing `scenarioService.getById` (returns `status`), `scenarioService.update`, `scenarioParameterService.getMerged`/`saveValues`.
- Produces: both `PUT /:id/parameters` and `PUT /:id` (when body contains `algorithmParameters`) return 409 for RUNNING/PUBLISHED. Later tasks (help/e2e) only rely on the frontend result.

- [ ] **Step 1: Write the failing route tests**

Create `live-server/src/__tests__/unit/scenario-params-readonly-route.test.ts` (mirrors the harness in `scenario-patch-output-route.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

const scenarioServiceMocks = vi.hoisted(() => ({
  getById: vi.fn(async () => ({ id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED', taskId: null })),
  update: vi.fn(async () => ({ id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED' })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    getById: scenarioServiceMocks.getById,
    update: scenarioServiceMocks.update,
  },
}))

vi.mock('../../services/rule-check/acc-ref-tz-service.js', () => ({
  recalculateAccRefTz: vi.fn(async () => []),
}))

vi.mock('../../services/scenario/scenario-lock-service.js', () => ({
  scenarioLockService: {
    status: vi.fn(async () => ({ locked: true, isOwner: true, owner: 'planner' })),
  },
}))

vi.mock('../../services/scenario/scenario-patch-service.js', () => ({
  validateScenarioRosterPatches: vi.fn(async () => undefined),
  applyScenarioRosterPatches: vi.fn(async () => undefined),
  applyOutputPatch: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/legality-status.js', () => ({
  ensureLegality: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

const parameterMocks = vi.hoisted(() => ({
  getMerged: vi.fn(async () => ({ items: [], summary: { templateCount: 0, configuredCount: 0 } })),
  saveValues: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/scenario-parameter-service.js', () => ({
  scenarioParameterService: {
    getMerged: parameterMocks.getMerged,
    saveValues: parameterMocks.saveValues,
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', { execute: vi.fn(async () => ({ rows: [] })) } as never)
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never)
  app.decorate('redis', {} as never)
  app.decorate('mandayRecomputeQueue', { add: vi.fn(async () => undefined) } as never)
  app.decorate('scenarioKpiRecomputeQueue', { add: vi.fn(async () => undefined) } as never)
  app.decorate('wsBroadcast', vi.fn() as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'planner',
      userName: 'Planner',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(scenarioRoutes)
  return app
}

describe('scenario parameters readonly guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scenarioServiceMocks.getById.mockResolvedValue({
      id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED', taskId: null,
    })
  })

  it('rejects parameter edits on the dedicated route for PUBLISHED scenarios (409)', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702/parameters',
      payload: { items: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.statusCode).toBe(409)
    expect(parameterMocks.saveValues).not.toHaveBeenCalled()
  })

  it('rejects parameter edits on the generic update route for PUBLISHED scenarios (409)', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { name: 'R', algorithmParameters: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.statusCode).toBe(409)
    expect(scenarioServiceMocks.update).not.toHaveBeenCalled()
  })

  it('rejects parameter edits on the generic update route for RUNNING scenarios (409)', async () => {
    scenarioServiceMocks.getById.mockResolvedValue({
      id: 702, name: 'RO Scenario', fileType: 'RO', status: 'RUNNING', taskId: 't1',
    })
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { algorithmParameters: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.statusCode).toBe(409)
    expect(scenarioServiceMocks.update).not.toHaveBeenCalled()
  })

  it('still allows non-parameter updates for PUBLISHED scenarios through the generic route', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { comments: 'note' },
    })
    expect(res.statusCode).toBe(200)
    expect(scenarioServiceMocks.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `live-server/`):
```bash
npx vitest run src/__tests__/unit/scenario-params-readonly-route.test.ts
```
Expected: the PUBLISHED dedicated-route test and the generic-route 409 tests FAIL — the dedicated guard only checks RUNNING, and the generic route has no guard at all. The last test (`comments`) may PASS already.

- [ ] **Step 3: Implement the two guards**

In `live-server/src/routes/scenario/scenario.ts`:

1. Dedicated route — replace lines 608-610:
```ts
    if (sc.status === 'RUNNING' || sc.status === 'PUBLISHED') {
      return fail(reply, 409, 'Scenario parameters cannot be changed for a running or published scenario')
    }
```

2. Generic route — replace the body of `fastify.put('/:id', ...)` (lines 656-675) so it fetches the scenario and guards `algorithmParameters` before calling `scenarioService.update`:
```ts
    try {
      const sc = await scenarioService.getById(fastify, numId)
      if (!sc) {
        return fail(reply, 404, 'Scenario not found')
      }
      if (body.algorithmParameters !== undefined && (sc.status === 'RUNNING' || sc.status === 'PUBLISHED')) {
        return fail(reply, 409, 'Scenario parameters cannot be changed for a running or published scenario')
      }
      const result = await scenarioService.update(fastify, numId, body as never, username)
      if (!result) {
        return fail(reply, 404, 'Scenario not found')
      }
      return success(reply, result)
    } catch (err) {
      return error(reply, 500, (err as Error).message)
    }
```

`scenarioService.getById` already returns `status` (used by the dedicated parameters route at line 604). The generic route keeps the existing 404 fallback when `update` returns null.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `live-server/`):
```bash
npx vitest run src/__tests__/unit/scenario-params-readonly-route.test.ts
```
Expected: all four tests PASS.

Also run the existing scenario route/service suites to confirm no regression (the 409 message is not asserted anywhere, verified by grep):
```bash
npx vitest run src/__tests__/unit/scenario-patch-output-route.test.ts src/__tests__/services/scenario/scenario-service.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/unit/scenario-params-readonly-route.test.ts
git commit -m "feat(live-server): reject algorithm param writes for running/published scenarios

Extend the dedicated PUT /:id/parameters guard to PUBLISHED and add an
equivalent guard on the generic PUT /:id route used by the Scenario UI.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 4: Update the E2E regression test (Scen-2060)

**Files:**
- Modify: `e2e/tests/gantt/scenario-detail-toolbar.spec.ts:204-225`

**Interfaces:**
- Consumes: the UI from Tasks 1-2 (`scenario-parameters-open` enabled + read-only dialog) and the real backend.
- Produces: regression coverage that a PUBLISHED scenario's params are viewable but not editable.

- [ ] **Step 1: Update the stale assertion**

In the test `Scen-2060 — Published scenarios preserve their configuration snapshot`, replace the final block (line 219 onwards) after the status-badge assertion:

```ts
    const panel = scenario.detailPanel
    await expect(panel.getByTestId('scenario-status-badge')).toHaveText('Published')
    await expect(panel.getByTestId('scenario-run-btn')).toBeDisabled()
    await expect(panel.getByTestId('scenario-save-btn')).toBeDisabled()
    await expect(panel.getByTestId('scenario-name-input')).toBeDisabled()

    // Algorithm Parameters are view-only for a published scenario: the button
    // stays enabled, the dialog opens read-only, and no Save is triggered.
    const paramsButton = panel.getByTestId('scenario-parameters-open')
    await expect(paramsButton).toBeEnabled()
    await paramsButton.click()
    const paramsDialog = page.getByTestId('scenario-parameters-dialog')
    await expect(paramsDialog).toBeVisible()
    await expect(page.getByLabel('CA credit min hours')).toBeDisabled()
    await expect(paramsDialog.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
    await paramsDialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(paramsDialog).toBeHidden()
    await expect(panel.getByTestId('scenario-save-btn')).toBeDisabled()
```

- [ ] **Step 2: Run the test**

Run (from the repo root or `e2e/`):
```bash
npx playwright test e2e/tests/gantt/scenario-detail-toolbar.spec.ts --reporter=list
```
Expected: Scen-2060 PASSES with the new assertions. (Requires the live backend on `http://localhost:3000` as the suite's other tests already do.)

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-detail-toolbar.spec.ts
git commit -m "test(gantt): Scen-2060 asserts published scenario params open read-only

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Task 5: Help docs — note read-only behavior

**Files:**
- Modify: `gantt/src/components/help/topics/scenario/scenario-overview.tsx` (Algorithm Parameters section)
- Modify: `gantt/src/components/help/topics/scenario/scenario-create.tsx` (HelpTip)

**Interfaces:**
- Consumes: nothing.
- Produces: Help copy matches the new UI (Help Authoring rule — doc must match UI).

- [ ] **Step 1: Update `scenario-overview.tsx`**

In the `Algorithm Parameters` section (currently a single `<p>`), append a sentence:

```tsx
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        For RO and TO scenarios the Basic Info panel has an <strong>Algorithm Parameters</strong>{' '}
        button that shows <em>Using defaults</em> (or <em>Changed: …</em> once parameters differ
        from the defaults). It opens a dialog with tabs for Credit Range, Floor Rescue, Reserve
        Priority, Min Reserve Coverage %, Day Pressure Spread, Team Rules, and Crew Bid.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        While a scenario is <strong>Running</strong> or <strong>Published</strong> the dialog opens
        read-only: you can review every parameter but cannot change them.
      </p>
```

- [ ] **Step 2: Update `scenario-create.tsx`**

In the `HelpTip` after the tab list sentence, add:

```tsx
        Rules, and Crew Bid. Once a value differs from the default, the button label changes to{' '}
        <em>Changed: …</em>. For a <em>Running</em> or <em>Published</em> scenario the dialog opens
        read-only — parameters can be reviewed but not changed.
```

- [ ] **Step 3: Sanity-check the help render**

Run the gantt build to confirm the help topics compile:
```bash
npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/help/topics/scenario/scenario-overview.tsx gantt/src/components/help/topics/scenario/scenario-create.tsx
git commit -m "docs(gantt): note running/published scenarios open algorithm params read-only

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---
## Final Validation

- [ ] Run the two gantt unit suites:
  ```bash
  cd gantt && npx vitest run src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx src/components/scenario/__tests__/scenario-basic-info.test.tsx
  ```
  Expected: all PASS.
- [ ] Run the live-server route suite:
  ```bash
  cd live-server && npx vitest run src/__tests__/unit/scenario-params-readonly-route.test.ts
  ```
  Expected: all PASS.
- [ ] Run the UI-standard gate (required for frontend changes):
  ```bash
  npm run check:ui
  ```
  Expected: 0 hard violations — paste the PASS result.
- [ ] Run the updated E2E:
  ```bash
  npx playwright test e2e/tests/gantt/scenario-detail-toolbar.spec.ts --reporter=list
  ```
  Expected: Scen-2060 PASS.
