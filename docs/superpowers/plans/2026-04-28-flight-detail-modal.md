# Flight Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build display-only Flight Detail Modal that shows flight info and crew assignments when double-clicking a flight block.

**Architecture:** Backend adds crew list endpoint to live-server flight module; Frontend adds dialog component using @rois/ui Dialog pattern, triggered from FlightPane double-click.

**Tech Stack:** Fastify + Drizzle ORM (backend), React + Zustand + @rois/ui Dialog (frontend)

---

## File Structure

### Backend (live-server)
- **Modify:** `src/services/flight/flight-service.ts` — Add `getCrewList()` method
- **Modify:** `src/routes/flight/flight.ts` — Add `GET /:id/crew` endpoint

### Frontend (gantt)
- **Modify:** `src/types/flight.ts` — Add crew response types
- **Modify:** `src/stores/ui-store.ts` — Add dialog state
- **Modify:** `src/services/flight-api.ts` — Add `getCrewList()` method
- **Create:** `src/components/flight/flight-detail-dialog.tsx` — Modal component
- **Modify:** `src/components/panes/flight-pane.tsx` — Trigger on double-click
- **Modify:** `src/App.tsx` — Add dialog to app root

---

## Task 1: Backend — Add Crew List Service Method

**Files:**
- Modify: `live-server/src/services/flight/flight-service.ts`

- [ ] **Step 1: Add getCrewList method to flight-service.ts**

Add the following method after `batchImport`:

```typescript
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { crew } from '../../models/crew/crew.js'
import { sql } from 'drizzle-orm'

// Add to flightService object:

async getCrewList(fastify: FastifyInstance, flightId: number) {
  return getOrSet(fastify.redis, `${CACHE_PREFIX}:crew:${flightId}`, CACHE_TTL, async () => {
    // Query crew assignments
    const assignments = await fastify.db
      .select({
        seqOrder: rosterFlight.seqOrder,
        crewId: rosterFlight.crewId,
        crewName: sql<string>`concat_ws(' ', ${crew.lastName}, ${crew.firstName})`,
        crewRank: rosterFlight.actingRank,
        actingRank: rosterFlight.actingRank,
        label: rosterFlight.label,
        source: rosterFlight.source,
        mbhMinutes: rosterFlight.schCreditedMinutes,
      })
      .from(rosterFlight)
      .innerJoin(crew, eq(rosterFlight.crewId, crew.crewId))
      .where(and(
        eq(rosterFlight.fltId, flightId),
        notDeleted(rosterFlight.isDeleted),
      ))
      .orderBy(asc(rosterFlight.seqOrder))

    // Query composition plan
    const compositions = await fastify.db
      .select({
        division: flightComposition.division,
        actingRank: flightComposition.actingRank,
        planValue: flightComposition.planValue,
      })
      .from(flightComposition)
      .where(eq(flightComposition.fltId, flightId))

    // Build composition map
    const compMap: Record<string, { plan: number; actual: number }> = {
      CA: { plan: 0, actual: 0 },
      FO: { plan: 0, actual: 0 },
      PU: { plan: 0, actual: 0 },
      FA: { plan: 0, actual: 0 },
    }

    for (const c of compositions) {
      if (c.actingRank && compMap[c.actingRank]) {
        compMap[c.actingRank].plan = c.planValue ?? 0
      }
    }

    for (const a of assignments) {
      if (a.actingRank && compMap[a.actingRank]) {
        compMap[a.actingRank].actual++
      }
    }

    // Determine status
    const isFull = Object.values(compMap).every(c => c.actual >= c.plan)
    const isPartial = Object.values(compMap).some(c => c.actual < c.plan && c.plan > 0)
    const status: 'full' | 'partial' | 'cancelled' = isFull ? 'full' : isPartial ? 'partial' : 'cancelled'

    // Format items
    const items = assignments.map(a => ({
      seqOrder: a.seqOrder ?? 0,
      crewId: a.crewId,
      crewName: a.crewName ?? '',
      crewRank: a.crewRank ?? '',
      actingRank: a.actingRank ?? '',
      label: a.label ?? '',
      source: (a.source as 'SYSTEM' | 'IMPORT' | 'MANUAL') ?? 'SYSTEM',
      mbh: formatMinutes(a.mbhMinutes),
      mfdp: null as string | null,
    }))

    return {
      items,
      composition: compMap,
      status,
    }
  }),
```

