# Live Publish Roster — Source + NOC Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Source** and **NOC** columns to the far right of the Live Publish Roster Table so operators can see each change's origin (`roster_flight.source` / `roster_publish.source`) and its NOC push status (`roster_publish_adjust.published`).

**Architecture:** The diff is already computed by one large SQL query in `roster-publish-service.ts`. Rather than edit that SQL, add a **separate enrichment step** after the page is fetched: two small lookups (source map, latest adjust per roster_flight) merged into the diff rows in TS. The frontend just renders two new columns. The apply path is untouched.

**Tech Stack:** Fastify + PostgreSQL (live-server), React 19 + shadcn Table (gantt), Vitest, Playwright.

## Global Constraints

- Per spec `docs/superpowers/specs/2026-08-07-live-publish-roster-source-noc-columns-design.md`:
  - Source: ADD/UPDATE/NO_CHANGE → `roster_flight.source`; DELETE → `roster_publish.source`.
  - NOC: any grouped source `IMP` → `Ignore`; else only for status ADD/UPDATE with source CR/MA → look up latest `roster_publish_adjust.published` (`0`→`Pending`, `1`→`Success`, no record→`-`); DELETE/NO_CHANGE with CR/MA → `-`.
  - Grouped rows (multi-segment): Source joins distinct values with `,`; NOC uses worst-case (`Pending` if any pending, `Success` only if all latest = 1, else `-`).
- UI text is English only (project rule): labels are `Source`, `NOC`, `Ignore`, `Pending`, `Success`.
- No new dependencies. No schema changes. No changes to `diffSql()` or the apply flow.
- Every UI change ships with updated unit + Playwright tests (§Playwright-Required, §No-Illusion — paste PASS output, never claim).
- Style: only token font sizes (`text-xs`, `text-2xs`), no magic values, icons aligned (§UI-Standard-Gate). Run `npm run check:ui` at root after frontend changes.

## File Structure

| File | Change |
|------|--------|
| `live-server/src/services/roster/roster-publish-service.ts` | Add `source`/`noc` to `RosterPublishDiffRow` + `mapDiffRow`; add `enrichDiffWithSourceNoc()`; call it in `listDiff()` |
| `live-server/src/__tests__/services/roster/roster-publish-service.test.ts` | Chain 3 query mocks in the existing diff test; add a NOC-rules test |
| `gantt/src/services/roster-publish-api.ts` | Add `source`/`noc` to `RosterPublishDiffRow` |
| `gantt/src/components/roster/roster-publish-dialog.tsx` | `TABLE_COLUMN_COUNT` 13→15; add 2 `<TableHead>` + 2 `<TableCell>` |
| `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx` | Add `source`/`noc` to mocked rows; add a render test |
| `e2e/tests/gantt/roster-publish-dialog.spec.ts` | Add `source`/`noc` to mock row type + factory; add a test |

---

### Task 1: live-server — enrich diff rows with source + noc (TDD)

**Files:**
- Modify: `live-server/src/services/roster/roster-publish-service.ts`
- Test: `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`

**Interfaces:**
- Produces: `RosterPublishDiffRow` gains `source: string | null` and `noc: 'Ignore' | 'Pending' | 'Success' | null`. `listDiff()` returns rows already enriched. Internal helper `enrichDiffWithSourceNoc(pool: Pick<PoolClient,'query'>, items: RosterPublishDiffRow[]): Promise<RosterPublishDiffRow[]>`.

- [ ] **Step 1: Write/extend the failing tests**

Open `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`.

**(a) Update the existing test** `'maps the grouped diff row and summary counts from the SQL result'` (around line 58). Replace its single `vi.fn(async () => ({ rows: [...] }))` mock with a 3-response chain so `listDiff`'s three queries each return distinct data:

```ts
const query = vi.fn()
  .mockResolvedValueOnce({
    rows: [{
      key: 'F|C001|9001',
      kind: 'FLYING',
      status: 'UPDATE',
      crew_id: 'C001',
      crew_name: 'Crew One',
      crew_fleet: 'A321 | B777',
      base: 'YVR',
      pairing_id: '9001',
      pairing_label: 'V9001',
      roster_ids: ['11', '12'],
      publish_ids: ['21', '22'],
      assignment_group: 'FLY',
      assignment: 'FLY',
      acting_rank: 'FO',
      sch_str_dt_utc: new Date('2026-07-01T10:00:00Z'),
      sch_end_dt_utc: new Date('2026-07-02T18:00:00Z'),
      dep_arp: null,
      arv_arp: null,
      segment_count: 2,
      changed_fields: ['brief_start_utc'],
      publish_status: 'UNPUBLISHED',
      total_count: '3',
      add_count: '1',
      update_count: '1',
      delete_count: '1',
      no_change_count: '0',
    }],
  })
  .mockResolvedValueOnce({
    rows: [
      { id: '11', source: 'CR' },
      { id: '12', source: 'CR' },
    ],
  })
  .mockResolvedValueOnce({
    rows: [
      { new_roster_flight_id: '11', published: '1' },
      { new_roster_flight_id: '12', published: '1' },
    ],
  })
```

