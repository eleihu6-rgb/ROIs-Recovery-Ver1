# PBS Portal Playbook

> Reference for future development and debugging. Covers data model, API contracts, business logic, and known gotchas.
> Last updated: 2026-06-20 (RP date filter added)

---

## Architecture Overview

```
Browser → pbs-portal (Vite, :3030, base /fpqe/pbs/)
              ↓ /api proxy
          pbs-server (Fastify, :3002)
              ↓
          PostgreSQL (remote 47.253.173.207:55432, schema: f8_pbs + f8)
```

- **Frontend**: `pbs-portal/` — React 19 + Vite + TypeScript. Routes under `/fpqe/pbs/`.
- **Backend**: `pbs-server/` — Fastify + Drizzle + TypeScript. JWT auth.
- **DB schemas**: `f8_pbs` = PBS-specific tables; `f8` = live crew/pairing data (read-only from PBS perspective).
- **Auth**: `POST /api/auth/session` → JWT (24h). Token stored in `sessionStorage`. Fastify `onRequest` hook validates on every route.

---

## Key DB Tables

### f8_pbs schema (PBS-owned)

| Table | Purpose |
|-------|---------|
| `pbs_user` | PBS crew accounts: `crew_id`, `user_code`, `base`, `rank`, `division`, `password_hash` |
| `pairing_bid_draft` | Active bid draft per crew per period. `draft_version` bumps on every mutation. |
| `pairing_bid_draft_property` | One row per pairing property in a draft. Stores `property_code`, `bid` (JSONB), `tiers` (JSONB) |
| `pairing_bid_period` | Open/close dates for each bid period |
| `days_off_bid_draft` | Days-off bid drafts |
| `line_bid_draft` | Line bid drafts |

### f8 schema (live data, read-only)

| Table | Purpose |
|-------|---------|
| `pairing` | Pairing header: `base`, `sch_str_dt_utc`, `tafb`, `duration_days`, `duty_count` |
| `pairing_segment` | Pairing legs: `act_credited_minutes_seg`, `duty_act_credited_minutes` |
| `pairing_composition` | Rank requirements per pairing: `pairing_id`, `acting_rank`, `is_deleted` |
| `crew_base` | Crew's base airport (fallback if `pbs_user.base` is empty) |

---

## Actor Resolution

When a user makes any pairing search request, the backend resolves the actor's context:

```typescript
// pbs-server/src/services/pairing-search/actor-base.ts
resolvePairingSearchActorContext({ pgPool, schema, pbsSchema, actor })
→ { base: string, rank: string | null }
```

Priority:
1. `pbs_user.base` (trimmed, uppercased) — preferred source
2. `crew_base.base` (most recent prime base) — fallback if `pbs_user.base` is empty

If base is null after both lookups → throws `LineholderBidServiceError(400, "Current user base is required for pairing search.")`.

---

## Pairing Search: How Filters Work

### Base filter (always applied)

```sql
WHERE p.base = $actorBase
```

Applied in both `executePreviewQuery` and `executePreviewCountQueries`.

### Rank filter (applied when `pbs_user.rank` is non-null)

```sql
AND EXISTS (
  SELECT 1 FROM f8.pairing_composition pc
  WHERE pc.pairing_id = p.id
    AND pc.acting_rank = $actorRank
    AND pc.is_deleted = 0
)
```

This ensures only pairings that **require the crew's rank** are returned.
If `pbs_user.rank` is NULL, the rank filter is skipped entirely (all ranks match).

### RP (Roster Period) date filter

Every pairing search is scoped to the current **Roster Period** (RP) — the bidding month, e.g. "Jun 2026".

```sql
AND (p.sch_str_dt_utc AT TIME ZONE 'UTC')::date
    BETWEEN $rpStart::date AND $rpEnd::date
```

`rpStart`/`rpEnd` come from `buildPeriodRange(periodCode)`, which parses a period code like "Jun 2026" into
`{ startDate: "2026-06-01", endDate: "2026-06-30" }`. Both `executePreviewCountQueries` (pool counts) and
`executePreviewQuery` (SEARCH PAIRINGS) apply this filter.

**Period resolution** (in order of priority):
1. The caller passes `periodCode` explicitly in the request body.
2. `resolveCurrentPeriod` queries `roster_period.pbs_*` for a bidding window (bidOpenAt ≤ now ≤ bidCloseAt).
3. Falls back to `buildFallbackPeriodCode(businessNow)` = current UTC month (e.g. "Jun 2026").

`f8_pbs.pbs_period` has been removed; PBS period configuration lives on `f8.roster_period`.

