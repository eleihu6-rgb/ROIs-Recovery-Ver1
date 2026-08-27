# Roster Pane Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale rank/base/empty-fleet in the Roster Pane left panel with date-effective values from `crew_rank`/`crew_base`/`crew_fleet` history tables, and make the crew full name span the bottom row (like Pairing pane's Comp column).

**Architecture:** The crew list API is extended to return full rank/base/fleet history arrays alongside each crew. The frontend derives effective values client-side using the timeline's leftmost visible date (truncated to day), so scrolling the timeline updates the header data instantly with zero network calls. The canvas `drawSingleRow` function gains an optional `bottomRowKey` that renders a full-width spanning label in the bottom strip of each row.

**Tech Stack:** TypeScript, Drizzle ORM (live-server), React 19 + Zustand + Canvas (gantt), Vitest (unit tests)

**Spec:** `docs/superpowers/specs/2026-05-15-roster-pane-header-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `live-server/src/services/crew/crew-service.ts` | Modify | Add 3 parallel batch queries for full rank/base/fleet history |
| `gantt/src/types/crew.ts` | Modify | Add `ranks?`, `bases?`, `fleets?` optional arrays to `Crew` |
| `gantt/src/utils/crew-history.ts` | Create | `getAllEffective` + `getEffective` pure helpers |
| `gantt/src/utils/__tests__/crew-history.test.ts` | Create | Unit tests for the two helpers |
| `gantt/src/components/gantt/pane-header-canvas.tsx` | Modify | Add `bottomRowKey?` to `drawSingleRow` + `drawDataRows` |
| `gantt/src/stores/column-store.ts` | Modify | fleet/ybh → row 1; remove crewName; localStorage migration |
| `gantt/src/components/panes/roster-pane.tsx` | Modify | `viewportLeftDate` derived state + new panel-row values + `bottomRowKey` prop |

---

## Task 1: Extend crew list API with rank/base/fleet history

**Files:**
- Modify: `live-server/src/services/crew/crew-service.ts:135-191`

- [ ] **Step 1: Add three batch history queries in the list function**

  Find the `Promise.all` block at line ~137 that currently fetches `[rankRows, fleetRows]`. Replace it with a 5-query parallel fetch that also retrieves full history (all records, no date filter) for ranks, bases, fleets.

  Replace lines 137-161 (`const [rankRows, fleetRows] = ...`) with:

  ```typescript
  const [rankRows, fleetRows, allRankRows, allBaseRows, allFleetRows] = crewIds.length > 0
    ? await Promise.all([
        // existing: current-effective rank for quals (unchanged)
        fastify.db
          .select({ crewId: crewRank.crewId, rank: crewRank.rank, division: crewRank.division })
          .from(crewRank)
          .where(and(inArray(crewRank.crewId, crewIds), currentEffCondition(crewRank))),
        // existing: current-effective fleet for quals (unchanged)
        fastify.db
          .select({ crewId: crewFleet.crewId, fleetSpecific: crewFleet.fleetSpecific })
          .from(crewFleet)
          .where(and(inArray(crewFleet.crewId, crewIds), currentEffCondition(crewFleet))),
        // new: full rank history (all records, no date filter)
        fastify.db
          .select({
            id: crewRank.id,
            crewId: crewRank.crewId,
            rank: crewRank.rank,
            effDt: crewRank.effDt,
            expDt: crewRank.expDt,
          })
          .from(crewRank)
          .where(inArray(crewRank.crewId, crewIds))
          .orderBy(crewRank.crewId, crewRank.effDt),
        // new: full base history
        fastify.db
          .select({
            id: crewBase.id,
            crewId: crewBase.crewId,
            base: crewBase.base,
            effDt: crewBase.effDt,
            expDt: crewBase.expDt,
          })
          .from(crewBase)
          .where(inArray(crewBase.crewId, crewIds))
          .orderBy(crewBase.crewId, crewBase.effDt),
        // new: full fleet history
        fastify.db
          .select({
            id: crewFleet.id,
            crewId: crewFleet.crewId,
            fleetSpecific: crewFleet.fleetSpecific,
            effDt: crewFleet.effDt,
            expDt: crewFleet.expDt,
          })
          .from(crewFleet)
          .where(inArray(crewFleet.crewId, crewIds))
          .orderBy(crewFleet.crewId, crewFleet.effDt),
      ])
    : [[], [], [], [], []]
  ```

- [ ] **Step 2: Group history rows by crewId**

  Add these three maps after the existing `rankByCrew` / `fleetByCrew` grouping (after line ~175):

  ```typescript
  // Group history arrays by crewId
  const ranksByCrew = new Map<string, typeof allRankRows>()
  for (const r of allRankRows) {
    const arr = ranksByCrew.get(r.crewId) ?? []
    arr.push(r)
    ranksByCrew.set(r.crewId, arr)
  }

  const basesByCrew = new Map<string, typeof allBaseRows>()
  for (const r of allBaseRows) {
    const arr = basesByCrew.get(r.crewId) ?? []
    arr.push(r)
    basesByCrew.set(r.crewId, arr)
  }

  const fleetsByCrew = new Map<string, typeof allFleetRows>()
  for (const r of allFleetRows) {
    const arr = fleetsByCrew.get(r.crewId) ?? []
    arr.push(r)
    fleetsByCrew.set(r.crewId, arr)
  }
  ```

- [ ] **Step 3: Attach history arrays to each enriched crew item**

  In the `enrichedItems` map (line ~178), add the three history arrays alongside the existing `quals`:

  ```typescript
  const enrichedItems = items.map((c) => {
    const rankInfo = rankByCrew.get(c.crewId)
    return {
      ...c,
      quals: {
        division: rankInfo?.division ?? c.division,
        rank: rankInfo?.rank ?? '',
        fleetQuals: fleetByCrew.get(c.crewId) ?? [],
        airportQuals: [] as string[],
      },
      ranks:  ranksByCrew.get(c.crewId)  ?? [],
      bases:  basesByCrew.get(c.crewId)  ?? [],
      fleets: fleetsByCrew.get(c.crewId) ?? [],
    }
  })
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 5: Commit**

  ```bash
  git add live-server/src/services/crew/crew-service.ts
  git commit -m "feat(live-server): add rank/base/fleet history arrays to crew list response"
  ```