Add helper function at top of file:

```typescript
function formatMinutes(minutes: number | string | null): string {
  if (!minutes) return '0:00'
  const num = Number(minutes)
  if (isNaN(num)) return '0:00'
  const hours = Math.floor(num / 60)
  const mins = Math.round(num % 60)
  return `${hours}:${mins.toString().padStart(2, '0')}`
}
```

Add imports at top:

```typescript
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { crew } from '../../models/crew/crew.js'
```

- [ ] **Step 2: Commit backend service changes**

```bash
git add live-server/src/services/flight/flight-service.ts
git commit -m "feat(live-server): add getCrewList service method for flight crew assignments"
```

---

## Task 2: Backend — Add Crew List Endpoint

**Files:**
- Modify: `live-server/src/routes/flight/flight.ts`

- [ ] **Step 1: Add GET /:id/crew endpoint to flight routes**

Add after the existing `GET /:id` route (around line 43):

```typescript
// GET /api/flight/:id/crew — crew assignments for flight detail
fastify.get('/:id/crew', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) {
    return fail(reply, 400, 'Invalid id')
  }

  const result = await flightService.getCrewList(fastify, numId)
  return success(reply, result)
})
```

- [ ] **Step 2: Commit backend route changes**

```bash
git add live-server/src/routes/flight/flight.ts
git commit -m "feat(live-server): add GET /api/flight/:id/crew endpoint"
```

---

## Task 3: Frontend — Add Crew Types

**Files:**
- Modify: `gantt/src/types/flight.ts`

- [ ] **Step 1: Add crew response types to flight.ts**

Add at the end of `flight.ts`:

```typescript
/** Crew assignment item for flight detail modal */
export interface FlightCrewItem {
  seqOrder: number
  crewId: string
  crewName: string
  crewRank: string
  actingRank: string
  label: string
  source: 'SYSTEM' | 'IMPORT' | 'MANUAL'
  mbh: string
  mfdp: string | null
}

/** Composition counts for flight */
export interface FlightCompositionCounts {
  plan: number
  actual: number
}

export interface FlightComposition {
  CA: FlightCompositionCounts
  FO: FlightCompositionCounts
  PU: FlightCompositionCounts
  FA: FlightCompositionCounts
}

/** Flight crew API response */
export interface FlightCrewResponse {
  items: FlightCrewItem[]
  composition: FlightComposition
  status: 'full' | 'partial' | 'cancelled'
}
```

- [ ] **Step 2: Update types/index.ts to export new types**

Modify `gantt/src/types/index.ts` line 5 to include new exports:

```typescript
export type { Flight, FlightItem, FlightCompositionStatus, FlightListQuery, FlightListResponse, FlightFilters, FlightQuerySession, FlightCrewItem, FlightCompositionCounts, FlightComposition, FlightCrewResponse } from './flight'
```

- [ ] **Step 3: Commit frontend type changes**

```bash
git add gantt/src/types/flight.ts gantt/src/types/index.ts
git commit -m "feat(gantt): add FlightCrewResponse types for flight detail modal"
```

---

## Task 4: Frontend — Add UI Store State

**Files:**
- Modify: `gantt/src/stores/ui-store.ts`

- [ ] **Step 1: Add flightDetailOpen and flightDetailId to UiStore interface**

Add to interface (after `shortcutsOpen` section, around line 36):

```typescript
/** Flight detail dialog */
flightDetailOpen: boolean
flightDetailId: number | null
openFlightDetail: (id: number) => void
closeFlightDetail: () => void
```

- [ ] **Step 2: Add state and actions to store implementation**

Add to the create() function (after `closeAddPaneMenu`):

```typescript
// State
flightDetailOpen: false,
flightDetailId: null,

// Actions (add after closeAddPaneMenu function)
openFlightDetail: (id) => set({ flightDetailOpen: true, flightDetailId: id }),
closeFlightDetail: () => set({ flightDetailOpen: false, flightDetailId: null }),
```