**Impact on counts**: pairings span multiple months (data may cover 6–8 months). Without the RP filter,
the base+rank count for crew 247 is ~745. With Jun 2026 RP, it reduces to ~105.

### Property conditions (tier-based)

Properties come from `pairing_bid_draft_property`. Each property has:
- `property_code` — identifies which SQL condition to build
- `bid` — JSONB: `{ type, value, operator, ... }`
- `tiers` — array of active tier labels (e.g., `["T1"]`)

Active-tier properties feed into:
- **`/api/pairing-search/current-rules/counts`** — pool counts panel (REFRESH button)
- **`/api/pairing-search/preview`** with `mode: "current_rules"` — SEARCH PAIRINGS

---

## Key API Routes

### Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/session` | Login → JWT token |
| DELETE | `/api/auth/session` | Logout |

### Pairing bids

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/pairing-bids/current` | Get active bid draft + property catalog |
| PUT | `/api/pairing-bids/current/properties/{id}` | Update a property in the draft |
| POST | `/api/pairing-bids/current/properties` | Add a property to the draft |
| DELETE | `/api/pairing-bids/current/properties/{id}` | Remove a property |

### Pairing search

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pairing-search/current-rules/counts` | Pool counts (REFRESH): counts per property |
| POST | `/api/pairing-search/preview` | SEARCH PAIRINGS: paginated results |
| GET | `/api/pairing-search/pairing-ids` | Autocomplete pairing IDs |
| GET | `/api/pairing-search/flight-numbers` | Autocomplete flight numbers |
| POST | `/api/pairing-search/pairing-occurrences` | List occurrences of a pairing |

---

## Pairing Properties (property_code → SQL)

| Code | Name | Bid type | SQL expression |
|------|------|---------|----------------|
| 102 | Pairing Number | pairing-id-list / pairing-occurrence-list | `p.id = any($ids)` |
| 105 | Pairing Total Credit | duration | `SUM(pairing_segment.credit_minutes) > $min` |
| 106 | Departure Date / Day | date-or-dow-list / date-range | pairing occurrence start date / day |
| 164 | Departure Time | time / time-range | first `pairing_segment.sch_str_dt_utc::time` |
| 108 | Total Legs In Pairing | stepper | `COUNT(pairing_segment)` |
| 109 | Average Daily Credit | duration | `SUM(credit) / duration_days` |
| 112 | Pairing Length | stepper | `p.duration_days` |
| 113 | TAFB | duration | `p.tafb` |
| 131 | Pairing Length (dup) | stepper | `p.duration_days` |
| 132 | On Date / Pairing Length | stepper-date | date between start–end and duration_days |
| 133 | Duty Count | stepper | `p.duty_count` |
| 137 | Pairing Type | select / text | `UPPER(concat label/assignment)` |
| 138 | Credit Efficiency | percent | `(tafb / credit_minutes * 100)` |
| 163 | Month-End Carryover | month-end-carryover | carry-out days after period end |

Properties not in this table throw `422 "Search preview is not supported yet"` from `buildPreviewCondition`.

---

## Tier System

- Crew have 1–7 tiers (T1–T7). T1 is the highest priority award tier.
- Each property can be active in multiple tiers (stored as `tiers: string[]`).
- The pool counts panel always shows T1 (the selected tier from the header).
- `parsePreviewTier` accepts: `"T1"`, `"T2"`, `"TIER-01"`, `"TIER1"`.

---

## Operator Handling

`buildDurationCompareClause` and `buildCompareClause` handle:

| Operator | SQL |
|----------|-----|
| `<` or `>` | `expr < $val` or `expr > $val` |
| `"Between"` | `expr between $from and $to` |
| anything else (`=`, `>=`, `<=`) | Falls back to `expr = $val` |

**Note**: `>=` and `<=` are not in `comparisonOperators` and fall back to `=`. The frontend only exposes `["=", "<", ">", "Between"]` as valid operators.

---

## Frontend: Pairing Page Flow

```
/pairing
  └── PairingRightPanel
        ├── Pool Counts Panel (REFRESH → POST /current-rules/counts)
        │     Shows per-property counts for T1 active properties
        └── SEARCH PAIRINGS button
              └── POST /preview (mode: current_rules, tier: T1)
                    → /pairing/search
                          └── Search results page (paginated)
```

### Pool Counts Panel States

| State | Display | Trigger |
|-------|---------|---------|
| idle | "Use refresh for current Tx" | Initial load |
| loading | "Calculating..." | During REFRESH |
| success | "N pairings / M rules" | API returned 200 |
| error | "Try refresh again" | API returned non-200 or network error |
| stale | "Refresh current Tx" | Draft changed since last refresh |

