---
name: 126-noc-integration
description: Canonical reference for NOC integration in ROIS-AI — how all crew/pairing/flight/roster/reserve/manday data was imported IN from the external NOC (Legend/F8) crewing source system, and the (not-yet-built) OUTBOUND requirement to export a PBS-solver-placed roster back OUT to NOC. Use when the user mentions "NOC", "NOC integration", "NOC import/export", "Legend", "connector-server", "external system integration", "roster export to NOC", "publish roster to NOC", "F8 import", "interface_id", "F8_IMPORT origin", or asks where imported data came from / where solver output goes. Living doc — append new NOC learnings here.
---

# NOC Integration (ROIS-AI)

> NOC = the airline's **Network Operations Control / crewing source system** (the legacy "Legend"/NOC client). In this repo the live demo source is exposed under the **F8** filiale / connector code. **All current crew, pairing, flight, roster, reserve and manday data was imported IN from the NOC API.** The future requirement: when the PBS solver-placed roster is ready, **export it back OUT to NOC** — that direction is **NOT BUILT yet** (see §3).
>
> This is a **living doc**: every time we learn something new about NOC integration (new endpoint, payload field, the day outbound export gets built, gotchas), append it here.

Repo root: `/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS`

---

## TL;DR

| Direction | Status | Where |
|---|---|---|
| **Inbound** (NOC/F8 → our DB) | **REAL, in production use** | `connector-server` fetch+transform → BullMQ → `live-server/src/workers/*-inbound-worker.ts` write DB |
| **Outbound** (our PBS roster → NOC) | **NOT BUILT** — well-architected skeleton, but data fetch stubbed + **zero callers** | `connector-server/src/workers/roster-outbound-worker.ts` (stub), `push-outbound.ts` (real HTTP, but never fed) |

Every NOC-origin row is marked: `created_by/updated_by = 'F8_IMPORT'`, `source = 'F8'`, dedup key `interface_id` (crew/pairing) / `interface_flt_id` (flight). The historical data-migration SQL used `created_by = 'ZY_IMP'` instead (legacy one-shot migration, not the live connector).

---

## 1. Inbound flow — NOC/F8 → our database (REAL)

End-to-end: **External F8/NOC API → connector-server orchestrator fetch → transform → BullMQ queue → live-server inbound worker → Postgres**.

### 1a. Fetch + orchestration (connector-server)

- **Orchestrator**: `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts` — `runF8ImportSync()` (~line 175). Fetch order (deepest dependency first): **flight → crew → pairing → roster-flight → roster-ground → manday**. Chunked by `DEFAULT_CHUNK_DAYS = 10` days; pairings batched 200/job; manday chunked monthly (FD and CC/AM separately).
  - F8 API call: POST with header `AuthorizationToken: {token}` (~line 35); response unwraps nested `{ body: "..." }` or top-level `data`/`list` (~line 69-80). Raw JSON saved to disk before transform (~line 111).
- **Auth to NOC/F8**:
  - `connector-server/src/services/auth/f8-token-auth.ts` — POST `authConfig.tokenUrl` with `{ clientId, timestamp, sign }` (HMAC); response `{ accessToken, accessTokenExpirationTime }`; cached in Redis `connector:f8:token:{connectorCode}`, TTL = expiry − 30s.
  - `oauth2-cc-auth.ts` — OAuth2 client_credentials (alt scheme).
  - `api-key-auth.ts` — API Key + HMAC, used to verify **inbound push** callers (SHA256 of `{apiKey}.{timestamp}.{sha256(body)}`, 5-min window).
