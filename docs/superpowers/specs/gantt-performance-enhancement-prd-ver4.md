# PRD v4: Gantt Roster First-Paint Latency Suggestions

> Module: `gantt` frontend and `live-server` roster API  
> Date: 2026-05-30  
> User symptom: after opening Gantt, the Roster pane takes about 5-10 seconds before roster objects appear.  
> Scope: only new suggestions beyond v1/v2/v3. Do not re-propose compression, basic `itemsByCrew`, `parseIsoCached`, formatter cache, render buckets, `msToX`, append loadMore, or date-window progressive loading.

---

## 0. Latest Code Observations

The code has already enhanced several earlier items:

- `timezone-store.ts` now caches `Intl.DateTimeFormat` and formatted time strings.
- `gantt-utils.ts` now has `parseIsoMs` and `msToX`.
- `roster-pane.tsx` now builds `renderBuckets`.
- `roster-store.appendRoster` no longer flips the main loading flag.
- `gantt-view-store.refreshAllPanes` now does date-window progressive roster load for long date ranges.

However, first objects can still be late because initial open still has this critical path:

1. `use-gantt-viewport.ts` fetches crew list.
2. Crew list returns relatively rich crew records with histories.
3. `refreshAllPanes()` asks roster API for selected crew ids.
4. Roster API returns only after full DB query, JSON serialization, network transfer, browser JSON parse, Axios envelope unwrap, and store update.
5. React then builds memoized render structures before the canvas can show objects.
6. Rule check is scheduled soon after data load and may compete with first interactive work.

The v4 suggestions target this first-paint chain.

---

## 1. Priority Queue

### P0-1: Explicit Roster SQL Projection Instead Of `roster: rosterFlight`

**Performance class:** backend DB row width, Node serialization, network payload  
**Expected improvement:** high if `roster_flight` has many unused columns.

**Current evidence**

`live-server/src/services/roster/roster-service.ts` selects:

```ts
roster: rosterFlight
```

Then it maps a smaller DTO after the DB already sent all roster columns to Node. The DTO trim reduces response payload, but not DB-to-Node row width or object construction cost.

**Recommendation**

Replace `roster: rosterFlight` with explicit selected columns actually needed by Gantt:

- ids and grouping: `id`, `crew_id`, `pairing_id`, `duty_seq`, `seg_seq`;
- display: `base`, `label`, `assignment_group`, `assignment`, `division`, `acting_rank`, `active_rank`, `comments`, `source`;
- times: `sch_str_dt_utc`, `sch_end_dt_utc`, `act_str_dt_utc`, `act_end_dt_utc`, `act_rest_min`;
- fallback identity: `flt_id`, `flt_dt`.

Keep duty fields from `pairing_segment` explicit as they are now.

**Acceptance**

- SQL select no longer requests all `roster_flight` columns.
- `/api/roster` cold response TTFB and Node heap allocation improve.
- Returned DTO remains byte-for-byte equivalent for fields Gantt uses.

---

### P0-2: First-Paint Roster Bootstrap Endpoint

**Performance class:** first interactive paint, request count, payload shape  
**Expected improvement:** high for the 5-10s "blank roster objects" symptom.

**Current problem**

Initial open currently needs crew list first, then roster list. Crew list includes rich history fields, while roster fetch separately uses selected crew ids. Roster objects cannot appear until both phases complete.

**Recommendation**

Add a dedicated first-paint endpoint:

```http
POST /api/gantt/bootstrap-roster
```

Request:

```json
{
  "dateRange": { "start": "2026-05-01", "end": "2026-06-30" },
  "crewPage": { "page": 1, "pageSize": 100 },
  "visibleDateRange": { "start": "2026-05-01", "end": "2026-05-10" },
  "filters": {}
}
```

Response:

```ts
interface GanttRosterBootstrapResponse {
  crewRows: SlimCrewPanelRow[]
  rosterItems: RosterItem[]
  totalCrew: number
  hasMoreCrew: boolean
  loadToken: string
}
```