The error state (`"Try refresh again"`) is set when `pairingService.countCurrentRules()` throws.
This happens when the backend returns a non-2xx status OR the network fails.

---

## Known Gotchas

### 1. Port 3002 conflict
`pbs-server` defaults to port 3002. `ROIs-Altair-PBS-Ver1/pbs-server` may also use 3002.
If tests fail with 404 on `/api/pairing-search/current-rules/counts`, it's the wrong server.
Fix: `PORT=3012 npm run dev` in pbs-server and `PBS_PORTAL_API_PROXY_TARGET=http://localhost:3012` in portal.

### 2. Rank filter requires pairing_composition data
If `pairing_composition` is empty (no rank requirements on any pairing), ALL pairings pass the rank filter.
If `pbs_user.rank` is NULL, rank filter is skipped entirely.

### 3. Actor context vs actor base
Old code used `resolvePairingSearchActorBase` (base only).
New code uses `resolvePairingSearchActorContext` (base + rank).
Both throw if base is not found.

### 4. Credit minutes calculation
`pairing_segment.act_credited_minutes_seg` → per-segment actual credit
`pairing_segment.duty_act_credited_minutes` → per-duty credit (fallback)
`COALESCE(seg_credit, duty_credit, 0)` is summed across all non-deleted segments.

### 5. pbs_user.base vs crew_base
`pbs_user.base` is the PBS-specific base override (set by admin sync).
`crew_base.base` is the live scheduling base (fallback).
Always prefer `pbs_user.base`.

### 6. Draft version bumping
Every mutation to `pairing_bid_draft_property` (add/update/delete) bumps `draft_version` in `pairing_bid_draft`.
The frontend uses `draft_version` to detect concurrent edits and reject stale updates.

### 7. Bid JSON format
Duration bids: `{ type: "duration", value: "05:00", operator: ">", creditPriority?: "higher"|"lower" }`
The `creditPriority` field is UI metadata (not used in SQL conditions) but must pass Zod validation.

---

## Debugging: Pool Counts Error

**Symptom**: "Unable to calculate pairing counts. Try refresh again" in the right panel.

**Steps**:
1. Open browser DevTools Network tab, click REFRESH
2. Find `POST /api/pairing-search/current-rules/counts` — check status code
3. If 400: check the request body (invalid tier format? Invalid bid operator?)
4. If 404: wrong pbs-server is running (see Port conflict gotcha)
5. If 422: a property code has no SQL implementation in `buildCorePreviewCondition`
6. If 500: check pbs-server logs for the actual error; common causes:
   - DB connection failure
   - SQL syntax error from bad bid value
   - `parseDurationToMinutes` on malformed value (must match `^\d{1,3}:\d{2}$`)

**Test actor context directly**:
```bash
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/session \
  -d '{"userCode":"247","password":"rois"}' -H 'Content-Type: application/json' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -X POST http://localhost:3002/api/pairing-search/current-rules/counts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tier":"T1","properties":[{"propertyGroupKey":"test","rowSeq":1,"propertyCode":105,"name":"Pairing Total Credit","action":"award","quantifier":null,"bid":{"type":"duration","value":"05:00","operator":">"},"tiers":["T1"]}]}'
```

---

## Debugging: SEARCH PAIRINGS Total Count

The "Total N items" in the search footer comes from `executePreviewQuery`'s summary subquery.

Factors affecting count:
1. Base filter (`p.base = actor.base`)
2. Rank filter (`pairing_composition.acting_rank = actor.rank`)
3. **RP date filter** (`sch_str_dt_utc` within the roster period — always applied when periodCode is resolved)
4. Property conditions (combined with AND/OR per tier rules)

If count seems too high (e.g., 14202 = total pairings ignoring base/rank):
→ Check that the correct pbs-server is running (not Altair or another project's server)

If count seems too low (0 with valid properties):
→ Check that `pairing_composition` has rows with the user's rank
→ Verify `pbs_user.rank` is set correctly

---

## E2E Tests: PBS-3xxx

Tests live in `e2e/tests/pbs-portal/`. Test IDs use PBS-3xxx prefix.
They appear in the Regression tab under category "PBS Portal".

| ID | File | What it tests |
|----|------|--------------|
| PBS-3200 | pairing-search.spec.ts | Pool counts panel shows success (no error) after REFRESH |
| PBS-3201 | pairing-search.spec.ts | SEARCH PAIRINGS returns rank+base filtered count < 14202 |
| PBS-3202 | pairing-search.spec.ts | Count API returns 200 with valid rows for Pairing Total Credit > 5:00 |

Default test user: crew 247 (James Ritchie), password "rois".
Override with `PBS_TEST_USER` / `PBS_TEST_PASS` env vars.
