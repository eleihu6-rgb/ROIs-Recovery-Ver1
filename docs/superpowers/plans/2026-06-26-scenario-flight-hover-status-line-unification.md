# Scenario Flight Hover Status Line Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scenario Gantt Flight pane hover uses the same rich status-bar line as Live, with Scenario-derived composition fill.

**Architecture:** Keep the shared `SharedFlightPane` hover flow unchanged: it calls `flight.formatStatusLine` when a source adapter provides it. Add Scenario-only data derivation behind `scenario-gantt-source.ts`, converting loaded Scenario pairing composition `{ plan, fill }` into the existing `formatFlightStatusLine` `{ plan, actual }` input. Verify through a real Scenario canvas hover E2E.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Vitest, Playwright, Canvas 2D Gantt.

## Global Constraints

- Follow `§Gantt-Unify`: Live and Scenario share one user-facing code path wherever behavior is the same; source differences belong behind adapters.
- Do not call Live roster or Live flight composition endpoints from Scenario for this feature.
- Derive Scenario composition from loaded `ScenarioGanttData.pairings[].compositions` where `fill` is optimizer assignment fill.
- Use existing `formatFlightStatusLine`; do not create a second status-line formatter.
- Touch only `gantt` frontend runtime/tests and `gantt/src/version.ts`.
- Increment `FRONTEND_VERSION` by 1 because this changes Gantt runtime behavior.
- Run `cd gantt && npx tsc --noEmit`.
- Run the relevant Playwright test: `npx playwright test e2e/tests/gantt/scenario-selection.spec.ts`.

---

## File Structure

- Modify `gantt/src/components/gantt/source/scenario-gantt-source.ts`: add pure helpers for Scenario flight status-line data and wire `formatStatusLine` into `makeScenarioFlightPaneSource`.
- Modify `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`: unit-test Scenario flight composition aggregation and status-line output through the source adapter.
- Modify `e2e/tests/gantt/scenario-selection.spec.ts`: add a Scenario Flight pane hover regression using the existing mocked Scenario Gantt data.
- Modify `gantt/src/version.ts`: bump `FRONTEND_VERSION` from `343` to `344` and update the comment.

---

### Task 1: Add Scenario Source Unit Coverage

**Files:**
- Modify: `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`
- Later modifies: `gantt/src/components/gantt/source/scenario-gantt-source.ts`

**Interfaces:**
- Consumes existing `useScenarioGanttSource(scenarioId: number, rosterPaneId?: string): GanttPaneSource`.
- Requires implementation to export:
  - `buildScenarioFlightComposition(flightId: number, data: ScenarioGanttData): FlightComposition | undefined`
- Later tasks rely on this helper returning formatter-compatible `FlightComposition`.

- [ ] **Step 1: Add imports for the helper and fixture type**

At the top of `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`, change the source import and type import to:

```ts
import { buildScenarioFlightComposition, useScenarioGanttSource } from '../scenario-gantt-source'
import { useTimezoneStore } from '@/stores/timezone-store'
import type { ScenarioGanttData } from '@/types/scenario-gantt'
```

- [ ] **Step 2: Add a reusable Scenario data fixture**

After the existing imports in `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`, add:

```ts
const scenarioCapabilities = {
  panes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  defaultPanes: ['roster', 'pairing', 'flight'] as Array<'roster' | 'pairing' | 'flight'>,
  roster: { canAssign: true, canRemove: true, canReassign: true },
  pairing: { canEditSegments: false },
}

const makeScenarioData = (): ScenarioGanttData => ({
  scenarioId: 990100,
  scenarioName: 'Scenario flight hover unit',
  fileType: 'RO',
  capabilities: scenarioCapabilities,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot',
  crew: [],
  pairings: [
    {
      pairingId: 2000,
      pairingLabel: 'P2000',
      base: 'YEG',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      division: 'Pilots',
      compositions: [
        { rank: 'CA', plan: 1, fill: 1 },
        { rank: 'FO', plan: 1, fill: 0 },
      ],
    },
    {
      pairingId: 2001,
      pairingLabel: 'P2001',
      base: 'YEG',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      assignmentGroup: 'FLT',
      assignment: 'FLT',
      division: 'Pilots',
      compositions: [
        { rank: 'CA', plan: 1, fill: 0 },
        { rank: 'FA', plan: 2, fill: 1 },
      ],
    },
  ],
  assignments: [],
  pairingSegments: [
    {
      pairingId: 2000,
      dutySeq: 1,
      segSeq: 1,
      fltId: 6010,
      fltDt: '2026-03-02',
      fltNum: '2010',
      airline: 'F8',
      depArp: 'YEG',
      arvArp: 'YYZ',
      segAssignment: 'FLT',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutyStrArp: 'YEG',
      dutyEndArp: 'YYZ',
      dutySchStrDtUtc: '2026-03-02T08:00:00.000Z',
      dutySchEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: 480,
      brief1StartUtc: '2026-03-02T08:00:00.000Z',
      brief1EndUtc: '2026-03-02T08:00:00.000Z',
      debrief1StartUtc: '2026-03-02T16:00:00.000Z',
      debrief1EndUtc: '2026-03-02T16:00:00.000Z',
      pickup1StartUtc: '2026-03-02T08:00:00.000Z',
      pickup1EndUtc: '2026-03-02T08:00:00.000Z',
      dropoff1StartUtc: '2026-03-02T16:00:00.000Z',
      dropoff1EndUtc: '2026-03-02T16:00:00.000Z',
    },
    {
      pairingId: 2001,
      dutySeq: 1,
      segSeq: 1,
      fltId: 6010,
      fltDt: '2026-03-02',
      fltNum: '2010',
      airline: 'F8',
      depArp: 'YEG',
      arvArp: 'YYZ',
      segAssignment: 'FLT',
      schStrDtUtc: '2026-03-02T08:00:00.000Z',
      schEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutyStrArp: 'YEG',
      dutyEndArp: 'YYZ',
      dutySchStrDtUtc: '2026-03-02T08:00:00.000Z',
      dutySchEndDtUtc: '2026-03-02T16:00:00.000Z',
      dutySchRestMin: null,
      dutyActRestMin: null,
      dutyActCreditedMinutes: 480,
      brief1StartUtc: '2026-03-02T08:00:00.000Z',
      brief1EndUtc: '2026-03-02T08:00:00.000Z',
      debrief1StartUtc: '2026-03-02T16:00:00.000Z',
      debrief1EndUtc: '2026-03-02T16:00:00.000Z',
      pickup1StartUtc: '2026-03-02T08:00:00.000Z',
      pickup1EndUtc: '2026-03-02T08:00:00.000Z',
      dropoff1StartUtc: '2026-03-02T16:00:00.000Z',
      dropoff1EndUtc: '2026-03-02T16:00:00.000Z',
    },
  ],
  flights: [
    {
      id: 6010,
      fltNum: '2010',
      depArp: 'YEG',
      arvArp: 'YYZ',
      schDepDtUtc: '2026-03-02T08:00:00.000Z',
      schArvDtUtc: '2026-03-02T16:00:00.000Z',
      fleet: 'B737',
      register: 'C-FABC',
    },
  ],
  groundItems: [],
  crewStats: {},
})
```

- [ ] **Step 3: Add failing unit tests**

Inside the existing `describe('useScenarioGanttSource', () => { ... })`, append:

