# PRD v5: Gantt Roster Load Performance Major Areas

> Module: `gantt` frontend and `live-server` roster/crew APIs  
> Date: 2026-05-30  
> Context: latest code pass after several previous performance enhancements were already implemented.  
> User symptom: opening Gantt still leaves the Roster pane waiting several seconds before roster objects appear.

---

## 0. Scope

This version only records major remaining performance areas found in the latest code pass.

Do not re-propose:

- HTTP compression;
- basic `itemsByCrew`;
- `parseIsoCached`;
- cached `Intl.DateTimeFormat`;
- `msToX`;
- roster render buckets;
- append loadMore;
- scroll debug log removal;
- generic progressive date-window loading.

---

## 1. Highest Priority Suggestions

### P0-1: Explicit Roster SQL Projection

**Area:** backend DB row width, Drizzle object creation, Node serialization  
**Expected impact:** high

**Current evidence**

`live-server/src/services/roster/roster-service.ts` still selects the full roster row:

```ts
roster: rosterFlight
```

The code then maps a smaller DTO. This reduces response payload, but the DB and Node process still handle the full `roster_flight` row first.

**Suggestion**

Replace `roster: rosterFlight` with explicit Gantt-needed columns only:

- identity/grouping: `id`, `crew_id`, `pairing_id`, `duty_seq`, `seg_seq`;
- display: `base`, `label`, `assignment_group`, `assignment`, `division`, `acting_rank`, `active_rank`, `comments`, `source`;
- time: `sch_str_dt_utc`, `sch_end_dt_utc`, `act_str_dt_utc`, `act_end_dt_utc`, `act_rest_min`;
- fallback identity: `flt_id`, `flt_dt`.

Keep the existing explicit `pairing_segment` duty fields.

**Acceptance**

- No full `rosterFlight` table object appears in the `/api/roster` select.
- Response data remains compatible with current Gantt.
- Measure lower cold TTFB and lower Node heap pressure.

---

### P0-2: Fix Or Split The `COALESCE` Date Predicate

**Area:** backend query plan, index usage  
**Expected impact:** high if EXPLAIN shows Seq Scan or poor bitmap plan

**Current evidence**

The roster query filters and sorts by:

```sql
COALESCE(roster_flight.sch_str_dt_utc, pairing_segment.sch_str_dt_utc)
```

This can prevent efficient use of the `(crew_id, sch_str_dt_utc)` index.

**Suggestion**

Run EXPLAIN first. If the direct index is not used well, split the query:

1. Primary fast path:
   - `roster_flight.sch_str_dt_utc BETWEEN start AND end`
   - should use the direct `(crew_id, sch_str_dt_utc)` index.
2. Legacy fallback path:
   - only rows where `roster_flight.sch_str_dt_utc IS NULL`;
   - join `pairing_segment` and filter by segment time.

Longer-term, backfill missing `roster_flight.sch_str_dt_utc` so the fallback path becomes unnecessary.

**Acceptance**

- EXPLAIN proves the common path uses an index.
- Query result matches previous `COALESCE` behavior.
- Cold roster load improves.

---

### P0-3: Make One Canonical First-Paint Roster Load Path

**Area:** frontend workflow consistency, first object paint  
**Expected impact:** high

**Current evidence**

There are multiple ways to reload roster:

- `refreshAllPanes()` has progressive date-window loading.
- Filter apply calls full `fetchRoster('main', selectedCrewIds, dateRange)`.
- Header refresh also calls full `fetchRoster(...)`.

This means some user flows still bypass the improved first-paint path.

**Suggestion**

Create one canonical method, for example:

```ts
loadRosterFirstPaint({
  crewIds,
  dateRange,
  visibleWindow,
  reason: 'open' | 'filter' | 'refresh' | 'date-change'
})
```

All entry points must use it:

- initial Gantt open;
- top toolbar refresh;
- filter apply;
- date range change;
- pane reopen.

The method should:

1. load first visible window;
2. publish first-paint state;
3. append the remaining date range in background;
4. ignore stale responses via request token.

**Acceptance**

- No direct full-range `fetchRoster` calls remain in UI refresh paths.
- First roster object paint uses the same optimized path in all workflows.

---

## 2. Next Priority Suggestions

### P1-1: Defer Pairing, Flight, And Rule Check Until After Roster First Paint

**Area:** first-paint contention, network contention, main-thread contention  
**Expected impact:** medium to high