Then, inside the same test after the existing `expect(result).toMatchObject({ ... })`, add:

```ts
expect(result.items[0]).toMatchObject({ source: 'CR', noc: 'Success' })
```

**(b) Add a new test** for the per-row NOC rules (place it right after the test above):

```ts
it('resolves Source and NOC per row: IMP ignore, CR pending, delete from publish source', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [
      {
        key: 'F|C100|9001', kind: 'FLYING', status: 'ADD', crew_id: 'C100',
        crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
        roster_ids: ['31'], publish_ids: [], assignment_group: null, assignment: null,
        acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
        segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
        total_count: '3', add_count: '1', update_count: '1', delete_count: '1', no_change_count: '0',
      },
      {
        key: 'F|C200|9002', kind: 'FLYING', status: 'UPDATE', crew_id: 'C200',
        crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
        roster_ids: ['41'], publish_ids: [], assignment_group: null, assignment: null,
        acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
        segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
      },
      {
        key: 'F|C300|9003', kind: 'FLYING', status: 'DELETE', crew_id: 'C300',
        crew_name: null, crew_fleet: null, base: null, pairing_id: null, pairing_label: null,
        roster_ids: [], publish_ids: ['51'], assignment_group: null, assignment: null,
        acting_rank: null, sch_str_dt_utc: null, sch_end_dt_utc: null, dep_arp: null, arv_arp: null,
        segment_count: 1, changed_fields: [], publish_status: 'UNPUBLISHED',
      },
    ]})
    .mockResolvedValueOnce({
      rows: [
        { id: '31', source: 'IMP' },
        { id: '41', source: 'CR' },
        { id: '51', source: 'MA' },
      ],
    })
    .mockResolvedValueOnce({
      rows: [{ new_roster_flight_id: '41', published: '0' }],
    })

  const result = await rosterPublishService.listDiff(makeFastify(query), { rosterPeriodId: 7 })

  expect(result.items[0]).toMatchObject({ source: 'IMP', noc: 'Ignore' })
  expect(result.items[1]).toMatchObject({ source: 'CR', noc: 'Pending' })
  expect(result.items[2]).toMatchObject({ source: 'MA', noc: null })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/yuan.z/rois/rois-ai/live-server && npx vitest run src/__tests__/services/roster/roster-publish-service.test.ts`
Expected: FAIL — `source`/`noc` are `undefined` on the returned items (enrichment not implemented).

- [ ] **Step 3: Implement the enrichment in the service**

Open `live-server/src/services/roster/roster-publish-service.ts`.

**(a)** Add `source` and `noc` to `RosterPublishDiffRow` (interface at line ~34):

```ts
  publishStatus: 'PUBLISHED' | 'UNPUBLISHED'
  source: string | null
  noc: 'Ignore' | 'Pending' | 'Success' | null
```

**(b)** In `mapDiffRow` (line ~1223), add the two fields so the apply path and pre-enrichment rows stay valid:

```ts
  publishStatus: row.publish_status,
  source: null,
  noc: null,
})
```

(`uniqueIds` already exists at line ~877 in this file — do not re-add it.)

**(c)** Add the enrichment helper right after `mapDiffRow` (before `export const rosterPublishService`):