```ts
  it('buildScenarioFlightComposition aggregates scenario pairing plan/fill by rank for a flight', () => {
    const comp = buildScenarioFlightComposition(6010, makeScenarioData())

    expect(comp).toEqual({
      CA: { plan: 2, actual: 1 },
      FO: { plan: 1, actual: 0 },
      FA: { plan: 2, actual: 1 },
    })
  })

  it('scenario flight source formats hover status with scenario-derived composition fill', () => {
    const id = 990101
    getScenarioGanttStore(id).setState({ data: makeScenarioData() })
    useTimezoneStore.setState({ timezone: 'UTC', timezoneAirport: 'UTC' })

    const container = document.createElement('div')
    document.body.appendChild(container)

    let line = ''
    const Probe = () => {
      const src = useScenarioGanttSource(id)
      line = src.flight?.formatStatusLine?.(6010) ?? ''
      return null
    }

    act(() => {
      createRoot(container).render(React.createElement(Probe))
    })

    expect(line).toContain('2010')
    expect(line).toContain('YEG 3/2 08:00')
    expect(line).toContain('YYZ 3/2 16:00')
    expect(line).toContain('B737')
    expect(line).toContain('C-FABC')
    expect(line).toContain('CA 2/1')
    expect(line).toContain('FO 1/0')
    expect(line).toContain('FA 2/1')
    document.body.removeChild(container)
  })
```

- [ ] **Step 4: Run the unit tests and verify they fail**

Run:

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
```

Expected: FAIL because `buildScenarioFlightComposition` is not exported and Scenario `flight.formatStatusLine` is undefined.

- [ ] **Step 5: Commit the failing tests**

```bash
git add gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
git commit -m "test: cover scenario flight hover status composition"
```

---

### Task 2: Implement Scenario Flight Status-Line Capability

**Files:**
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Test: `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`

**Interfaces:**
- Produces:
  - `buildScenarioFlightComposition(flightId: number, data: ScenarioGanttData): FlightComposition | undefined`
  - Scenario `FlightPaneSource.formatStatusLine(flightId: number): string`
- Consumes:
  - `formatFlightStatusLine(args: FlightStatusLineArgs): string`
  - `useAirportTzStore.getState().zoneIdFor(airport: string): string | undefined`
  - `useTimezoneStore.getState().timezone`

- [ ] **Step 1: Add imports**

In `gantt/src/components/gantt/source/scenario-gantt-source.ts`, add:

```ts
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
```

Change the flight type import from:

```ts
import type { FlightItem, Flight, FlightCompositionStatus } from '@/types/flight'
```

to:

```ts
import type { FlightItem, Flight, FlightComposition, FlightCompositionStatus } from '@/types/flight'
```

Change the Scenario type import from:

```ts
  ScenarioGanttAssignment,
  ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'
```

so it includes `ScenarioGanttData`.

The final Scenario type import block should include:

```ts
  ScenarioGanttAssignment,
  ScenarioGanttData,
  ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'