**Current evidence**

`refreshAllPanes()` loads Pairing and Flight after roster first-window load, then schedules rule check shortly after data load.

Even if roster has started rendering, these follow-up operations can compete with background roster append and canvas work.

**Suggestion**

Introduce first-paint stages:

1. `roster:first-request-start`
2. `roster:first-response-ready`
3. `roster:first-index-ready`
4. `roster:first-canvas-painted`

Only after `roster:first-canvas-painted`:

- load Pairing and Flight panes if visible;
- schedule rule check with `requestIdleCallback`;
- start full-range rule check after background roster append completes.

**Acceptance**

- First roster objects appear before Pairing/Flight requests start on initial open.
- Rule check does not start before first roster paint.
- Rule badges can appear later without delaying roster visibility.

---

### P1-2: Chunked Roster Cache Instead Of Full Crew-Combination Cache

**Area:** Redis hit path, cache reuse, warm-load latency  
**Expected impact:** medium to high

**Current evidence**

The roster cache key contains the full sorted crew id list:

```ts
roster:view:${crewIds.sort().join(',')}:${startDate}:${endDate}
```

The generic cache helper parses/stringifies one large JSON blob.

**Suggestion**

Cache reusable chunks:

- per crew/date range;
- or fixed crew batches, e.g. 50 crew ids;
- or first-paint window chunks and background chunks separately.

Avoid repeatedly parsing one giant JSON blob on cache hit. If keeping Redis JSON, parse smaller pieces and merge. If measuring shows JSON parse dominates, add a roster-specific serialized response cache.

**Acceptance**

- Overlapping crew selections reuse cache chunks.
- Warm load does not require parsing one massive all-crew JSON string.
- LoadMore and first-paint paths reuse the same chunks.

---

### P1-3: Slim Crew Panel API For First Paint

**Area:** first dependency before roster load, payload size  
**Expected impact:** medium to high

**Current evidence**

`crew-service.ts` fetches current records plus full rank/base/fleet histories for the first crew page. The Roster panel only needs a small subset for first paint.

**Suggestion**

Add a slim mode:

```http
GET /api/crew?view=gantt-panel&page=1&pageSize=100
```

Return only:

- `crewId`;
- display name fields;
- division;
- current/effective rank;
- current/effective base;
- current/effective fleet;
- compact quals summary.

Lazy-load full histories after first paint or when the user opens detail/date-effective history UI.

**Acceptance**

- Initial crew response is smaller.
- Roster first-paint path no longer waits for full history arrays.
- Existing full crew API remains available.

---

### P1-4: POST Roster Query With Abort And Request Tokens

**Area:** stale work, duplicate requests, long query strings  
**Expected impact:** medium

**Current evidence**

`roster-api.ts` sends crew ids as a comma-separated GET query. There is no visible request cancellation or stale-response guard in `fetchRoster`.

**Suggestion**

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

- use `AbortController`;
- ignore responses with stale `requestId`;
- dedupe identical in-flight roster queries.

**Acceptance**

- Rapid filter/date changes do not commit stale roster responses.
- Large crew lists are not encoded into long URLs.
- Duplicate refresh clicks do not launch duplicate full roster work.

---

## 3. Measurement Needed

Before implementation, instrument the blank interval:

```text
gantt:open
crew:request:start/end
roster:first-request:start/end
roster:response-unwrapped
roster:store-set
roster:first-index-ready
roster:first-canvas-painted
pairing:first-request:start
flight:first-request:start
rule-check:first-start
```

Primary metric:

```text
blank_object_time = roster:first-canvas-painted - gantt:open
```

Breakdown target:

- crew API time;
- roster DB time;
- roster transfer time;
- browser JSON parse/unwrap time;
- store/index build time;
- first canvas paint time.

Without this breakdown, it is too easy to optimize the wrong side of the 5-10 second delay.

---

## 4. Recommended Execution Order

1. Add phase timing for the blank-object interval.
2. Explicitly project roster SQL columns.
3. EXPLAIN and fix/split the `COALESCE` date predicate.
4. Centralize all roster refresh paths through the first-paint loader.
5. Defer Pairing/Flight/rule-check until after roster first canvas paint.
6. Add chunked roster cache if warm loads remain slow.
7. Add slim crew panel API if crew API time is material in the measurement.
8. Add POST roster query with abort/request tokens to prevent stale duplicate work.

