# Schedule Details Pairing Aggregation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse per-segment Pairing rows in the Schedule Details dialog into one row per pairing (Live + Scenario): Start/End = pairing bounds, Credit = Σ distinct-duty credits, Label = `pairing_label`, Pairing column = `id · interface_id` (or `id` when interface_id is null).

**Architecture:** The aggregation lives in `scheduleRowsForCrew` (`gantt/src/utils/schedule-details.ts`) — the single function both Live and Scenario dialogs use to build rows. It groups items with `pairingId != null` by `pairingId` into one row each; standalone (DO/ground) items pass through unchanged. `interface_id` is threaded from the `pairing` table into `RosterItem.pairingInterfaceId` via the Live roster DTO and the Scenario gantt-data path.

**Tech Stack:** TypeScript (gantt + live-server), Drizzle ORM (live-server), Vitest (unit), Playwright (e2e).

## Global Constraints

- TypeScript: camelCase identifiers, no `any`, all params/returns typed, `async/await` only. Database columns stay `snake_case`.
- Frontend UI strings are English only.
- §Minimal-First / §Surgical: touch only what each task needs; no speculative abstraction.
- §Testing-Discipline: every behavior change ships with a test. Run `npm run check:ui` after frontend changes and paste the result.
- Do not modify `sql/schema/*.sql` schema scripts.
- `scheduleRowsForCrew` keeps the existing fallback credit chain per item: `dutyActCreditedMinutes ?? actCreditedMinutes ?? schCreditedMinutes`.

---

### Task 1: Add `pairingInterfaceId` to the RosterItem frontend type

**Files:**
- Modify: `gantt/src/types/roster.ts` (RosterItem interface, near `pairingLabel` at line 6)

**Interfaces:**
- Produces: `RosterItem.pairingInterfaceId?: string | null` — consumed by `pairingCell()` in Task 4 and the roster hook in Task 5.

- [ ] **Step 1: Add the field**

```ts
export interface RosterItem {
  id: number
  crewId: string
  pairingId: number | null
  pairingLabel?: string | null
  pairingInterfaceId?: string | null
  ...
```

- [ ] **Step 2: Verify the type still compiles**

Run: `cd gantt && npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/roster.ts
git commit -m "feat(gantt): add pairingInterfaceId to RosterItem type"
```

---

### Task 2: Thread `interface_id` through the Live roster DTO

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts` (getView select ~line 193; DTO map ~line 244)

**Interfaces:**
- Consumes: `pairingTable` (already LEFT JOINed in `getView` for `pairingLabel`).
- Produces: `RosterItem.pairingInterfaceId` populated on every `/api/roster` row; only non-null when `pairingId != null`.

- [ ] **Step 1: Add the select field**

In `getView`'s `.select({...})`, right after `pairingLabel: pairingTable.pairingLabel,` (line 193) add:

```ts
pairingInterfaceId: pairingTable.interfaceId,
```

- [ ] **Step 2: Map it into the DTO**

In the DTO map (`rows.map((row) => ...)`, right after the `pairingLabel:` line at 244) add:

```ts
pairingInterfaceId: roster.pairingId != null ? dutyFields.pairingInterfaceId ?? null : null,
```

- [ ] **Step 3: Type-check + run live-server unit tests**

Run: `cd live-server && npx tsc -b`
Run: `npx vitest run src/services/roster`
Expected: tsc exit 0; roster tests PASS.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/roster/roster-service.ts
git commit -m "feat(live-server): expose pairing.interface_id on roster DTO"
```

---

### Task 3: Thread `interface_id` through the Scenario gantt-data path

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts` (`ScenarioGanttPairing`, add `interfaceId`)
- Modify: `live-server/src/services/scenario/scenario-gantt-db-service.ts` (pairing select ~line 327 + map ~line 354)
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts` (`loadPairingRows` select ~line 1121 + map at ~line 1130)
- Modify: `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts` (whole-pairing item ~line 114, segment item ~line 147)

**Interfaces:**
- Produces: `ScenarioGanttPairing.interfaceId?: string | null`; `RosterItem.pairingInterfaceId` set on scenario-built items from `pairing.interfaceId`.

- [ ] **Step 1: Add the scenario type field**

In `gantt/src/types/scenario-gantt.ts`, in `ScenarioGanttPairing` after `pairingLabel` add:

```ts
interfaceId?: string | null
```

- [ ] **Step 2: `scenario-gantt-db-service.ts` — select + map**

