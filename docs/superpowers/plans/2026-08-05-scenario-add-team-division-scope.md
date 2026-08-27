# Scenario Add Team Division Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Scenario Team Rules derive Division from the Scenario workset, remove the duplicated Team `crew_filter.division`, and keep Rank/Base candidates available from Scenario scope or reference data.

**Architecture:** Keep the change in the existing `TeamRulesEditor` component chain. `TeamRulesEditor` supplies raw `scenarioDetail.division` for display and Scenario-scoped Rank/Base candidate arrays; `TeamEditor` and `CrewFilterPanel` consume those props without adding a new store or API. Existing preview rows remain the source for matching, while the Team JSON is normalized without Division.

**Tech Stack:** React 19, TypeScript, `@rois/ui`, Zustand reference store hooks, Vitest, Playwright.

---

## File Map

- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx`
  - Remove Division from the Team filter JSON normalizer and matching predicate.
  - Add raw Scenario Division and Rank/Base option props to the Team editor chain.
  - Use Scenario-selected Rank/Base values first, then reference-store fallbacks.
  - Render Division as a read-only `Input`.
- Create: `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`
  - Render the real `TeamRulesEditor` with mocked preview/reference data.
  - Cover legacy conflicting Division data, save normalization, and non-empty candidates
    when preview rows are empty.
- Modify: `e2e/tests/gantt/scenario-parameters.spec.ts`
  - Add a real Scenario UI regression for Team Rules -> Add Team.
- Create: `docs/superpowers/specs/2026-08-05-scenario-add-team-division-scope-design.md`
  - Already completed and committed; this plan implements that approved design.

## Task 1: Add focused component regression tests

**Files:**
- Create: `gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx`

- [ ] **Step 1: Add the failing test fixture and assertions**

Mock only the external UI/API boundaries needed to render `TeamRulesEditor`:

```tsx
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { TeamRulesEditor } from '../scenario-parameter-editors'

const getGanttData = vi.fn(async () => ({
  crew: [],
  pairings: [],
  pairingSegments: [],
  scenarioStrDt: '2026-06-01',
  strDtLoc: '2026-06-01',
  scenarioEndDt: '2026-06-30',
  endDtLoc: '2026-06-30',
}))

const loadReferences = vi.fn(async () => undefined)

vi.mock('@/services/scenario-gantt-api', () => ({ scenarioGanttApi: { getGanttData } }))
vi.mock('@/stores/reference-store', () => ({
  useReferenceStore: (selector: (state: unknown) => unknown) => selector({
    bases: [],
    ranks: [],
    loading: false,
    load: loadReferences,
  }),
}))
vi.mock('@/components/common/gantt-date-fields', () => ({
  GanttEnglishDatePicker: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => (
    <input aria-label={ariaLabel} value={value} readOnly />
  ),
}))
vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h1>{title}</h1>{children}</div> : null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

const detail = {
  id: 42,
  name: 'Pilot Scenario',
  fileType: 'RO',
  status: 'DRAFT',
  strDtLoc: '2026-06-01',
  endDtLoc: '2026-06-30',
  division: 'P',
  filterParams: {
    crew: { bases: ['YEG'], ranks: ['CA'], fleets: [], seniority: { min: null, max: null }, birthday: { from: '', to: '' }, status: 'ACTIVE' },
    pairing: { bases: [], fleets: [], ranks: [], types: [], duration: { min: null, max: null } },
  },
} as never

it('uses Scenario Division and scope candidates instead of legacy Team Division or preview rows', async () => {
  const onChange = vi.fn()
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <TeamRulesEditor
        value={{
          teams: [{ id: 't1', name: 'Legacy', crew_filter: { ranks: [], base: '', division: 'C' } }],
          rules: [],
        }}
        scenarioDetail={detail}
        disabled={false}
        saving={false}
        onChange={onChange}
      />,
    )
  })

  await act(async () => { await Promise.resolve() })
  const edit = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Edit')
  await act(async () => { edit?.click() })

  const division = container.querySelector<HTMLInputElement>('[data-testid="scenario-team-division"]')
  expect(division?.value).toBe('P')
  expect(division?.readOnly).toBe(true)
  expect(container.textContent).toContain('CA')
  expect(container.querySelector('option[value="YEG"]')).not.toBeNull()

  const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Done')
  await act(async () => { done?.click() })
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    teams: [expect.objectContaining({ crew_filter: expect.not.objectContaining({ division: expect.anything() }) })],
  }))
  root.unmount()
})
```

The test intentionally returns no `crew` rows. The Scenario-selected `bases` and
`ranks` must still produce the Base option and Rank checkbox, while the conflicting
legacy `division: 'C'` must not control the preview or saved JSON.

- [ ] **Step 2: Run the focused test and verify the current implementation fails**

Run:

```bash
cd gantt
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```

Expected: FAIL because `TeamRulesEditor` does not yet expose Scenario Division,
does not render the `scenario-team-division` input, and still derives candidates
only from preview rows.

## Task 2: Implement Scenario-owned Division and candidate sourcing

**Files:**
- Modify: `gantt/src/components/scenario/scenario-parameter-editors.tsx:1-170,263-430,492-686`

- [ ] **Step 1: Add reference option hooks and remove Division from Team JSON normalization**

Import the existing hooks:

```tsx
import { useBaseOptions } from './filter/use-base-options'
import { useRankOptions } from './filter/use-rank-options'
```

Change `blankTeam` and `cleanCrewFilter` so the Team JSON contains only search,
rank, base, seniority, and birthday fields. Remove the `division` property from
`cleanCrewFilter` and remove the `filter.division` branch from
`crewMatchesTeamFilter`. This causes legacy `crew_filter.division` values to be
ignored and omitted by every normalized value.

- [ ] **Step 2: Pass explicit candidate arrays and raw Scenario Division through the editor chain**

Update the local prop contracts as follows:

```tsx
interface CrewFilterPanelProps {
  filter: JsonRecord
  rows: CrewPreviewRow[]
  division: string
  rankOptions: string[]
  baseOptions: string[]
  onChange: (filter: JsonRecord) => void
}