```ts
const enrichDiffWithSourceNoc = async (
  pool: Pick<PoolClient, 'query'>,
  items: RosterPublishDiffRow[],
): Promise<RosterPublishDiffRow[]> => {
  if (items.length === 0) return items
  const rosterIds = uniqueIds(items.flatMap((row) => (row.status === 'DELETE' ? [] : row.rosterIds)))
  const publishIds = uniqueIds(items.flatMap((row) => (row.status === 'DELETE' ? row.publishIds : [])))
  const schema = quote()

  const [sourceResult, adjustResult] = await Promise.all([
    pool.query<{ id: string | number; source: string | null }>(
      `select id, source from ${schema}.roster_flight where id = any($1::bigint[])
       union all
       select id, source from ${schema}.roster_publish where id = any($2::bigint[])`,
      [rosterIds, publishIds],
    ),
    pool.query<{ new_roster_flight_id: string | number; published: string | number }>(
      `select distinct on (new_roster_flight_id) new_roster_flight_id, published
       from ${schema}.roster_publish_adjust
       where new_roster_flight_id = any($1::bigint[])
       order by new_roster_flight_id, id desc`,
      [rosterIds],
    ),
  ])

  const sourceById = new Map<number, string>()
  for (const row of sourceResult.rows) {
    const source = row.source?.trim()
    if (source) sourceById.set(Number(row.id), source)
  }
  const publishedByRosterId = new Map<number, number>()
  for (const row of adjustResult.rows) {
    publishedByRosterId.set(Number(row.new_roster_flight_id), Number(row.published))
  }

  const rowSources = (row: RosterPublishDiffRow): string[] => {
    const ids = row.status === 'DELETE' ? row.publishIds : row.rosterIds
    return [...new Set(ids.map((id) => sourceById.get(id)).filter((value): value is string => !!value))]
  }

  const resolveNoc = (
    row: RosterPublishDiffRow,
    sources: string[],
  ): 'Ignore' | 'Pending' | 'Success' | null => {
    if (sources.length === 0) return null
    if (sources.includes('IMP')) return 'Ignore'
    if (row.status !== 'ADD' && row.status !== 'UPDATE') return null
    const latest = row.rosterIds
      .map((id) => publishedByRosterId.get(id))
      .filter((value): value is number => value != null)
    if (latest.length === 0) return null
    if (latest.some((published) => published === 0)) return 'Pending'
    if (latest.every((published) => published === 1)) return 'Success'
    return null
  }

  return items.map((row) => {
    const sources = rowSources(row)
    return {
      ...row,
      source: sources.length > 0 ? sources.join(',') : null,
      noc: resolveNoc(row, sources),
    }
  })
}
```

**(d)** In `listDiff` (around line 1271), replace `items: rows.map(mapDiffRow)` with the enriched call:

```ts
    const result = await fastify.pgPool.query<RawDiffRow>(diffSql(), params)
    const rows = result.rows
    const first = rows[0]
    const items = await enrichDiffWithSourceNoc(fastify.pgPool, rows.map(mapDiffRow))
    return {
      items,
      total: Number(first?.total_count ?? 0),
      page,
      pageSize,
      summary: {
        add: Number(first?.add_count ?? 0),
        update: Number(first?.update_count ?? 0),
        delete: Number(first?.delete_count ?? 0),
        noChange: Number(first?.no_change_count ?? 0),
        actionable: Number(first?.add_count ?? 0) + Number(first?.update_count ?? 0) + Number(first?.delete_count ?? 0),
      },
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/yuan.z/rois/rois-ai/live-server && npx vitest run src/__tests__/services/roster/roster-publish-service.test.ts`
Expected: PASS (all tests in the file, including the two edited/added).

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add live-server/src/services/roster/roster-publish-service.ts live-server/src/__tests__/services/roster/roster-publish-service.test.ts
git commit -m "$(cat <<'EOF'
feat(live-server): enrich publish diff rows with source and noc

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: gantt — API type + dialog columns (TDD)

**Files:**
- Modify: `gantt/src/services/roster-publish-api.ts`
- Modify: `gantt/src/components/roster/roster-publish-dialog.tsx`
- Test: `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx`

**Interfaces:**
- Consumes: backend `RosterPublishDiffRow` now has `source: string | null`, `noc: 'Ignore' | 'Pending' | 'Success' | null`.

- [ ] **Step 1: Write the failing test**

Open `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx`.

**(a)** In the `vi.hoisted` `mocks.diff` (top of file), add the two fields to each mocked row:
- UPDATE row (`F|C001|9001`): add `source: 'CR',` and `noc: 'Success',` after `publishStatus: 'UNPUBLISHED',`.
- NO_CHANGE row (`G|C002|13`): add `source: 'IMP',` and `noc: 'Ignore',` after `publishStatus: 'PUBLISHED',`.

**(b)** Add a new test at the end of the `describe` block:

```ts
it('renders Source and NOC columns from the diff row payload', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)

  await act(async () => {
    root.render(<RosterPublishDialog open onOpenChange={vi.fn()} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    ;(container.querySelector('[data-testid="roster-publish-search"]') as HTMLButtonElement).click()
  })

  expect(container.textContent).toContain('Source')
  expect(container.textContent).toContain('NOC')
  expect(container.textContent).toContain('CR')
  expect(container.textContent).toContain('Success')
  expect(container.textContent).toContain('IMP')
  expect(container.textContent).toContain('Ignore')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/components/roster/__tests__/roster-publish-dialog.test.tsx`
Expected: FAIL — `Source`/`NOC` columns and values not rendered.

- [ ] **Step 3: Implement the API type + dialog columns**

**(a)** `gantt/src/services/roster-publish-api.ts` — add to `RosterPublishDiffRow` (after `publishStatus`):