In the pairing select (~line 327), add `interface_id,` to the `SELECT id, pairing_label, base, fleet, ...` list (the row type gets `interface_id: string | null`).

In the mapping (`pairRes.rows.map((row) => ...)`, ~line 354) add:

```ts
interfaceId: row.interface_id ?? null,
```

- [ ] **Step 3: `scenario-gantt-service.ts` — select + map**

In `loadPairingRows` (the `SELECT id, pairing_label, base, fleet, ...` at ~line 1121) add `interface_id,` to the select, and add `interface_id: string | null` to the row type. The `return res.rows.map((row) => ({ ...row, source }))` already forwards the new column.

- [ ] **Step 4: `build-scenario-roster-items.ts` — set on items**

In the whole-pairing item (after `pairingLabel: pairing.pairingLabel,` ~line 119) and the segment item (after `pairingLabel: pairing.pairingLabel,` ~line 153) add:

```ts
pairingInterfaceId: pairing.interfaceId ?? null,
```

- [ ] **Step 5: Type-check both packages + run scenario service tests**

Run: `cd live-server && npx tsc -b && npx vitest run src/services/scenario/scenario-gantt-db-service.test.ts`
Run: `cd gantt && npx tsc -b`
Expected: tsc exit 0; scenario test PASS.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts \
  live-server/src/services/scenario/scenario-gantt-db-service.ts \
  live-server/src/services/scenario/scenario-gantt-service.ts \
  gantt/src/components/scenario-gantt/build-scenario-roster-items.ts
git commit -m "feat(scenario): thread pairing interface_id through gantt-data"
```

---

### Task 4: Aggregate pairings into one row in `scheduleRowsForCrew` (TDD)

**Files:**
- Modify: `gantt/src/utils/schedule-details.ts` (`scheduleRowsForCrew` + small helpers)
- Test: `gantt/src/utils/__tests__/schedule-details.test.ts`

**Interfaces:**
- Consumes: `RosterItem.pairingInterfaceId` (Task 1), `formatScheduleDateTime`, `formatScheduleMinutes`, `normalizeUtcIso`, `scheduleTypeForItem`, `scheduleLabelForItem` (already in the module).
- Produces: `ScheduleDetailRow` unchanged shape; pairing rows now aggregated.

- [ ] **Step 1: Write the failing aggregation tests**

Add to `schedule-details.test.ts` (inside the existing describe block). The base `item()` helper sets `pairingId: 200`, `label: 'F8001 YOW-YVR'`, `schStrDtUtc: '2026-07-10T12:00:00Z'` — override as shown.

```ts
it('groups a multi-duty pairing into one row with bounds, summed duty credit and interface id', () => {
  const pairingItems = [
    item({ id: 11, pairingId: 500, pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 1, segSeq: 1, schStrDtUtc: '2026-07-28T12:00:00Z', schEndDtUtc: '2026-07-28T16:00:00Z', dutyActCreditedMinutes: '300' }),
    item({ id: 12, pairingId: 500, pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 1, segSeq: 2, schStrDtUtc: '2026-07-28T17:00:00Z', schEndDtUtc: '2026-07-28T19:00:00Z', dutyActCreditedMinutes: '300' }),
    item({ id: 13, pairingId: 500, pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 2, segSeq: 1, schStrDtUtc: '2026-07-29T09:00:00Z', schEndDtUtc: '2026-07-29T13:00:00Z', dutyActCreditedMinutes: '240' }),
  ]
  const rows = scheduleRowsForCrew(pairingItems, '101', rp, 'UTC')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    type: 'Pairing',
    credit: '9:00', // 300 + 240; the 2-segment duty counts once
    label: '500 YVR-YUL · V100',
    pairing: '500 · IF500',
  })
  expect(rows[0].start).toMatch(/^2026-07-28/)
  expect(rows[0].end).toMatch(/^2026-07-29/)
})

it('shows just the pairing id when interface id is missing', () => {
  const rows = scheduleRowsForCrew([
    item({ id: 21, pairingId: 600, pairingLabel: '600 YUL-YVR · V200', pairingInterfaceId: null, dutySeq: 1, schStrDtUtc: '2026-07-20T10:00:00Z', schEndDtUtc: '2026-07-20T14:00:00Z', dutyActCreditedMinutes: '120' }),
  ], '101', rp, 'UTC')
  expect(rows).toHaveLength(1)
  expect(rows[0].pairing).toBe('600')
})