---

## Task 2: Add history array types to frontend Crew interface

**Files:**
- Modify: `gantt/src/types/crew.ts:12-27` (the `Crew` interface)

- [ ] **Step 1: Add optional history arrays to the Crew interface**

  Open `gantt/src/types/crew.ts`. Add the three optional fields at the end of the `Crew` interface (after `remarks`):

  ```typescript
  export interface Crew {
    id: number
    crewId: string
    firstName: string
    middleName: string | null
    lastName: string
    preferredName: string | null
    gender: string
    division: string
    filiale: string
    status: number
    remarks: string | null

    /** Qualifications loaded inline with list response */
    quals?: CrewQualSummary

    /** Full rank history (all records, ordered by eff_dt asc) */
    ranks?: CrewRankRecord[]
    /** Full base history */
    bases?: CrewBaseRecord[]
    /** Full fleet history */
    fleets?: CrewFleetRecord[]
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  ```bash
  git add gantt/src/types/crew.ts
  git commit -m "feat(gantt): add ranks/bases/fleets history arrays to Crew type"
  ```

---

## Task 3: Create crew-history utility with unit tests

**Files:**
- Create: `gantt/src/utils/crew-history.ts`
- Create: `gantt/src/utils/__tests__/crew-history.test.ts`

- [ ] **Step 1: Write the failing tests first**

  Create `gantt/src/utils/__tests__/crew-history.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { getAllEffective, getEffective } from '../crew-history'

  const r = (rank: string, effDt: string, expDt: string | null) => ({
    id: 1,
    crewId: 'X001',
    rank,
    effDt,
    expDt,
  })

  describe('getAllEffective', () => {
    it('returns records where eff_dt <= date and exp_dt is null', () => {
      const records = [r('FO', '2022-01-01', null)]
      const result = getAllEffective(records, new Date('2025-06-01'))
      expect(result).toHaveLength(1)
      expect(result[0].rank).toBe('FO')
    })

    it('returns records where eff_dt <= date and exp_dt > date', () => {
      const records = [r('CA', '2024-07-01', '2026-12-31')]
      const result = getAllEffective(records, new Date('2025-01-15'))
      expect(result).toHaveLength(1)
      expect(result[0].rank).toBe('CA')
    })

    it('excludes records where eff_dt > date', () => {
      const records = [r('CA', '2026-01-01', null)]
      const result = getAllEffective(records, new Date('2025-01-15'))
      expect(result).toHaveLength(0)
    })

    it('excludes records where exp_dt <= date', () => {
      const records = [r('FO', '2022-01-01', '2024-06-30')]
      const result = getAllEffective(records, new Date('2025-01-15'))
      expect(result).toHaveLength(0)
    })

    it('returns multiple records when both are effective (dual rating)', () => {
      const records = [
        r('CA',  '2021-01-01', null),
        r('FCN', '2023-06-01', null),
      ]
      const result = getAllEffective(records, new Date('2025-01-15'))
      expect(result).toHaveLength(2)
    })

    it('returns empty array for empty input', () => {
      expect(getAllEffective([], new Date('2025-01-15'))).toHaveLength(0)
    })

    it('excludes records where exp_dt equals date exactly (exp_dt is exclusive upper bound)', () => {
      const records = [r('FO', '2022-01-01', '2025-01-15')]
      const result = getAllEffective(records, new Date('2025-01-15'))
      expect(result).toHaveLength(0)
    })
  })

  describe('getEffective', () => {
    it('returns null when no records are effective', () => {
      expect(getEffective([], new Date('2025-01-15'))).toBeNull()
    })

    it('returns the single effective record', () => {
      const records = [r('CA', '2024-01-01', null)]
      expect(getEffective(records, new Date('2025-01-15'))?.rank).toBe('CA')
    })

    it('returns the record with the latest eff_dt when multiple match', () => {
      const records = [
        r('FO', '2020-01-01', null),
        r('CA', '2024-07-01', null),
      ]
      expect(getEffective(records, new Date('2025-01-15'))?.rank).toBe('CA')
    })
  })
  ```

- [ ] **Step 2: Run tests — expect failure (file not yet created)**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npm run test -- src/utils/__tests__/crew-history.test.ts
  ```

  Expected: FAIL with "Cannot find module '../crew-history'"