```

- [ ] **Step 2: Extract the Scenario flight conversion helper**

Above `buildScenarioFlightItems`, add:

```ts
const scenarioFlightToFlight = (f: ScenarioGanttFlight): Flight => ({
  id: f.id,
  airline: '',
  fltDt: '',
  fltNum: f.fltNum,
  depArp: f.depArp,
  arvArp: f.arvArp,
  schDepDtUtc: f.schDepDtUtc,
  schArvDtUtc: f.schArvDtUtc,
  actDepDtUtc: f.schDepDtUtc,
  actArvDtUtc: f.schArvDtUtc,
  actDepArp: f.depArp,
  actArvArp: f.arvArp,
  flightFlag: 'S',
  blkMin: 0,
  fleet: f.fleet,
  register: f.register,
  fltType: 'PAX',
  fltSts: null,
  isDeleted: 0,
  isCancelled: false,
})
```

Then delete the nested `toFlight` function inside `buildScenarioFlightItems` and change:

```ts
flights: groupFlights.sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc)).map(toFlight),
```

to:

```ts
flights: groupFlights.sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc)).map(scenarioFlightToFlight),
```

- [ ] **Step 3: Add the composition aggregation helper**

Below `buildScenarioFlightItems`, add:

```ts
export function buildScenarioFlightComposition(
  flightId: number,
  data: ScenarioGanttData,
): FlightComposition | undefined {
  const pairingIds = new Set(
    data.pairingSegments
      .filter((segment) => segment.fltId === flightId)
      .map((segment) => segment.pairingId),
  )
  if (pairingIds.size === 0) return undefined

  const byRank: FlightComposition = {}
  for (const pairing of data.pairings) {
    if (!pairingIds.has(pairing.pairingId)) continue
    for (const slot of pairing.compositions) {
      const rank = slot.rank
      if (!rank) continue
      const current = byRank[rank] ?? { plan: 0, actual: 0 }
      byRank[rank] = {
        plan: current.plan + slot.plan,
        actual: current.actual + slot.fill,
      }
    }
  }

  return Object.keys(byRank).length > 0 ? byRank : undefined
}
```

- [ ] **Step 4: Wire Scenario `formatStatusLine`**

Inside `makeScenarioFlightPaneSource`, after `getRangeStart`, add:

```ts
    formatStatusLine: (flightId) => {
      const data = getScenarioGanttStore(scenarioId).getState().data
      const scenarioFlight = data?.flights.find((flight) => flight.id === flightId)
      if (!data || !scenarioFlight) return ''

      const flight = scenarioFlightToFlight(scenarioFlight)
      const tzStore = useAirportTzStore.getState()
      const ganttZoneId = useTimezoneStore.getState().timezone

      return formatFlightStatusLine({
        flight,
        ganttZoneId,
        depLocalZoneId: tzStore.zoneIdFor(flight.depArp),
        arvLocalZoneId: tzStore.zoneIdFor(flight.arvArp),
        composition: buildScenarioFlightComposition(flightId, data),
      })
    },
```

The block should be a sibling of `getRangeStart`, `startDragToRoster`, and `loadMore` in the returned `FlightPaneSource`.

- [ ] **Step 5: Run unit tests and verify they pass**

Run:

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
```

Expected: PASS for all tests in the file.

- [ ] **Step 6: Commit implementation**

```bash
git add gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
git commit -m "fix: format scenario flight hover status line"
```

---

### Task 3: Add Real Scenario Flight Hover E2E

**Files:**
- Modify: `e2e/tests/gantt/scenario-selection.spec.ts`
- Test: `e2e/tests/gantt/scenario-selection.spec.ts`

**Interfaces:**
- Consumes existing `window.__ganttTest.scenarioFlightPuck(scenarioId, flightId?)`.
- Consumes existing `scenario-status-bar-text` and `scenario-flight-canvas` test ids.
- Produces a regression test proving Scenario canvas hover writes the Live-style rich line.

- [ ] **Step 1: Change fixture composition to prove Scenario fill**

In `e2e/tests/gantt/scenario-selection.spec.ts`, change `MOCK_PAIRING.compositions` from:

```ts
  compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
```

to:

```ts
  compositions: [
    { rank: 'CA', plan: 1, fill: 1 },
    { rank: 'FO', plan: 1, fill: 0 },
  ],
```

- [ ] **Step 2: Add a flight-puck reader**

After `readPairingPuck`, add:

```ts
const readFlightPuck = (
  page: Page,
  wantFlightId?: number,
): Promise<{ x: number; y: number; flightId: number; fltNum: string } | null> =>
  page.evaluate(
    ({ sid, fid }) => window.__ganttTest!.scenarioFlightPuck!(sid, fid) ?? null,
    { sid: RO_SCENARIO_ID, fid: wantFlightId },
  )
```

- [ ] **Step 3: Generalize hover movement to accept a canvas test id**

Replace the existing `hoverMove` helper with:

```ts
/** Hover: dispatch a REAL mousemove (button 0) at the canvas coordinate. */
const hoverMove = async (
  page: Page,
  canvasTestId: 'scenario-pairing-canvas' | 'scenario-flight-canvas',
  x: number,
  y: number,
): Promise<void> => {
  const canvas = page.getByTestId(canvasTestId)
  const box = await canvas.boundingBox()
  expect(box, `${canvasTestId} must have a bounding box`).toBeTruthy()
  const clientX = box!.x + x
  const clientY = box!.y + y
  await page.evaluate(
    ({ testId, cx, cy }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLCanvasElement | null
      if (!el) throw new Error(`${testId} not found`)
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }))
    },
    { testId: canvasTestId, cx: clientX, cy: clientY },
  )
}
```