```ts
  publishStatus: 'PUBLISHED' | 'UNPUBLISHED'
  source: string | null
  noc: 'Ignore' | 'Pending' | 'Success' | null
```

**(b)** `gantt/src/components/roster/roster-publish-dialog.tsx`:

- Change `const TABLE_COLUMN_COUNT = 13` to `15`.
- After the Status `<TableHead>` (line ~534), add:

```tsx
              <TableHead className={TABLE_HEAD_CLASS}>Source</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>NOC</TableHead>
```

- After the Status `<TableCell>` (line ~596), add:

```tsx
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.source ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-2xs">
                    {row.noc === 'Pending' && (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300">Pending</Badge>
                    )}
                    {row.noc === 'Success' && (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">Success</Badge>
                    )}
                    {row.noc === 'Ignore' && <span className="text-muted-foreground">Ignore</span>}
                    {row.noc == null && <span className="text-muted-foreground">-</span>}
                  </TableCell>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/components/roster/__tests__/roster-publish-dialog.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Style gate**

Run: `cd /home/yuan.z/rois/rois-ai && npm run check:ui`
Expected: PASS — hard violations `0`.

- [ ] **Step 6: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/services/roster-publish-api.ts gantt/src/components/roster/roster-publish-dialog.tsx gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(gantt): show Source and NOC columns in Publish Roster table

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: e2e — mock source/noc + assertion test

**Files:**
- Modify: `e2e/tests/gantt/roster-publish-dialog.spec.ts`

**Interfaces:**
- Consumes: frontend renders `Source` / `NOC` headers and `Ignore`/`Pending`/`Success`/`-` cell values.

- [ ] **Step 1: Update the mock and add a test**

Open `e2e/tests/gantt/roster-publish-dialog.spec.ts`.

**(a)** Add to `interface MockPublishDiffRow` (after `publishStatus`):

```ts
  source: string
  noc: 'Ignore' | 'Pending' | 'Success' | null
```

**(b)** In `makePublishDiffRow`, add the two defaults (after `publishStatus: 'UNPUBLISHED',`):

```ts
  source: 'CR',
  noc: 'Pending',
```

**(c)** In the default two-row setup inside `mockPublishRosterApis` (around line 134), add overrides to the NO_CHANGE row so both display states are exercised:

```ts
          makePublishDiffRow(2, {
            key: 'F|C00002|9002',
            status: 'NO_CHANGE',
            pairingId: 9002,
            pairingLabel: 'PAIR-9002',
            publishStatus: 'PUBLISHED',
            changedFields: [],
            source: 'IMP',
            noc: 'Ignore',
          }),
```

**(d)** Add a new test at the end of the file:

```ts
test('Live-1426: Publish Roster renders Source and NOC columns', async ({ page, request }) => {
  const { dialog } = await openPublishRosterDialog(page, request)

  await page.getByTestId('roster-publish-search').click()
  await expect(dialog.getByText('Source', { exact: true })).toBeVisible()
  await expect(dialog.getByText('NOC', { exact: true })).toBeVisible()
  await expect(page.getByTestId('roster-publish-row-F|C00001|9001')).toContainText('CR')
  await expect(page.getByTestId('roster-publish-row-F|C00001|9001')).toContainText('Pending')
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002')).toContainText('IMP')
  await expect(page.getByTestId('roster-publish-row-F|C00002|9002')).toContainText('Ignore')
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test tests/gantt/roster-publish-dialog.spec.ts --reporter=list`
Expected: PASS — all tests in the spec file, including `Live-1426`.

> If `Live-1420`'s no-horizontal-overflow check fails because the two new columns widen the table, keep the cells compact (the new cells already use `whitespace-nowrap text-xs/text-2xs` with default padding) and re-run; do not weaken the overflow assertion.

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add e2e/tests/gantt/roster-publish-dialog.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): assert Source and NOC columns in Publish Roster dialog

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the three suites together and paste results**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx vitest run src/__tests__/services/roster/roster-publish-service.test.ts 2>&1 | tail -8
cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/components/roster/__tests__/roster-publish-dialog.test.tsx 2>&1 | tail -8
cd /home/yuan.z/rois/rois-ai && npm run check:ui 2>&1 | tail -6
cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test tests/gantt/roster-publish-dialog.spec.ts --reporter=list 2>&1 | tail -12
```

Expected: all PASS; `check:ui` hard violations `0`. Paste the actual output in the completion message (§No-Illusion).

- [ ] **Step 2: Verify the git diff is scoped**

Run: `cd /home/yuan.z/rois/rois-ai && git status --short && git diff --stat HEAD~3`
Expected: only the six files from this plan changed (plus the spec + plan docs).