- [ ] **Step 3: Implement crew-history.ts**

  Create `gantt/src/utils/crew-history.ts`:

  ```typescript
  type EffRecord = { effDt: string; expDt: string | null }

  /**
   * Returns all records effective on `date`:
   *   eff_dt <= date AND (exp_dt IS NULL OR exp_dt > date)
   * Multiple records may match simultaneously (e.g. dual ratings).
   */
  export function getAllEffective<T extends EffRecord>(records: T[], date: Date): T[] {
    return records.filter((r) => {
      const eff = new Date(r.effDt)
      const exp = r.expDt ? new Date(r.expDt) : null
      return eff <= date && (exp === null || exp > date)
    })
  }

  /** Returns the single effective record with the latest eff_dt, or null if none match. */
  export function getEffective<T extends EffRecord>(records: T[], date: Date): T | null {
    const matches = getAllEffective(records, date)
    if (matches.length === 0) return null
    return matches.reduce((best, r) =>
      new Date(r.effDt) > new Date(best.effDt) ? r : best,
    )
  }
  ```

- [ ] **Step 4: Run tests — expect all pass**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npm run test -- src/utils/__tests__/crew-history.test.ts
  ```

  Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add gantt/src/utils/crew-history.ts gantt/src/utils/__tests__/crew-history.test.ts
  git commit -m "feat(gantt): add crew-history utility with getAllEffective/getEffective"
  ```

---

## Task 4: Canvas — bottomRowKey in drawSingleRow and drawDataRows

**Files:**
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx:534` (`drawSingleRow` signature + body)
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx:760` (`drawDataRows` signature + calls at 798, 807)
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx:178` (pass `bottomRowKey` to `drawDataRows`)

The row height stays at `ROW_HEIGHT = 43px`. The top strip uses the existing column rendering (unchanged). When `bottomRowKey` is supplied, a separator line is drawn at `y + 24` and the spanning crew name fills the remaining 19px.

- [ ] **Step 1: Add `bottomRowKey?` to `drawSingleRow` (line 534)**

  The current function signature at line 534 is:
  ```typescript
  const drawSingleRow = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    y: number,
    i: number,
    row: PanelRowData,
    columns: ColumnConfig[],
    colors: ReturnType<typeof getGanttColors>,
    isPinned: boolean,
    isSelected: boolean,
    rowHeight: number,
  ): void => {
  ```

  Change to:
  ```typescript
  const drawSingleRow = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    y: number,
    i: number,
    row: PanelRowData,
    columns: ColumnConfig[],
    colors: ReturnType<typeof getGanttColors>,
    isPinned: boolean,
    isSelected: boolean,
    rowHeight: number,
    bottomRowKey?: string,
  ): void => {
  ```

- [ ] **Step 2: Add bottom strip rendering inside `drawSingleRow`**

  At the very end of `drawSingleRow` body, just before the closing `}` (after the violation indicator block that ends at line ~638), add:

  ```typescript
  // Bottom spanning row (e.g. crew name) — only when bottomRowKey is provided
  if (bottomRowKey) {
    const topH = 24
    const bottomValue = row.values[bottomRowKey] ?? ''

    // Separator between top columns and bottom name strip
    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, y + topH)
    ctx.lineTo(canvasWidth, y + topH)
    ctx.stroke()

    // Spanning name text in the bottom strip
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `${FONT_SIZE_PANEL - 1}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.beginPath()
    ctx.rect(4, y + topH + 1, canvasWidth - 8, rowHeight - topH - 2)
    ctx.clip()
    ctx.fillText(bottomValue, 8, y + topH + (rowHeight - topH) / 2)
    ctx.restore()
    ctx.textBaseline = 'top'
  }
  ```