it('interleaves merged pairing rows with standalone rows chronologically', () => {
  const rows = scheduleRowsForCrew([
    item({ id: 31, pairingId: null, label: 'DO', schStrDtUtc: '2026-07-25T00:00:00Z', schEndDtUtc: '2026-07-25T23:59:59Z' }),
    item({ id: 32, pairingId: 700, pairingLabel: '700 YVR-YUL · V300', dutySeq: 1, segSeq: 1, schStrDtUtc: '2026-07-28T12:00:00Z', schEndDtUtc: '2026-07-28T16:00:00Z', dutyActCreditedMinutes: '300' }),
    item({ id: 33, pairingId: 700, pairingLabel: '700 YVR-YUL · V300', dutySeq: 2, segSeq: 1, schStrDtUtc: '2026-07-29T09:00:00Z', schEndDtUtc: '2026-07-29T13:00:00Z', dutyActCreditedMinutes: '240' }),
  ], '101', rp, 'UTC')
  expect(rows.map((row) => row.type)).toEqual(['DO', 'Pairing'])
  expect(rows).toHaveLength(2)
})
```

- [ ] **Step 2: Run the tests — verify the three new tests FAIL**

Run: `cd gantt && npx vitest run src/utils/__tests__/schedule-details.test.ts`
Expected: new tests fail (rows are not grouped yet — e.g. `toHaveLength(1)` gets 3).

- [ ] **Step 3: Update the two existing tests that the base helper's `pairingId: 200` now breaks**

In `builds sorted crew rows with duty credit fallback first`, change item `id: 2` to a distinct pairing so the two crew-101 items stay separate rows:

```ts
item({ id: 2, pairingId: 201, crewId: '101', schStrDtUtc: '2026-07-12T12:00:00Z', dutyActCreditedMinutes: '180' }),
```

In `dedups the same task when it is in both the pane roster and the RP fetch`, add `pairingId: null` to all four `item(...)` calls (they only test dedup of standalone rows, not pairing grouping).

- [ ] **Step 4: Implement the aggregation**

In `gantt/src/utils/schedule-details.ts`, replace `scheduleRowsForCrew` and add these helpers just above it:

```ts
/** Minutes of a single item's credit, duty-level source first (matches per-row display). */
const dutyCreditMinutes = (item: RosterItem): number => {
  const raw = item.dutyActCreditedMinutes ?? item.actCreditedMinutes ?? item.schCreditedMinutes
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : 0
}

const utcMs = (utc: string | null | undefined): number => (utc ? new Date(normalizeUtcIso(utc)).getTime() : NaN)

/** "id · interfaceId" for a pairing row, or "-" for standalone rows. */
const pairingCell = (item: RosterItem): string => {
  if (item.pairingId == null) return '-'
  return item.pairingInterfaceId ? `${item.pairingId} · ${item.pairingInterfaceId}` : String(item.pairingId)
}

/** Internal draft row used while grouping pairing items. */
interface ScheduleRowDraft {
  id: number
  type: string
  startUtc: string | null
  endUtc: string | null
  creditMinutes: number
  label: string
  pairing: string
  source: string
  duties: Set<string>
}