interface TeamEditorProps {
  team: JsonRecord
  crews: CrewPreviewRow[]
  division: string
  rankOptions: string[]
  baseOptions: string[]
  onCancel: () => void
  onSave: (team: JsonRecord) => void
}
```

In `TeamRulesEditor`, keep `filters.division` for the existing normalized
Scenario preview filtering, but derive the display value without fallback:

```tsx
const scenarioDivision = stringValue(scenarioDetail?.division).trim()
const { options: referenceBaseOptions } = useBaseOptions()
const { options: referenceRankOptions } = useRankOptions(filters.division)
const baseOptions = useMemo(
  () => filters.crew.bases.length > 0
    ? uniqueSorted(filters.crew.bases)
    : uniqueSorted(referenceBaseOptions.map((option) => option.value)),
  [filters.crew.bases, referenceBaseOptions],
)
const rankOptions = useMemo(
  () => filters.crew.ranks.length > 0
    ? uniqueSorted(filters.crew.ranks)
    : uniqueSorted(referenceRankOptions.map((option) => option.value)),
  [filters.crew.ranks, referenceRankOptions],
)
```

Pass all three values to `TeamEditor`. Keep `filters.division` in
`crewMatchesScenarioFilter`; it is the existing scope filter and is separate from
the Team JSON field being removed.

- [ ] **Step 3: Render read-only Division and preserve normalized filter behavior**

In `CrewFilterPanel`, use `rankOptions` and `baseOptions` instead of mapping
`rows` for candidate controls. Replace the Division `FilterSelect` with:

```tsx
<label className="flex flex-col gap-1">
  <span className="text-muted-foreground">Division</span>
  <Input
    aria-label="Team Division"
    data-testid="scenario-team-division"
    className="h-7 text-xs"
    value={division}
    readOnly
  />
</label>
```

Keep Clear, Rank, Base, search, seniority, and birthday behavior unchanged except
that Clear now produces `emptyCrewFilter()` without a Division key. The Team
preview should continue to call `crewMatchesTeamFilter` against Scenario-scoped
`crews`, so no separate Division comparison is added.

- [ ] **Step 4: Run the focused Vitest regression**

Run:

```bash
cd gantt
npx vitest run src/components/scenario/__tests__/scenario-parameter-editors.test.tsx
```

Expected: PASS, including the empty-preview-row and legacy-conflict assertions.

## Task 3: Add real UI Playwright coverage

**Files:**
- Modify: `e2e/tests/gantt/scenario-parameters.spec.ts`

- [ ] **Step 1: Add the Add Team workflow regression**

After the existing parameter dialog assertions, add a test that creates the same
RO Scenario through `ScenarioPage`, opens `scenario-parameters-open`, selects the
`Team Rules` tab, and opens `+ Add Team`. Assert the real UI behavior:

```ts
await page.getByRole('button', { name: 'Team Rules', exact: true }).click()
await page.getByRole('button', { name: '+ Add Team', exact: true }).click()

const division = page.getByTestId('scenario-team-division')
await expect(division).toHaveValue('P')
await expect(division).toHaveAttribute('readonly', '')
await expect(page.getByRole('option', { name: 'YEG', exact: true })).toBeVisible()
await expect(page.getByText('CA', { exact: true })).toBeVisible()
await expect(page.getByText('FO', { exact: true })).toBeVisible()

await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
```

Use the existing `input` fixture and `afterEach` cleanup in the spec. The test
must drive the actual scenario detail, parameter dialog, Team Rules editor, and
Add Team dialog; it must not call component functions or inspect an internal store.

- [ ] **Step 2: Run the focused Playwright test**

Run from the repository root:

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-parameters.spec.ts --reporter=list
```

Expected: PASS for the existing parameter round-trip and the new Add Team
Division/candidate regression. If the remote Gantt API is unavailable, report the
exact endpoint failure rather than replacing this with a non-UI assertion.

## Task 4: Broad validation and delivery checks

**Files:**
- Modify: none beyond the files listed above.

- [ ] **Step 1: Run Gantt TypeScript validation**

```bash
cd gantt
npx tsc --noEmit
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 2: Run the UI standard gate**

```bash
npm run check:ui
```

Expected: PASS with zero hard violations.

- [ ] **Step 3: Review the final change scope**

```bash
git diff --check
git status --short
git diff -- gantt/src/components/scenario/scenario-parameter-editors.tsx gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx e2e/tests/gantt/scenario-parameters.spec.ts
node .gitnexus/run.cjs detect_changes
```

Expected: only the Scenario Team Rules editor and its focused tests are changed by
this task; unrelated existing worktree changes remain untouched. GitNexus should
report LOW risk for the changed Scenario symbols.

- [ ] **Step 4: Commit only this task's files**

```bash
git add gantt/src/components/scenario/scenario-parameter-editors.tsx \
  gantt/src/components/scenario/__tests__/scenario-parameter-editors.test.tsx \
  e2e/tests/gantt/scenario-parameters.spec.ts
git commit -m "fix: scope scenario team division to workset"
```

Do not stage or revert the unrelated files already present in the worktree.