- [ ] **Step 3: Add `bottomRowKey?` to `drawDataRows` (line 760) and forward to `drawSingleRow`**

  Current signature at line 760:
  ```typescript
  const drawDataRows = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    scrollY: number,
    columns: ColumnConfig[],
    rows: PanelRowData[],
    frozenCount: number,
    selectedIndices: Set<number>,
    headerHeight: number = HEADER_HEIGHT,
    rowHeight: number = ROW_HEIGHT,
  ): void => {
  ```

  Change to:
  ```typescript
  const drawDataRows = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    scrollY: number,
    columns: ColumnConfig[],
    rows: PanelRowData[],
    frozenCount: number,
    selectedIndices: Set<number>,
    headerHeight: number = HEADER_HEIGHT,
    rowHeight: number = ROW_HEIGHT,
    bottomRowKey?: string,
  ): void => {
  ```

  Then update the two `drawSingleRow` calls inside `drawDataRows` (lines ~798 and ~807) to pass `bottomRowKey`:

  ```typescript
  // line ~798 (scrollable rows):
  drawSingleRow(ctx, canvasWidth, y, i, row, columns, colors, false, selectedIndices.has(i), rowHeight, bottomRowKey)

  // line ~807 (frozen rows):
  drawSingleRow(ctx, canvasWidth, y, i, row, columns, colors, true, selectedIndices.has(i), rowHeight, bottomRowKey)
  ```