export const scheduleRowsForCrew = (
  items: readonly RosterItem[],
  crewId: string,
  rp: RosterPeriodOption | null,
  zoneId: string,
): ScheduleDetailRow[] => {
  const inScope = items.filter(
    (item) => item.id > 0 && item.crewId === crewId && rosterItemStartsInRp(item, rp, zoneId),
  )

  // Group pairing items into ONE row per pairing; standalone (DO/ground) items stay as rows.
  const pairingByPid = new Map<number, ScheduleRowDraft>()
  const singles: ScheduleRowDraft[] = []

  for (const item of inScope) {
    if (item.pairingId != null) {
      const dutyKey = `${item.pairingId}:${item.dutySeq ?? ''}`
      const existing = pairingByPid.get(item.pairingId)
      if (!existing) {
        pairingByPid.set(item.pairingId, {
          id: item.id,
          type: 'Pairing',
          startUtc: item.schStrDtUtc,
          endUtc: item.schEndDtUtc,
          creditMinutes: dutyCreditMinutes(item),
          label: item.pairingLabel || scheduleLabelForItem(item),
          pairing: pairingCell(item),
          source: item.source || '-',
          duties: new Set([dutyKey]),
        })
      } else {
        const sMs = utcMs(item.schStrDtUtc)
        const eMs = utcMs(item.schEndDtUtc)
        if (Number.isFinite(sMs) && (!existing.startUtc || sMs < utcMs(existing.startUtc))) existing.startUtc = item.schStrDtUtc
        if (Number.isFinite(eMs) && (!existing.endUtc || eMs > utcMs(existing.endUtc))) existing.endUtc = item.schEndDtUtc
        if (!existing.duties.has(dutyKey)) {
          existing.duties.add(dutyKey)
          existing.creditMinutes += dutyCreditMinutes(item)
        }
      }
    } else {
      singles.push({
        id: item.id,
        type: scheduleTypeForItem(item),
        startUtc: item.schStrDtUtc,
        endUtc: item.schEndDtUtc,
        creditMinutes: dutyCreditMinutes(item),
        label: scheduleLabelForItem(item),
        pairing: '-',
        source: item.source || '-',
        duties: new Set(),
      })
    }
  }

  return [...pairingByPid.values(), ...singles]
    .slice()
    .sort((a, b) => (utcMs(a.startUtc) || 0) - (utcMs(b.startUtc) || 0) || a.id - b.id)
    .map((row) => ({
      id: row.id,
      type: row.type,
      start: formatScheduleDateTime(row.startUtc, zoneId),
      end: formatScheduleDateTime(row.endUtc, zoneId),
      credit: formatScheduleMinutes(row.creditMinutes),
      label: row.label,
      pairing: row.pairing,
      source: row.source,
    }))
}
```

- [ ] **Step 5: Run the full unit suite — all schedule-details tests PASS**

Run: `cd gantt && npx vitest run src/utils/__tests__/schedule-details.test.ts`
Expected: PASS (6 tests: timezone, credit, filter, aggregation ×3, updated dedup + sorted).

- [ ] **Step 6: Type-check + UI gate**

Run: `cd gantt && npx tsc -b`
Run: `cd /home/yuan.z/rois/rois-ai && npm run check:ui`
Expected: tsc exit 0; UI Gate PASS (0 hard violations).

- [ ] **Step 7: Commit**

```bash
git add gantt/src/utils/schedule-details.ts gantt/src/utils/__tests__/schedule-details.test.ts
git commit -m "feat(gantt): aggregate pairings into one Schedule Details row per pairing"
```

---

### Task 5: Playwright e2e — a multi-duty pairing renders as one row

**Files:**
- Modify: `gantt/src/utils/gantt-test-hook.ts` (the `roster()` hook, add `dutySeq` + `pairingInterfaceId`)
- Modify: `e2e/tests/gantt/schedule-details-dialog.spec.ts` (add `Live-1305`)

**Interfaces:**
- Consumes: the `roster` hook now returns `{ id, crewId, pairingId, start, dutySeq, dutyActCreditedMinutes, actCreditedMinutes, schCreditedMinutes }`; roster-periods API for the current RP; the crew search select (`schedule-details-crew` / `-search` / `-option`).

- [ ] **Step 1: Extend the roster hook**

In `gantt/src/utils/gantt-test-hook.ts`, in the `roster()` map add:

```ts
dutySeq: i.dutySeq,
pairingInterfaceId: i.pairingInterfaceId ?? null,
```

- [ ] **Step 2: Write the failing e2e test**

Add `Live-1305` to `schedule-details-dialog.spec.ts`. Add a local `RosterRecord` shape with the new fields (`start: string | null; dutySeq: number | null; dutyActCreditedMinutes: string | null; actCreditedMinutes: string | null; schCreditedMinutes: string | null; pairingInterfaceId: string | null`).

```ts
test('Live-1305 — a multi-duty pairing renders as one aggregated row with summed credit', async ({ page, request }) => {
  const token = await ganttApiLogin(request)
  const rpRes = await request.get(`${ganttApiUrl}/api/roster-periods`, { headers: { Authorization: `Bearer ${token}` } })
  expect(rpRes.ok(), 'roster-periods lookup').toBeTruthy()
  const rps = ((await rpRes.json()) as {
    data: { items: Array<{ rpStart: string; rpEnd: string; isCurrent: boolean }> }
  }).data.items
  const current = rps.find((rp) => rp.isCurrent)
  expect(current, 'current RP').toBeTruthy()

  // Find a crew with a multi-duty pairing whose duties all start inside the current RP.
  const roster = await readHook<RosterRecord[]>(page, 'roster')
  const inRp = roster.filter((r) =>
    r.pairingId != null && r.start != null
    && r.start.slice(0, 10) >= current!.rpStart && r.start.slice(0, 10) <= current!.rpEnd,
  )
  const perKey = new Map<string, number>()
  for (const r of inRp) {
    const key = `${r.crewId}|${r.pairingId}`
    perKey.set(key, (perKey.get(key) ?? 0) + 1)
  }
  const multi = inRp.find((r) => (perKey.get(`${r.crewId}|${r.pairingId}`) ?? 0) >= 2)
  expect(multi, 'a crew with a multi-duty pairing in the current RP').toBeTruthy()
  const crewId = multi!.crewId
  const pairingId = multi!.pairingId!

  // Expected credit = sum over distinct duties (duty-level credit counts once per dutySeq).
  const crewItems = inRp.filter((r) => r.crewId === crewId && r.pairingId === pairingId)
  const dutyCredits = new Map<string, number>()
  for (const r of crewItems) {
    const dutyKey = `${r.pairingId}|${r.dutySeq ?? ''}`
    if (dutyCredits.has(dutyKey)) continue
    const raw = r.dutyActCreditedMinutes ?? r.actCreditedMinutes ?? r.schCreditedMinutes
    const n = raw != null && raw !== '' ? Number(raw) : 0
    dutyCredits.set(dutyKey, Number.isFinite(n) ? n : 0)
  }
  const expectedMinutes = [...dutyCredits.values()].reduce((a, b) => a + b, 0)
  const expectedCredit = `${Math.floor(expectedMinutes / 60)}:${String(expectedMinutes % 60).padStart(2, '0')}`

  await openRosterDialog(page, 'Schedule Details')
  const dialog = page.getByTestId('schedule-details-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await dialog.getByTestId('schedule-details-crew').click()
  await dialog.getByTestId('schedule-details-crew-search').fill(crewId)
  await dialog.getByTestId('schedule-details-crew-option').first().click()
  await expect(dialog.getByTestId('schedule-details-crew')).toContainText(crewId)

  // Exactly one row carries the pairing (leading cell id == pairingId) and its credit is summed.
  await expect(dialog.getByTestId('schedule-details-row').first()).toBeVisible({ timeout: 5_000 })
  const rows = await dialog.locator('[data-testid="schedule-details-row"]').evaluateAll(
    (trs) => trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'))
      return {
        type: cells[0]?.textContent ?? '',
        credit: cells[3]?.textContent ?? '',
        pairing: cells[5]?.textContent ?? '',
      }
    }),
  )
  const matching = rows.filter((row) => row.pairing.split(' · ')[0] === String(pairingId))
  expect(matching, 'pairing appears exactly once').toHaveLength(1)
  expect(matching[0].type).toBe('Pairing')
  expect(matching[0].credit).toBe(expectedCredit)
})
```

- [ ] **Step 3: Run the e2e test — verify it FAILS before Task 4's aggregation**

Run: `cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test --config config/playwright.config.ts tests/gantt/schedule-details-dialog.spec.ts -g "Live-1305"`
Expected: FAIL — `matching` has length ≥ 2 (per-segment rows not yet aggregated). (If Task 4 is already merged, skip this step and go to Step 4.)

- [ ] **Step 4: Run the full schedule-details spec — all PASS**

Run: `cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test --config config/playwright.config.ts tests/gantt/schedule-details-dialog.spec.ts`
Expected: 5/5 PASS (Live-1300, 1302, 1303, 1304, 1305).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/utils/gantt-test-hook.ts e2e/tests/gantt/schedule-details-dialog.spec.ts
git commit -m "test(gantt): e2e for single aggregated pairing row in Schedule Details"
```

---

## Self-Review

**Spec coverage:**
- Live DTO `pairingInterfaceId` → Task 2. ✓
- Scenario gantt-data `interfaceId` → Task 3. ✓
- Aggregation (one row per pairing, Start/End bounds, Σ distinct-duty credit, label = `pairing_label`) → Task 4. ✓
- Pairing column `id · interface_id`, fallback to `id` → Task 4 test `shows just the pairing id`. ✓
- Non-pairing rows unchanged, chronological interleave → Task 4 test `interleaves merged pairing rows`. ✓
- Daily Task Calendar unchanged → no task touches `daily-task-view.ts` / the calendar dialog. ✓
- Unit + Playwright tests → Tasks 4 & 5. ✓

**Placeholder scan:** no TBD/TODO; every code step includes concrete code or an exact test command.

**Type consistency:** `pairingInterfaceId` (RosterItem / DTO / hook), `interfaceId` (ScenarioGanttPairing), `dutySeq` (hook) are named identically across tasks. `ScheduleRowDraft`, `dutyCreditMinutes`, `pairingCell`, `utcMs` are defined in Task 4 and only used there.