- [ ] **Step 4: Update the existing pairing hover call**

In test `Scen-2060`, change:

```ts
await hoverMove(page, puck!.x, puck!.y)
```

to:

```ts
await hoverMove(page, 'scenario-pairing-canvas', puck!.x, puck!.y)
```

- [ ] **Step 5: Add the Scenario flight hover test**

After test `Scen-2060`, add:

```ts
  test('Scen-2061 — scenario flight hover mirrors Live status line with scenario composition fill', async ({ page }) => {
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/gantt-data`, (route) => route.fulfill(ok(MOCK_GANTT_DATA)))
    await page.route(`**/api/scenario/${RO_SCENARIO_ID}/lock-status`, (route) => route.fulfill(ok(MOCK_LOCK_STATUS)))

    await openRoScenario(page)

    await page.getByTestId('sg-add-pane-flight').click()
    await expect(page.getByTestId('scenario-flight-canvas')).toBeVisible({ timeout: 10_000 })

    await expect
      .poll(() => readFlightPuck(page, MOCK_FLIGHT.id), { timeout: 15_000, message: 'no scenario flight puck rendered' })
      .not.toBeNull()
    const puck = await readFlightPuck(page, MOCK_FLIGHT.id)
    expect(puck, 'flight puck probe must resolve').toBeTruthy()

    await hoverMove(page, 'scenario-flight-canvas', puck!.x, puck!.y)

    const statusText = page.getByTestId('scenario-status-bar-text')
    await expect
      .poll(async () => (await statusText.textContent()) ?? '', {
        timeout: 5_000,
        message: 'status bar should show rich scenario flight hover info',
      })
      .toMatch(/2010 · YEG \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L → YYZ \d{1,2}\/\d{1,2} \d{2}:\d{2} \/ (?:\d{1,2}\/\d{1,2} )?\d{2}:\d{2}L · B737 · C-FABC · CA 1\/1\s+FO 1\/0/)
  })
```

- [ ] **Step 6: Run the Scenario E2E**

Run from repo root:

```bash
npx playwright test e2e/tests/gantt/scenario-selection.spec.ts
```

Expected: PASS, including `Scen-2061`.

- [ ] **Step 7: Commit E2E coverage**

```bash
git add e2e/tests/gantt/scenario-selection.spec.ts
git commit -m "test: verify scenario flight hover status line"
```

---

### Task 4: Version Bump and Full Verification

**Files:**
- Modify: `gantt/src/version.ts`

**Interfaces:**
- Produces `FRONTEND_VERSION = 344`.
- No API or runtime interface changes beyond the Scenario hover behavior.

- [ ] **Step 1: Bump frontend version**

In `gantt/src/version.ts`, change:

```ts
export const FRONTEND_VERSION = 343  // live ground task dialog: show persisted ground-duty credit in edit mode
```

to:

```ts
export const FRONTEND_VERSION = 344  // scenario flight hover: mirror Live rich status line with scenario-derived composition fill
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
cd gantt && npx tsc --noEmit
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 3: Run focused unit test**

Run:

```bash
cd gantt && npx vitest run src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run focused Playwright test**

Run from repo root:

```bash
npx playwright test e2e/tests/gantt/scenario-selection.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Check touched diff only**

Run:

```bash
git diff -- gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts e2e/tests/gantt/scenario-selection.spec.ts gantt/src/version.ts
```

Expected: diff includes only the Scenario flight status helper/source wiring, Scenario hover tests, and the frontend version bump.

- [ ] **Step 6: Commit version and verification-ready state**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump frontend version for scenario flight hover"
```