- **Protocol handlers**: `services/protocols/poll-inbound.ts` (GET/POST poll, retry+token-refresh on 401/403, enqueue `inbound`), `push-inbound.ts` (verify HMAC → transform → enqueue with `sourceRef` dedup).
- **Inbound push HTTP routes**: `routes/inbound/push-inbound.ts` — `POST /flight/:connectorCode`, `POST /crew/:connectorCode`; require headers `x-api-key`, `x-timestamp`, `x-signature`; body `{ data, sourceRef? }`.
- **Admin manual trigger**: `routes/admin/connector.ts` — only supports `poll_inbound` and `f8_import` protocols (it explicitly rejects everything else, ~line 296 — note: this is why outbound can't be hand-triggered).

### 1b. Transform (connector-server/src/transform/f8/db/*.ts) — NOC payload → our records

| Transform file | F8/NOC payload → our table | Key field mappings |
|---|---|---|
| `transform-crew.ts` | crew (+ crew_base/rank/status/cert/fleet/qual) | `crewId`→`crewId`+`interfaceId`; ranks overlap-filtered+sorted; `division` derived from rank (CA/FO→P, IFD/FA→C) |
| `transform-flight.ts` | flight | `fltId`→`interfaceFltId`; `datOp`→`fltDt`; `std/sta`→`schStr/EndDtUtc`; `acGrp`→fleet, `acReg`→tail |
| `transform-pairing.ts` | pairing (+segment+composition) | `pairingId`→`interfaceId`; `source='F8'` hardcoded; duty nodes → PICKUP/BRIEF/DEBRIEF/DROPOFF |
| `transform-roster.ts` | roster_flight (flying) | `crew.crewId`→`crewId`; `pairingId`→`pairingInterfaceId` (**skip if pairingId=0**); `fltType` Transport→DHD, Simulator→SIM; `source='F8'` |
| `transform-roster-ground.ts` | roster_flight (ground, `pairing_id=NULL`) **+** single-leg flights (pairingId=0 → synthetic pairing) | ground assignment normalized; `source='F8'` |
| `transform-manday.ts` | crew_manday_fd_* / crew_manday_cc_am_* | `crewId`+`crewBaseDt` key; 50+ numeric credit fields (FD), reduced set (CC/AM) |

### 1c. BullMQ queues → live-server workers (write DB)

| Queue | Worker (live-server/src/workers/) | Table(s) written | ON CONFLICT | Origin mark |
|---|---|---|---|---|
| `connector.crew.inbound` | `crew-inbound-worker.ts` | crew + crew_base/rank/status/certificate/fleet/qualification | `crew_id` | `created_by='F8_IMPORT'` |
| `connector.flight.inbound` | `flight-inbound-worker.ts` | flight | `interface_flt_id` | `created_by='F8_IMPORT'` |
| `connector.pairing.inbound` | `pairing-inbound-worker.ts` | pairing + pairing_segment + pairing_composition | `interface_id` | `source='F8'`, `created_by='F8_IMPORT'` (synthesizes missing flights too) |
| `connector.roster.inbound` | `roster-inbound-worker.ts` | roster_flight (flying; DELETE+INSERT per pairing+crew, one row per segment) | — (delete/insert) | `source='F8'`, `created_by='F8_IMPORT'` |
| `connector.roster_ground.inbound` | `roster-ground-inbound-worker.ts` | roster_flight (ground, `pairing_id=NULL`) + synthetic pairing chain for single-legs (`interface_id='GND-{fltKey}'`) | date-range + key delete | `source='F8'`, `created_by='F8_IMPORT'`/`'F8_IMPORT_GND'` |
| `connector.manday.inbound` | `manday-inbound-worker.ts` | crew_manday_{fd,cc_am}_{daily,monthly,yearly} | `(crew_id, crew_base_dt)` (daily) | `updated_by='F8_IMPORT'` |

Roster-flight worker pairing FK lookup builds `interface_id → pairing.id` map (`roster-inbound-worker.ts` ~line 24-30) — pairings must be imported before rosters (hence fetch order).

---

## 2. How a row's NOC origin is recorded (use these to find/distinguish imported data)

- `created_by = 'F8_IMPORT'` / `updated_by = 'F8_IMPORT'` — set by the live connector workers. (`roster-ground` ground-leg materialization may use `'F8_IMPORT_GND'`.)
- `source = 'F8'` — on `pairing` and `roster_flight`.
- `interface_id` (crew, pairing) / `interface_flt_id` (flight) — the **NOC-side primary key**, used as the upsert dedup key so re-imports are idempotent.
- `'ZY_IMP'` / `'ZY_IMP'` `created_by` — appears only in the **legacy one-shot data-migration SQL** (`data-migration/docs/03-f8-pairing.sql`), NOT the live connector. Treat as historical migration provenance, distinct from the live `F8_IMPORT` connector path.

Quick DB sniff (remote demo DB, query via node pg — see live-server memory): rows with `source='F8'` / `created_by='F8_IMPORT'` came in from NOC.

---

## 3. Outbound — export PBS-solver roster → NOC (NOT BUILT)

**Verdict: NOT BUILT.** The skeleton exists but is dormant: the roster-data fetch is a TODO stub, the query DB layer is a stub, and **nothing anywhere enqueues to the outbound queue.**

| Piece | File:line | Status |
|---|---|---|
| Worker registered | `connector-server/src/index.ts` (createRosterOutboundWorker) | REAL but idle |
| Worker consumes `connector.roster.outbound` | `connector-server/src/workers/roster-outbound-worker.ts` (~line 22) | REAL queue name |
| Fetch roster records for export | `roster-outbound-worker.ts` ~line 43-44: `// TODO: Implement actual roster query` then `const rosterRecords: StandardRecord[] = []` | **STUB** (pushes empty array) |
| HTTP POST to external NOC | `connector-server/src/services/protocols/push-outbound.ts` ~line 54-61 (`fetch(url, {method:'POST'})` + OAuth2/API-key auth) | **REAL** — would work if fed |
| Pull-style outbound query route | `routes/outbound/query-outbound.ts` (`GET /api/outbound/:connectorCode/roster`, HMAC, pagination) | route REAL |
| Query roster from DB for pull | `services/protocols/query-outbound.ts` ~line 81-92: `// TODO: Implement actual database query` → returns `{records:[], total:0}` | **STUB** |
| Anyone enqueues `connector.roster.outbound`? | grep whole repo: **only** queue-init (`plugins/bullmq.ts`) + worker-register. **Zero `.add(...)` callers.** | **MISSING** |
| Admin manual trigger | `routes/admin/connector.ts` ~line 296 — only `poll_inbound`/`f8_import` | outbound **excluded** |

What a scenario publish does **today** (`live-server/src/routes/scenario/scenario.ts` `POST /api/scenario/:id/publish`): writes assignments to local `roster_flight` + enqueues a **manday recalc** job — **no NOC export**. `roster-publish.ts` writes a local `roster_publish` table only.

### To build outbound (the future plug-in points)
1. Implement roster fetch in `roster-outbound-worker.ts` (replace the empty-array TODO) — read the solver-placed rows from `roster_flight` (likely by scenario/publish id), shape via the transform layer's `toStandard()`.
2. (If pull mode needed) implement `queryRosterFromDb()` in `query-outbound.ts`.
3. **Add the caller**: after the PBS solver roster is approved/published, enqueue `fastify.queues.rosterOutbound.add(...)` with `{ rosterIds, schema, publishedBy, publishedAt }` — natural site is live-server scenario publish or a dedicated "Export to NOC" action.
4. Register an outbound connector config (`connector_config`, domain `roster`, `getEnabledOutboundConnectors('roster')`) with NOC's endpoint URL + auth.
5. (Optional) allow `push_outbound` in the admin manual-trigger endpoint.
6. **Write a Playwright test** driving the real "Export to NOC" UI (per repo §Simulate-User / §Playwright-Required) — and build the UI entry point if it doesn't exist; don't fake it by calling the API.

---

## 4. Data semantics: historical RES/reserve duties vs the new RES Pairing Creator

- **Historical (from NOC)**: reserve / standby / all non-flying ground duties were imported **as non-pairing rows** — `roster_flight` with **`pairing_id IS NULL`** and `source='F8'` (`live-server/src/workers/roster-ground-inbound-worker.ts` ~line 44, 59, 78). So a legacy RES day is a bare roster_flight row, not a real pairing.
- **New (in-progress feature) — RES Pairing Creator**: creates reserve as **real pairings** instead — inserts `pairing` + `pairing_segment` + `pairing_composition` (`live-server/src/services/res-pairing/res-pairing-service.ts`, route `live-server/src/routes/res-pairing/res-pairing.ts`; mockups in `docs/mockups/res-pairing-creator/`). These are planner-created, `created_by=<username>`, **not** `F8_IMPORT` — i.e. NOT NOC-origin.
- Implication for outbound: when exporting back to NOC, RES pairings created by the RES Pairing Creator are *our* objects (no NOC `interface_id`); the export design must decide how NOC ingests them (new objects vs. mapped back to NOC reserve shape).

---

## 5. Known gotchas

- `pairingId = 0` in roster payloads means **single-leg flight**, not a pairing — handled by the roster-**ground** worker (synthetic `GND-{fltKey}` pairing), not the roster-flight worker which skips it.
- Pairings must import **before** rosters (roster worker resolves `interface_id → pairing.id`); the orchestrator fetch order enforces this. A roster job that runs before its pairing exists will fail the FK lookup.
- `'ZY_IMP'` ≠ `'F8_IMPORT'`: the former is legacy one-shot migration SQL, the latter the live connector. Don't conflate when auditing provenance.
- Remote demo DB: local f8 schema is empty; query the remote Postgres via node pg (no psql) — see live-server memory notes.
- `connector-server` is **fully decoupled** from live-server's process: it only talks to live-server via BullMQ queues (Redis), never direct DB writes into live tables itself — the **workers live in live-server**.

---

## 6. Pairing credit — authoritative source and field map

> The claim "June pairings have no credit hour" is TRUE for the stored scheduled-credit fields, but **FALSE** for the actual credit the NOC delivers. Use this section before reasoning about credit in the rule engine or credit-hour calculations.

### Where credit lives (and where it does NOT)

| Field | Table | Populated? | Notes |
|---|---|---|---|
| `duty_act_credited_minutes` | `pairing_segment` | **YES — from NOC** | Actual credit per duty node; avg ~405 min (~6.75 h) in June 2026; **authoritative** |
| `duty_sch_credited_minutes` | `pairing_segment` | NULL | NOC does not send scheduled credit per duty |
| `sch_credited_minutes_seg` | `pairing_segment` | NULL | Segment-level scheduled credit not sent by NOC |
| `act_credited_minutes_seg` | `pairing_segment` | NULL | Segment-level actual credit not sent by NOC |
| `sch_credited_minutes` | `roster_flight` | NULL | Not populated by inbound import |
| `act_credited_minutes` | `roster_flight` | NULL | Not populated by inbound import |
| `ggy_blh` | `pairing` | NULL | Not sent by NOC; block-hour summary not populated |
| `wp_mins` | `pairing` | **YES — computed** | Work-period minutes are computed/transformed; rule engine fallback |

### Transform path

NOC API payload (per duty node) → `connector-server/src/transform/f8/db/transform-pairing.ts` line 135:
```ts
creditedMinutes: toInt(duty['creditedMinutes'] ?? duty['credited_minutes'])
```
→ `live-server/src/workers/pairing-inbound-worker.ts` line 197/217 → written as `pairing_segment.duty_act_credited_minutes`.

### June 2026 data snapshot (live remote DB, queried 2026-06-24)

- `pairing_segment` June rows with `pairing_id IS NOT NULL`, `is_deleted = 0`: **6,256 total**
- `duty_act_credited_minutes > 0`: **5,855 (93.6%)**, avg **405 min (~6.75 h per duty)**
- `roster_flight` June flying rows: **9,046 total** — `sch_credited_minutes` ALL NULL
- `crew_manday_fd_monthly` June: 765 crew; `blh > 0` for 717; `credit > 0` for 246; `sch_credit` ALL 0.00

### Rule engine gap (as of 2026-06-24)

Rules 7502 (credit hours) and 8002 (credit band) currently compute credit as `pairing.wp_mins × assignment.credit_pct` (FLY = 1.0). They do **not** read `pairing_segment.duty_act_credited_minutes`. This means the rule engine is using a computed approximation rather than the NOC-provided actual credit. This gap should be addressed when the rules are refined.

---

## 7. Living-doc log (append new NOC learnings below)

- 2026-06-23 — Initial map. Inbound REAL (F8 connector, 6 queues, F8_IMPORT origin). Outbound roster→NOC **NOT BUILT** (worker+HTTP skeleton, fetch stubbed, no caller). RES historically non-pairing (`pairing_id NULL`); RES Pairing Creator (in-progress) makes real pairings.
- 2026-06-24 — Pairing credit map added (§6). NOC provides actual credit per duty → `pairing_segment.duty_act_credited_minutes` (`creditedMinutes` field). All other credit fields (roster_flight, pairing.ggy_blh, segment-level) are NULL. Rule engine 7502/8002 uses `wp_mins × credit_pct` as fallback — not the NOC actual credit. Gap documented.
- 2026-07-09 — Import PBS Material was aligned to connector-server F8 import: manual trigger can pass explicit material scope (`crew`, `flight`, `pairing`, `roster`, `rosterGround`) and `roster` no longer auto-expands dependencies when scoped. `roster_flight` rows whose `pairingInterfaceId` cannot resolve to `pairing.interface_id` are skipped by the live worker with a warning. F8 date chunk fetch now treats `>=1000` returned rows as a likely upstream cap, recursively splits smaller chunks, and fails a still-capped single-day response instead of silently truncating.
- 2026-07-17 — Import PBS Material result stats are authoritative only when returned by live-server inbound workers; frontend must not infer Added/Updated/Deleted from `imported`. F8 `flight`/`pairing` workers classify add/update by existing `interface_flt_id` / `interface_id`; `roster` classifies logical `(pairing_id, crew_id)` assignments; `rosterGround` reports import-owned delete row counts and inserted rows. Drizzle raw SQL must use explicit PostgreSQL arrays for bulk `ANY(...)` fill refresh (`ANY(ARRAY[...]::bigint[])`), not `ANY(${ids})`, which can render as a row expression and fail.