This endpoint should return only the first panel rows plus roster objects needed for immediate first paint. Background calls can then load the remaining date range and later crew pages.

**Why this is new**

Earlier PRDs suggested progressive roster loading. This is more specific: collapse crew-list and first roster fetch into one bootstrap response so the Roster pane can paint without waiting on two separate full workflows.

**Acceptance**

- Roster pane can paint first objects from one bootstrap response.
- Existing crew store can still be hydrated from `crewRows`.
- Current `/api/crew` and `/api/roster` remain available for normal follow-up operations.

---

### P0-3: First Request Should Use Actual Visible Time Window, Not Fixed Days

**Performance class:** initial payload size and DB work  
**Expected improvement:** high when zoomed in or on narrow screens.

**Current problem**

Current progressive loading appears date-window based. That is better than loading the full range first, but it may still fetch more than the viewport needs.

**Recommendation**

At first canvas measurement, compute:

```ts
visibleStart = xToTime(scrollX, dateRange.start, pxPerHour)
visibleEnd = xToTime(scrollX + canvasWidth, dateRange.start, pxPerHour)
overscanStart = visibleStart - 1 day
overscanEnd = visibleEnd + 1 day
```

Use that for first roster object request. Then backfill the rest of the selected date range in background.

**Acceptance**

- First roster request covers actual visible time plus overscan.
- At wide zoom, it may load more days; at narrow zoom, it loads fewer.
- Initial object paint time improves compared with fixed-window first load.

---

### P0-4: Move Roster Normalization And Render Index Build Off Main Thread

**Performance class:** browser main-thread blocking after response arrives  
**Expected improvement:** high if Network shows response finished before objects appear.

**Current problem**

After roster data arrives, React/Zustand update triggers memo work in `RosterPane`: `itemsByCrew`, `taskById`, `renderBuckets`, panel rows, violation maps, lock maps, reordered rows. If payload is large, the browser can finish the network request but still show no objects while main-thread JS builds indexes.

**Recommendation**

Use a Web Worker for roster first-paint preparation:

Input:

```ts
{ rosterItems, crewRows, selectedCrewIds, dateRange }
```

Worker output:

```ts
{
  normalizedItems,
  itemsByCrewSerializable,
  taskByIdSerializable,
  renderBucketsSerializable,
  panelRowsBase
}
```

For first paint, the UI can render from the worker-produced structure. Keep mutation operations on main thread, but rebuild derived render indexes in worker after large fetches.

**Acceptance**

- Main-thread long tasks after `/api/roster` response are reduced.
- Canvas can show objects earlier, even while full background indexes continue.
- Worker has no access to secrets and only receives roster/crew data already in memory.

---

### P1-1: Defer Rule Check Until After First Roster Paint And Idle

**Performance class:** first-paint contention, backend/network contention  
**Expected improvement:** medium to high if rule check starts during initial rendering.

**Current evidence**

`refreshAllPanes()` schedules:

```ts
setTimeout(() => {
  useRuleCheckStore.getState().checkCrews(selectedCrewIds, items)
}, ...)
```

This happens soon after data load. Even if delayed by a timeout, it can compete with first canvas paint, background roster append, and Pairing/Flight loads.

**Recommendation**

Gate rule check behind first paint:

1. Roster first object paint publishes `roster:first-painted`.
2. Schedule rule check with `requestIdleCallback`, or a minimum delay after first paint.
3. Limit first rule check to visible crew/date window.
4. Run full selected range rule check after background roster load completes.

**Acceptance**

- First roster objects appear before rule-check API activity starts.
- Rule badges may appear later but roster blocks are visible sooner.
- User interactions remain responsive during first paint.

---

### P1-2: Lazy Crew History Loading For Roster Panel

**Performance class:** initial crew API latency and payload  
**Expected improvement:** medium to high if `/api/crew` is part of the 5-10s chain.

**Current evidence**

`crew-service.ts` fetches full rank/base/fleet history rows for returned crews. The Roster panel mostly needs current/effective rank, base, fleet, and display name for first paint.