- [ ] **Step 4: Forward `bottomRowKey` to `drawDataRows` in the render block (line ~178)**

  The current call at line 179:
  ```typescript
  drawDataRows(ctx, size.width, size.height, latestScrollY, visibleColumns, rows, frozenCount, selectedRowIndices, headerHeight, rowHeight)
  ```

  Change to:
  ```typescript
  drawDataRows(ctx, size.width, size.height, latestScrollY, visibleColumns, rows, frozenCount, selectedRowIndices, headerHeight, rowHeight, bottomRowKey)
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 6: Commit**

  ```bash
  git add gantt/src/components/gantt/pane-header-canvas.tsx
  git commit -m "feat(gantt): add bottomRowKey spanning row to drawSingleRow/drawDataRows"
  ```

---

## Task 5: Update column-store DEFAULT_ROSTER_COLUMNS + localStorage migration

**Files:**
- Modify: `gantt/src/stores/column-store.ts:7-19` (DEFAULT_ROSTER_COLUMNS)
- Modify: `gantt/src/stores/column-store.ts:112-129` (`loadFromStorage` — add migration guard)

- [ ] **Step 1: Update DEFAULT_ROSTER_COLUMNS**

  Replace lines 7-19 with:

  ```typescript
  /** Default columns for Roster panes — keys match panelRows.values in roster-pane.tsx */
  const DEFAULT_ROSTER_COLUMNS: ColumnConfig[] = [
    { key: 'crewId', label: 'CrewId', width: 70, visible: true,  order: 1,  row: 1 },
    { key: 'rank',   label: 'Rank',   width: 45, visible: true,  order: 2,  row: 1 },
    { key: 'base',   label: 'Base',   width: 45, visible: true,  order: 3,  row: 1 },
    { key: 'fleet',  label: 'Fleet',  width: 50, visible: true,  order: 4,  row: 1 },
    { key: 'ybh',    label: 'YBH',    width: 55, visible: true,  order: 5,  row: 1 },
    { key: 'mbh',    label: 'MBH',    width: 50, visible: false, order: 6,  row: 1 },
    { key: 'yal',    label: 'YAL',    width: 50, visible: false, order: 7,  row: 1 },
    { key: 'mal',    label: 'MAL',    width: 50, visible: false, order: 8,  row: 1 },
    { key: 'ydo',    label: 'YDO',    width: 50, visible: false, order: 9,  row: 1 },
    { key: 'mdo',    label: 'MDO',    width: 50, visible: false, order: 10, row: 1 },
  ]
  // Note: crewName is no longer a column — it is rendered as bottomRowKey spanning the full row 2 strip.
  ```

- [ ] **Step 2: Add localStorage migration guard in `loadFromStorage`**

  The current `loadFromStorage` (lines 112-129) replaces roster columns wholesale from storage. If the user has an old config that contains `crewName` as a column key, it must be reset to defaults to avoid a ghost column.

  Replace the `loadFromStorage` function body with:

  ```typescript
  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColumnMap>
        const defaults = getDefaultColumns()

        // Migration: if stored roster columns still contain 'crewName', they are stale — reset to defaults.
        const isStaleRoster = (cols: ColumnConfig[] | undefined) =>
          cols?.some((c) => c.key === 'crewName') ?? false

        const merged: ColumnMap = {
          'roster-main': isStaleRoster(parsed['roster-main']) ? defaults['roster-main'] : (parsed['roster-main'] ?? defaults['roster-main']),
          'roster-sub':  isStaleRoster(parsed['roster-sub'])  ? defaults['roster-sub']  : (parsed['roster-sub']  ?? defaults['roster-sub']),
          'pairing': parsed['pairing'] ?? defaults['pairing'],
          'flight':  parsed['flight']  ?? defaults['flight'],
        }
        set({ columns: merged })
      }
    } catch {
      // Ignore corrupt localStorage data
    }
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 4: Commit**

  ```bash
  git add gantt/src/stores/column-store.ts
  git commit -m "feat(gantt): update roster column config — fleet/ybh to row 1, remove crewName column, add migration guard"
  ```

---

## Task 6: Roster Pane — viewportLeftDate + date-effective panel rows + bottomRowKey prop

**Files:**
- Modify: `gantt/src/components/panes/roster-pane.tsx`

- [ ] **Step 1: Add `startOfDay` import**

  In the import block at line 1, add `startOfDay` from `date-fns`:

  ```typescript
  import { startOfDay } from 'date-fns'
  ```

  Also add `getAllEffective` from the new utility:

  ```typescript
  import { getAllEffective } from '@/utils/crew-history'
  ```

- [ ] **Step 2: Derive `viewportLeftDate` from scroll state**

  The component already has `useGanttViewStore` and `usePaneStore` imported and used. Add this derived state inside the component body, after the existing store subscriptions and before the `unsortedPanelRows` memo:

  ```typescript
  // Derive the leftmost visible date for date-effective header data.
  // Truncate to start-of-day so panel rows only recompute when the date changes (not every scroll pixel).
  const scrollX    = useGanttViewStore((s) => s.scrollX)
  const pxPerHour  = useGanttViewStore((s) => s.pxPerHour)
  const rangeStart = usePaneStore((s) => s.dateRange.start)

  const viewportLeftDate = useMemo(
    () => startOfDay(xToTime(scrollX, rangeStart, pxPerHour)),
    [scrollX, pxPerHour, rangeStart],
  )
  ```