- [ ] **Step 3: Commit UI store changes**

```bash
git add gantt/src/stores/ui-store.ts
git commit -m "feat(gantt): add flightDetailOpen state to ui-store"
```

---

## Task 5: Frontend — Add API Method

**Files:**
- Modify: `gantt/src/services/flight-api.ts`

- [ ] **Step 1: Add getCrewList method to flight-api.ts**

Add import at top:

```typescript
import type { FlightListQuery, FlightListResponse, FlightCrewResponse } from '@/types'
```

Add method after `assignToCrew`:

```typescript
/** Get crew assignment list for a flight */
async getCrewList(id: number): Promise<FlightCrewResponse> {
  return api.get(`/api/flight/${id}/crew`) as Promise<FlightCrewResponse>
}
```

- [ ] **Step 2: Commit API changes**

```bash
git add gantt/src/services/flight-api.ts
git commit -m "feat(gantt): add getCrewList method to flight-api"
```

---

## Task 6: Frontend — Create Flight Detail Dialog Component

**Files:**
- Create: `gantt/src/components/flight/flight-detail-dialog.tsx`

- [ ] **Step 1: Create flight-detail-dialog.tsx**

```typescript
import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Badge, Card,
} from '@rois/ui'
import { Plane, Clock, Users, X } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { flightApi } from '@/services/flight-api'
import type { Flight, FlightCrewResponse, FlightCrewItem } from '@/types'
import { format } from 'date-fns'

const RANK_COLORS: Record<string, string> = {
  CA: 'bg-blue-500/15 text-blue-600 border-blue-500/25',
  FO: 'bg-purple-500/15 text-purple-600 border-purple-500/25',
  PU: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/25',
  FA: 'bg-orange-500/15 text-orange-600 border-orange-500/25',
}

const SOURCE_COLORS: Record<string, string> = {
  SYSTEM: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  IMPORT: 'bg-green-500/10 text-green-600 border-green-500/20',
  MANUAL: 'bg-amber-500/10 text-amber-600 border-amber-500/25',
}

export const FlightDetailDialog = () => {
  const open = useUiStore((s) => s.flightDetailOpen)
  const flightId = useUiStore((s) => s.flightDetailId)
  const closeFlightDetail = useUiStore((s) => s.closeFlightDetail)

  const [flight, setFlight] = useState<Flight | null>(null)
  const [crewData, setCrewData] = useState<FlightCrewResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && flightId) {
      setLoading(true)
      Promise.all([
        flightApi.getById(flightId),
        flightApi.getCrewList(flightId),
      ])
        .then(([f, c]) => {
          setFlight(f)
          setCrewData(c)
        })
        .finally(() => setLoading(false))
    } else {
      setFlight(null)
      setCrewData(null)
    }
  }, [open, flightId])

  if (!open || !flight) return null

  const statusBadge = crewData?.status === 'full'
    ? <Badge className="bg-green-500/12 text-green-600 border-green-500/25"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />Full</Badge>
    : crewData?.status === 'partial'
    ? <Badge className="bg-amber-500/12 text-amber-600 border-amber-500/25"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />Partial</Badge>
    : <Badge className="bg-red-500/12 text-red-600 border-red-500/25"><span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />Cancelled</Badge>

  const typeBadge = flight.fltType
    ? <Badge className="bg-sky-500/10 text-sky-600 border-sky-500/20">{flight.fltType}</Badge>
    : null

  const formatTime = (dt: string | null, tz?: string) => {
    if (!dt) return <span className="text-muted-foreground">—</span>
    const d = new Date(dt)
    return `${format(d, 'HH:mm')} UTC`
  }

  const formatTimeWithDelta = (scheduled: string, actual: string | null) => {
    if (!actual) return { time: <span className="text-muted-foreground">—</span>, delta: null }
    const schedDate = new Date(scheduled)
    const actDate = new Date(actual)
    const deltaMins = Math.round((actDate.getTime() - schedDate.getTime()) / 60000)
    const timeStr = format(actDate, 'HH:mm') + ' UTC'
    const timeEl = <span className="text-green-600">{timeStr}</span>
    if (deltaMins === 0) return { time: timeEl, delta: null }
    const deltaStr = deltaMins > 0 ? `+${deltaMins}m` : `${deltaMins}m`
    const deltaClass = deltaMins > 0 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'
    return {
      time: timeEl,
      delta: <span className={`px-1 rounded text-xs font-mono ${deltaClass}`}>{deltaStr}</span>,
    }
  }

  const bh = flight.blkMin ? `${Math.floor(flight.blkMin / 60)}:${(flight.blkMin % 60).toString().padStart(2, '0')}` : '0:00'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeFlightDetail()}>
      <DialogContent className="max-w-[860px] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 h-[52px] bg-muted/50 border-b">
          <div className="w-[30px] h-[30px] rounded bg-primary/10 border border-primary flex items-center justify-center text-primary">
            <Plane className="w-4 h-4" />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="font-mono text-xs font-medium text-primary bg-primary/10 border border-primary/25 px-1.5 rounded-[3px] leading-relaxed">
                #{flight.id}
              </span>
              <span className="font-bold">{flight.airline} {flight.fltNum}</span>
              <span className="text-xs text-muted-foreground">{flight.fltDt}</span>
              {statusBadge}
              {typeBadge}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Flight Composition: {crewData ? Object.entries(crewData.composition).map(([r, c]) => `${r}×${c.actual}`).join(' / ') : '—'}</span>
              <span className="text-border">|</span>
              <span>Roster · Live</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={closeFlightDetail}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-col overflow-auto max-h-[480px]">
          {/* Route Banner */}
          <div className="px-4 pb-3.5">
            <div className="flex items-center bg-muted/30 border rounded-md p-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
              <div className="flex flex-col items-center gap-0.5 z-10">
                <span className="font-mono text-[22px] font-bold tracking-wide">{flight.depArp}</span>
                <span className="text-[10px] text-muted-foreground">Departure</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-1 z-10 px-4">
                <span className="font-mono text-sm font-bold text-primary tracking-wide">{flight.airline} {flight.fltNum}</span>
                <div className="flex items-center w-full text-muted-foreground/50">
                  <span className="flex-1 h-px bg-current opacity-40" />
                  <span className="mx-1">→</span>
                  <span className="flex-1 h-px bg-current opacity-40" />
                </div>
                <span className="text-[10px] text-muted-foreground">{flight.fleet} · {flight.register ?? '—'}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 z-10">
                <span className="font-mono text-[22px] font-bold tracking-wide">{flight.arvArp}</span>
                <span className="text-[10px] text-muted-foreground">Arrival</span>
              </div>
              <div className="w-px bg-border self-stretch mx-4" />
              <div className="flex flex-col items-end gap-1.5 z-10">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Fleet</span>
                  <span className="font-mono text-xs font-semibold bg-muted px-1.5 rounded-[3px] border">{flight.fleet}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Reg</span>
                  <span className="font-mono text-xs font-semibold bg-muted px-1.5 rounded-[3px] border">{flight.register ?? '—'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Airline</span>
                  <span className="font-mono text-xs font-semibold bg-muted px-1.5 rounded-[3px] border">{flight.airline}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Times Grid */}
          <div className="px-4 pb-3.5">
            <div className="grid grid-cols-[1fr_1px_1fr] gap-0">
              {/* Departure */}
              <div className="pr-1">
                <div className="flex items-center gap-1.5 mb-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Departure — {flight.depArp}
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">STD</span>
                  <span className="font-mono text-xs font-medium">{formatTime(flight.schDepDtUtc)}</span>
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">ETD</span>
                  <span className="font-mono text-xs font-medium text-amber-600">{formatTime(flight.actDepDtUtc)}</span>
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">ATD</span>
                  {flight.actDepDtUtc ? (
                    <>
                      <span className="font-mono text-xs font-medium text-green-600">{format(new Date(flight.actDepDtUtc), 'HH:mm')} UTC</span>
                      {flight.schDepDtUtc && (() => {
                        const delta = Math.round((new Date(flight.actDepDtUtc).getTime() - new Date(flight.schDepDtUtc).getTime()) / 60000)
                        if (delta === 0) return null
                        const cls = delta > 0 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'
                        return <span className={`px-1 rounded text-[10px] font-mono ${cls}`}>{delta > 0 ? `+${delta}m` : `${delta}m`}</span>
                      })()}
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div className="bg-border" />
              {/* Arrival */}
              <div className="pl-3">
                <div className="flex items-center gap-1.5 mb-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Arrival — {flight.arvArp}
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">STA</span>
                  <span className="font-mono text-xs font-medium">{formatTime(flight.schArvDtUtc)}</span>
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">ETA</span>
                  <span className="font-mono text-xs font-medium text-muted-foreground">—</span>
                </div>
                <div className="flex items-center h-7 px-1.5 rounded-[3px] gap-2 hover:bg-muted/30">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-8">ATA</span>
                  <span className="font-mono text-xs font-medium text-muted-foreground">—</span>
                </div>
              </div>
            </div>
            {/* Duration Row */}
            <div className="flex items-center mt-3 pt-2.5 border-t">
              <div className="flex-1 flex flex-col items-center gap-1 py-2 border-r">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Block Hours</span>
                <span className="font-mono text-xl font-bold">{bh}</span>
                <span className="text-[9px] text-muted-foreground">BH</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 py-2 border-r">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Flight Date</span>
                <span className="font-mono text-[15px] font-bold">{flight.fltDt ? format(new Date(flight.fltDt), 'MMM dd') : '—'}</span>
                <span className="text-[9px] text-muted-foreground">{flight.fltDt ? format(new Date(flight.fltDt), 'yyyy') : ''}</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 py-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
                {flight.isCancelled ? (
                  <Badge className="bg-red-500/12 text-red-600 border-red-500/25 text-xs px-2.5 py-1">Cancelled</Badge>
                ) : (
                  <Badge className="bg-green-500/12 text-green-600 border-green-500/25 text-xs px-2.5 py-1">Scheduled</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Composition Cards */}
          <div className="px-4 pb-3.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              Flight Composition
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {crewData && Object.entries(crewData.composition).map(([rank, counts]) => (
                <Card key={rank} className="flex flex-col items-center gap-1 p-2 px-3.5 bg-muted/30 min-w-[80px]">
                  <span className={`font-mono text-xs font-bold tracking-wide ${RANK_COLORS[rank]?.split(' ')[1] ?? 'text-muted-foreground'}`}>{rank}</span>
                  <div className="flex items-center gap-1 font-mono text-xs">
                    <span className={counts.actual < counts.plan ? 'font-bold text-red-600' : 'font-bold'}>{counts.actual}</span>
                    <span className="text-muted-foreground text-[10px]">/ {counts.plan}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Crew Table */}
          <div className="border-t">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground pt-3 px-4 mb-2 flex items-center gap-2">
              Crew Assignment
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="overflow-auto max-h-[260px]">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-2 bg-muted/50">
                  <tr className="border-b">
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center w-9">Seq</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[90px]">Crew ID</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground min-w-[110px]">Name</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[72px]">Rank</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[72px]">Acting</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground min-w-[100px]">Label</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[72px]">Source</th>
                    <th className="py-1.5 px-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[64px] text-right">MBH</th>
                  </tr>
                </thead>
                <tbody>
                  {crewData?.items.map((crew) => (
                    <tr key={crew.crewId} className="border-b border-border/50 even:bg-muted/10 hover:bg-muted/30">
                      <td className="py-2 px-2.5 text-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted border text-[10px] font-mono font-semibold text-muted-foreground">
                          {crew.seqOrder}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-xs font-semibold text-muted-foreground">{crew.crewId}</td>
                      <td className="py-2 px-2.5 font-medium">{crew.crewName}</td>
                      <td className="py-2 px-2.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wide border ${RANK_COLORS[crew.crewRank] ?? 'bg-muted text-muted-foreground border'}`}>
                          {crew.crewRank}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wide border ${RANK_COLORS[crew.actingRank] ?? 'bg-muted text-muted-foreground border'}`}>
                          {crew.actingRank}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {crew.label}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wide border ${SOURCE_COLORS[crew.source] ?? 'bg-muted text-muted-foreground border'}`}>
                          {crew.source}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-xs font-medium text-muted-foreground text-right">{crew.mbh}</td>
                    </tr>
                  ))}
                  {/* Unfilled slots */}
                  {crewData && Object.entries(crewData.composition)
                    .filter(([rank, counts]) => counts.actual < counts.plan && counts.plan > 0)
                    .map(([rank, counts]) => (
                      <tr key={`missing-${rank}`} className="border-b border-border/50">
                        <td className="py-2 px-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-transparent border border-dashed text-muted-foreground text-xs">—</span>
                        </td>
                        <td colSpan={7} className="py-2 px-2.5 text-muted-foreground italic">
                          <span className="text-xs text-red-600/70">▲ {counts.plan - counts.actual} position unfilled ({rank} required)</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/50">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
            <Clock className="w-3 h-3" />
            Updated {format(new Date(), 'yyyy-MM-dd HH:mm')} UTC · {crewData?.items.length ?? 0} crew / {crewData ? Object.values(crewData.composition).reduce((s, c) => s + c.plan, 0) : 0} slots
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={closeFlightDetail}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit dialog component**

```bash
git add gantt/src/components/flight/flight-detail-dialog.tsx
git commit -m "feat(gantt): create FlightDetailDialog component"
```

---

## Task 7: Frontend — Integrate Double-Click Trigger

**Files:**
- Modify: `gantt/src/components/panes/flight-pane.tsx`

- [ ] **Step 1: Update onItemDoubleClick in flight-pane.tsx**

Find the `interactionCallbacks` useMemo (around line 241) and update `onItemDoubleClick`:

Change from:
```typescript
onItemDoubleClick: () => { /* Flight detail dialog TBD */ },
```

To:
```typescript
onItemDoubleClick: (hit) => {
  if (hit.itemId !== null) {
    useUiStore.getState().openFlightDetail(hit.itemId)
  }
},
```

- [ ] **Step 2: Commit flight-pane trigger**

```bash
git add gantt/src/components/panes/flight-pane.tsx
git commit -m "feat(gantt): add double-click trigger for FlightDetailDialog"
```

---

## Task 8: Frontend — Add Dialog to App

**Files:**
- Modify: `gantt/src/App.tsx`

- [ ] **Step 1: Import and add FlightDetailDialog to App.tsx**

Add import at top:

```typescript
import { FlightDetailDialog } from '@/components/flight/flight-detail-dialog'
```

Add dialog inside the authenticated app section (after `<SessionTimeoutDialog />`):

```typescript
{user ? (
  <>
    <AuthenticatedApp />
    <SessionTimeoutDialog />
    <FlightDetailDialog />
  </>
) : (
  <LoginPage />
)}
```

- [ ] **Step 2: Commit App integration**

```bash
git add gantt/src/App.tsx
git commit -m "feat(gantt): integrate FlightDetailDialog in App"
```

---

## Verification Steps

- [ ] **Step 1: Start backend server**

```bash
cd live-server && npm run dev
```

- [ ] **Step 2: Start frontend dev server**

```bash
cd gantt && npm run dev
```

- [ ] **Step 3: Test double-click trigger**

1. Open Gantt app at http://localhost:5173
2. Login with valid credentials
3. Navigate to Flight Pane
4. Double-click on any flight block
5. Verify Flight Detail Modal opens
6. Verify flight details display correctly
7. Verify crew list loads
8. Click Close button to dismiss

- [ ] **Step 4: Test API endpoint directly**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/flight/12345/crew
```

Expected response:
```json
{
  "code": 200,
  "data": {
    "items": [...],
    "composition": { "CA": { "plan": 2, "actual": 2 }, ... },
    "status": "full"
  },
  "message": "ok"
}
```

---

## Final Commit

- [ ] **Step 1: Create summary commit if needed**

If any uncommitted changes remain:
```bash
git status
git add -A
git commit -m "feat: complete Flight Detail Modal implementation"
```