**Recommendation**

Add a slim crew list mode:

```http
GET /api/crew?view=gantt-panel&page=1&pageSize=100
```

Return:

```ts
{
  crewId,
  firstName,
  middleName,
  lastName,
  division,
  currentRank,
  currentBase,
  currentFleet,
  qualsSummary
}
```

Load full histories only when:

- user opens crew detail;
- date-effective header requires a non-current date;
- first paint is complete and browser is idle.

**Acceptance**

- Initial crew response is much smaller.
- Roster left panel still displays useful first-paint values.
- Full history behavior remains available after lazy load.

---

### P1-3: Use POST Body For Large Roster Queries And Add Request Fingerprint

**Performance class:** reliability, duplicate work prevention, request cancellation  
**Expected improvement:** medium.

**Current problem**

`roster-api.ts` sends all crew ids in a comma-separated GET query. This is fragile as crew count grows and makes it harder to include first-paint options, request priority, visible window, and stale-response guards.

**Recommendation**

Add:

```http
POST /api/roster/query
```

Body:

```ts
{
  crewIds: string[]
  startDate: string
  endDate: string
  priority: 'first-paint' | 'background'
  requestId: string
}
```

Frontend should:

- attach `AbortController` to obsolete roster requests;
- ignore responses whose `requestId` is not the current roster load token;
- dedupe identical in-flight roster queries.

**Acceptance**

- No long roster GET query string.
- Changing filters/date range cancels or ignores stale roster loads.
- Duplicate initial refreshes do not create duplicate roster API work.

---

### P1-4: Send Roster Response In A Paint-Friendly Shape

**Performance class:** client parse and index build  
**Expected improvement:** medium.

**Current problem**

The server sends a flat array. The client then groups by crew and builds render buckets before painting.

**Recommendation**

For first-paint/bootstrap endpoints, return grouped data:

```ts
interface RosterByCrewResponse {
  crewOrder: string[]
  byCrew: Record<string, RosterItem[]>
}
```

Optionally sort each crew bucket server-side by scheduled start time so the client can skip first-paint sorting.

This should be limited to the first-paint endpoint or controlled by `shape=byCrew` to avoid breaking existing consumers.

**Acceptance**

- First-paint client grouping cost is reduced.
- Existing flat `/api/roster` remains supported.

---

### P2-1: Instrument The Blank-Time Gap As Separate Phases

**Performance class:** diagnostics  
**Expected improvement:** indirect, required to avoid guessing.

**Recommendation**

Record these timings in the existing Gantt test hook:

- `gantt:open`;
- `crew:request:start/end`;
- `roster:first-request:start/end`;
- `roster:response-unwrapped`;
- `roster:store-set`;
- `roster:render-index-ready`;
- `roster:first-canvas-objects-painted`;
- `rule-check:first-start`.

The key metric is:

```text
blank_object_time = roster:first-canvas-objects-painted - gantt:open
```

Break it down into network, server, JSON parse, store/index build, and canvas paint.

**Acceptance**

- A Playwright or manual hook can report the phase breakdown.
- Future performance changes cite the phase they improved.

---

## 2. Suggested Execution Order

1. Add phase instrumentation first so the 5-10s blank interval is split into measurable buckets.
2. Implement explicit roster SQL projection.
3. Add slim crew panel mode or bootstrap endpoint.
4. Use actual visible time window for the first roster object request.
5. Defer rule check until after first roster paint.
6. Move large roster normalization/index build to a worker if main-thread phase remains high.
7. Convert large roster query from GET to POST with request cancellation/fingerprint.
8. Add grouped response shape for first-paint endpoint if client index build still dominates.

---

## 3. Non-Duplicates From v3

This v4 intentionally does not repeat:

- compression;
- chunked roster cache;
- generic progressive roster hydration;
- pane-scoped dirty state;
- render bucket construction;
- epoch-based render math;
- formatter cache;
- canvas gradient/paint optimizations;
- rubber-band optimization.

The focus here is specifically the first time roster objects become visible after opening Gantt.