- [ ] **Step 3: Replace panel row derivation to use date-effective history**

  Replace the `unsortedPanelRows` memo (lines 200-232). The new version uses `crew.ranks`, `crew.bases`, `crew.fleets` with `getAllEffective` and adds `viewportLeftDate` as a dependency:

  ```typescript
  const unsortedPanelRows = useMemo((): PanelRowData[] => {
    return selectedCrewIds.map((cid) => {
      const crew = crewDetailMap.get(cid)
      const crewItems = items.filter((i) => i.crewId === cid)

      let maxSev = 0
      for (const item of crewItems) {
        const s = violationMap.get(item.id) ?? 0
        if (s > maxSev) maxSev = s
      }

      const firstItem = crewItems[0]

      const rank = crew?.ranks
        ? getAllEffective(crew.ranks, viewportLeftDate).map((r) => r.rank).join(' | ') || ''
        : (firstItem?.actingRank ?? '')

      const base = crew?.bases
        ? getAllEffective(crew.bases, viewportLeftDate).map((b) => b.base).join(' | ') || ''
        : (firstItem?.base ?? '')

      const fleet = crew?.fleets
        ? getAllEffective(crew.fleets, viewportLeftDate).map((f) => f.fleetSpecific).join(' | ') || ''
        : ''

      const crewName = crew
        ? [crew.firstName, crew.middleName, crew.lastName].filter(Boolean).join(' ')
        : cid

      return {
        rowId: cid,
        values: {
          crewId: cid,
          rank,
          base,
          fleet,
          crewName,
          ybh: firstItem?.ybh != null ? String(firstItem.ybh) : '',
          mbh: firstItem?.mbh != null ? String(firstItem.mbh) : '',
          yal: firstItem?.yal != null ? String(firstItem.yal) : '',
          mal: firstItem?.mal != null ? String(firstItem.mal) : '',
          ydo: firstItem?.ydo != null ? String(firstItem.ydo) : '',
          mdo: firstItem?.mdo != null ? String(firstItem.mdo) : '',
        },
        maxViolationSeverity: maxSev,
      }
    })
  }, [selectedCrewIds, crewDetailMap, viewportLeftDate, items, violationMap])
  ```

- [ ] **Step 4: Pass `bottomRowKey='crewName'` to PaneHeaderCanvas**

  Find the `<PaneHeaderCanvas` JSX block (line ~595). Add the `bottomRowKey` prop:

  ```tsx
  <PaneHeaderCanvas
    paneId={paneId}
    paneType={legacyPaneType}
    columns={columns}
    rows={reorderedPanelRows}
    frozenRowCount={frozenRowCount}
    selectedRowIndices={selectedRowIndices}
    sortColumn={sortColumn}
    sortDirection={sortDirection}
    onColumnHeaderClick={handleColumnHeaderClick}
    onColumnWidthChange={handleColumnWidthChange}
    onWheel={handleHeaderWheel}
    onRowRightClick={(ri, cx, cy) => {
      const mockTask = { id: -1, crewId: reorderedCrewIds[ri] ?? '' } as RosterItem
      openContextMenu(cx, cy, mockTask, legacyPaneType, ri)
    }}
    onRowClick={(ri, ctrlKey, shiftKey) => {
      const rowId = reorderedCrewIds[ri]
      if (!rowId) return
      if (shiftKey) selectRowRange(legacyPaneType, rowId, reorderedCrewIds)
      else if (ctrlKey) toggleRowSelection(legacyPaneType, rowId)
      else selectRow(legacyPaneType, rowId)
      useGanttViewStore.getState().markDirty()
    }}
    onUnfreezeRow={(rowId) => {
      unfreezeRow(legacyPaneType, rowId)
      useGanttViewStore.getState().markDirty()
    }}
    onViolationHover={(rowId, cx, cy) => {
      setHoveredCrew(rowId, cx, cy)
    }}
    bottomRowKey="crewName"
  />
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 6: Run all gantt tests**

  ```bash
  cd /home/yuan.z/rois/rois-ai/gantt && npm run test
  ```

  Expected: All tests pass (crew-history + existing tests).

- [ ] **Step 7: Commit**

  ```bash
  git add gantt/src/components/panes/roster-pane.tsx
  git commit -m "feat(gantt): roster pane header — date-effective rank/base/fleet, full name spanning row"
  ```

---

## Task 7: Final push

- [ ] **Step 1: Push all commits**

  ```bash
  git push
  ```

- [ ] **Step 2: Manual smoke test**

  Start the dev servers:
  ```bash
  # Terminal 1
  cd /home/yuan.z/rois/rois-ai/live-server && npm run dev

  # Terminal 2
  cd /home/yuan.z/rois/rois-ai/gantt && npm run dev
  ```

  Open http://localhost:5173 and verify:

  1. Roster Pane left panel shows Rank and Base (from DB history, not task data)
  2. Fleet column is populated (no longer empty)
  3. Crew name appears in a spanning bottom strip (italic text spanning full panel width)
  4. Scrolling the timeline left/right changes Rank/Base/Fleet values when crew history spans multiple date ranges
  5. Frozen rows still render correctly with the amber left border
  6. Selected rows still highlight
  7. Pairing Pane is unaffected (still shows Comp in bottom row, same as before)
  8. Column config gear button: crewName no longer appears as a toggleable column
