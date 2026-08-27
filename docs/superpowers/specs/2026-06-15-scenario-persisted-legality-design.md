# Scenario Persisted Legality — Design

> Date: 2026-06-15
> Status: Approved (brainstorming) — ready for implementation plan
> Scope: Spec 1 of 2. Spec 2 ("Unified collaborative editing — crew-month lock + draft MCred + Revoke/Accept + broadcast, shared by live & scenario") is a separate document.

## 1. Problem

Today the **live** gantt has an at-rest legality baseline: a nightly/admin batch (`violations-init`) precomputes all rule violations into the shared `rule_violation` table, and every planner reads the same rows. The **scenario** gantt has no such baseline — scenarios only run a *transient* per-edit pre-check, and `ruletool` persists *credit/manday* only (`scenario.crew_manday_*`), not legality. So when a user opens a scenario there is no full-roster, all-rules violation view at rest, and nothing is shared between users viewing the same scenario.

This spec adds **persisted, per-scenario legality**, computed once on first open, stored by `scenario_id`, read by subsequent users, and reclaimed on delete / re-run / idle.

## 2. Goals / non-goals

**Goals**
- First user to open a scenario triggers a legality pass; violations are persisted in the `scenario` schema keyed by `scenario_id`.
- Second (and later) users read the persisted violations from the DB — no recompute.
- Staleness is detected deterministically; stale results never served.
- Stored violations are reclaimed on scenario delete, on re-run, and after an idle period.
- The pass uses the scenario's **own tied ruleset** (`scenario.rule_group_code`), not the global live default.

**Non-goals (this spec)**
- Collaborative editing (locks, blue/red lines, draft MCred, Revoke/Accept popup) — that is Spec 2, which *consumes* the persisted baseline defined here.
- Changing the live `rule_violation` table or live compute path.
- Per-crew incremental recompute (we use full recompute — see §6).

## 3. Decisions (settled in brainstorming)

| # | Decision |
|---|---|
| Compute model | **Async, non-blocking.** Open paints the roster immediately (§First-Paint); violations compute in a background job and arrive via WS. |
| Compute path | **Extend `ruletool` (Rust + .mjs), DB-driven.** ⚠️ Corrected during implementation — see §5c. The 14 `pbs_solver_ruleset` rules live in the **Rust `rule-engine-rs`** engine, NOT the TS `@rois/rule-engine` that `violations-init` uses; reusing the TS worker produced 0 violations. The compute mirrors `ruletool.mjs` `loadFromRoster`: read `scenario.*` from DB → TSV → Rust bin running the 14 `lib.rs` checks → write `scenario.rule_violation`. |
| Storage shape | **1b** — two tables in the `scenario` schema: `scenario.rule_violation` + `scenario.legality_status` (thin 1:1 bookkeeping). Live master row untouched. |
| Ruleset | **Scenario-tied** — read `scenario.rule_group_code`. (Test setup: point scenarios 6 / 460 at `pbs_solver_ruleset`.) |
| Staleness | **Monotonic version counter.** `legality_status.roster_version` bumped on load/save; violations carry `computed_version`; mismatch ⇒ stale ⇒ recompute. |
| Recompute scope | **2a — full recompute** on both re-run and save. (Scenarios are bounded; incremental deferred per §Minimal-First.) |
| Destruction | Delete cascade + rerun-clear + **idle TTL sweep** (N days from `dictionary`). |

## 4. Data model (`scenario` schema)

### 4.1 `scenario.rule_violation`

Mirrors live `sql/schema/live/04-rule-violation.sql`, minus monthly partitioning (a scenario is one bounded period; `scenario_id` is the prune key), plus `scenario_id` + `roster_version`:

```sql
CREATE TABLE scenario.rule_violation (
  id                bigint GENERATED ALWAYS AS IDENTITY,
  scenario_id       bigint         NOT NULL,
  roster_version    bigint         NOT NULL,   -- version these rows were computed against
  crew_id           varchar(20)    NOT NULL,
  pairing_id        bigint,                     -- NULL = roster-level violation
  duty_seq          smallint,
  rule_group_code   varchar(50)    NOT NULL,
  rule_code         varchar(50)    NOT NULL,
  rule_instance     varchar(20),
  start_dt          timestamptz    NOT NULL,
  end_dt            timestamptz    NOT NULL,
  severity          smallint       NOT NULL,
  actual_value      numeric,
  limit_value       numeric,
  unit              varchar(20),
  message           text           NOT NULL,
  computed_at       timestamptz    NOT NULL DEFAULT now(),
  created_by        varchar(50)    NOT NULL DEFAULT 'system',
  created_at        timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (scenario_id, crew_id, pairing_id, duty_seq, rule_group_code, rule_code)
);
CREATE INDEX idx_srv_scenario ON scenario.rule_violation (scenario_id, crew_id);
```

### 4.2 `scenario.legality_status` (1:1 bookkeeping)

One row per scenario (legality is 1:1 with the scenario because each scenario has exactly one tied `rule_group_code`):

```sql
CREATE TABLE scenario.legality_status (
  scenario_id       bigint       PRIMARY KEY,
  rule_group_code   varchar(50)  NOT NULL,            -- snapshot of scenario.rule_group_code at compute
  roster_version    bigint       NOT NULL DEFAULT 0,  -- current roster version (loader/save bumps)
  computed_version  bigint       NOT NULL DEFAULT -1, -- version the stored violations reflect
  status            varchar(20)  NOT NULL DEFAULT 'PENDING', -- PENDING|COMPUTING|READY|STALE|FAILED
  computed_at       timestamptz,
  error_text        text,
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
```

**Freshness predicate:** serve stored rows iff `status = 'READY' AND computed_version = roster_version`. Anything else ⇒ recompute.

**Why the `scenario` schema (not the live master row):** the roster (`scenario.roster_flight`), the violations, and the freshness bookkeeping all live together, so a scenario delete cascades all of it and the idle sweep operates in one schema; the live `scenario` master row stays clean of fast-churning compute state.

## 4b. Data-model reality (verified during implementation)

The "reuse the engine over `scenario.roster_flight`" plan held, but the scenario schema is **not** keyed by a single `scenario_id` the way the spec first assumed. Verified against the demo DB (scenario 460):

- **An RO scenario splits across THREE scenario_ids** (from the `f8.scenario` master row): roster lives under the RO id; **pairing + pairing_segment** live under `pairing_scenario_id`; **flight** under `flight_scenario_id`. `roster_flight.pairing_id` references `pairing.id` under the **PO** scenario, not the RO scenario. The compute path resolves a `ScenarioDataContext { rosterScenarioId, pairingScenarioId, flightScenarioId }` and joins accordingly.
- **`scenario.pairing_segment.flt_id` is NULL** (no flight link), so block minutes are **derived from scheduled times** (`sch_end − sch_str`) rather than `flight.blk_min`.
- **Scenario 6 is unlinked** (`pairing_scenario_id = 0`) → it has no pairing data to check; an unlinked RO scenario yields `ensureLegality = 'READY'` with zero violations. **Use scenario 460** (pairing→405, flight→456) as the working test. To make 6 usable, set its `pairing_scenario_id` / `flight_scenario_id`.

This is encoded in `live-server/src/services/scenario/scenario-rule-check-data-service.ts` and verified (crew 247: 15 June pairings, 72.8h derived block).

## 5c. Compute engine correction (verified during implementation)

The original plan to reuse the live `violations-init` worker was **wrong**: that worker calls `@rois/rule-engine` (the TS CCAR engine), which does **not** implement the `pbs_solver_ruleset` rules. Proof: a full run over scenario 460 completed cleanly but produced **0 violations**, and the rule loader returns 0 rules for `pbs_solver_ruleset`. The live `rule_violation` rows for this group are written by the **Rust** engine (`created_by` = `rust_8056`, `rust_8002_credit`, `rust_7501_sdfd`, `rust_8030`, `rust_7504`, `system`), i.e. the `rule-engine-rs` `check_*` binaries / ruletool.

**Corrected compute path:** extend `ruletool`, DB-driven (matches how `scenario.crew_manday_*` is produced):
- **`rule-engine-rs`** Rust bin: reads a scenario-roster TSV (per the same 6148-min / 72.8h block we verified for crew 247) and runs the 14 `lib.rs` check functions (`check_max_cum_block` 8002, `check_roster_spacing` 8056, `check_sdfd_rolling` 7501, …), emitting violation rows.
- **`live-server/scripts/scenario-legality.mjs`** (sibling to `ruletool.mjs`): reuse `loadFromRoster`-style queries (RO/PO/flight split + derived block from §4b) to read `scenario.*`, build the TSV, spawn the Rust bin, write `scenario.rule_violation`, flip `legality_status` to READY.

The live-server TS keeps only the **orchestration** (freshness/dedup `ensureLegality`, the read route, idle sweep, version bump); it triggers the `.mjs` instead of enqueuing a TS engine worker. Storage/route/frontend/lifecycle are unchanged.

## 5. Trigger, dedup, compute (the lifecycle)

### 5.1 Open flow (async, non-blocking)

1. User opens scenario → gantt paints roster from `scenario.roster_flight` immediately. In parallel it calls `GET /api/scenario/:id/legality`.
2. The endpoint reads `legality_status`:
   - **Fresh** (`READY` and `computed_version = roster_version`) → return persisted violations. *(second-user path — pure DB read.)*
   - **Not fresh** (`PENDING` / `STALE` / missing / version mismatch) → attempt to become the computor (§5.2); return `{ status: 'COMPUTING' }`.
3. The bell/Alert Center shows a `computing…` state until the WS event lands.

### 5.2 Concurrency dedup (first-vs-second-user race)

Guard the transition into compute so two simultaneous opens don't both run the pass:

```sql
-- inside a txn holding pg_advisory_xact_lock(<scenario_id>)
UPDATE scenario.legality_status
   SET status = 'COMPUTING', updated_at = now()
 WHERE scenario_id = $1
   AND status <> 'COMPUTING'
   AND computed_version <> roster_version
RETURNING scenario_id;
```

Only the transaction whose `UPDATE ... RETURNING` returns a row enqueues the job. (If no status row exists yet, the same txn inserts one in `COMPUTING`.) Everyone else gets `COMPUTING` and waits for the WS push.

### 5.3 Compute job (`scenario-legality` worker)

A new BullMQ worker that **reuses the live `violations-init` engine code**, parameterized by schema + scenario:

1. Resolve rules for `scenario.rule_group_code` (the scenario's tied ruleset).
2. Read `scenario.roster_flight` for the scenario; run Rust `RuleEngine` (pairing-level) + `RosterEngine` (roster-level) — identical to the live batch, only the source schema differs.
3. In one transaction, tagged with the current `roster_version`:
   - `DELETE FROM scenario.rule_violation WHERE scenario_id = $1;`
   - bulk-insert fresh rows (`roster_version = current`);
   - `UPDATE scenario.legality_status SET status='READY', computed_version=roster_version, computed_at=now(), error_text=NULL`.
4. Publish WS `scenario:legality:{id}` so open clients swap `COMPUTING → READY` and refetch.
5. On failure: `status='FAILED'`, `error_text=...`; the bell shows a retryable error state.

## 6. Staleness & recompute (full — option 2a)

`roster_version` is the single invalidation signal:

- **Re-run** (optimizer regenerates the roster): `load-scenario-roster.mjs` already deletes-then-reloads `scenario.roster_flight`; it additionally **bumps `roster_version`** and sets `status='STALE'`. The next open recomputes the whole roster under the new version.
- **Manual edit + Save** (Spec 2 path): Save bumps `roster_version`. Next read sees the mismatch and recomputes the whole scenario. (Full recompute, not per-crew — chosen for simplicity; scenarios are bounded and a full 14-rule pass is sub-second at the current scale. Per-crew incremental is explicitly deferred until a large-scenario latency problem is observed.)

Stale rows are never served because the freshness predicate (§4.2) requires `computed_version = roster_version`.

## 7. Destruction / reclamation

1. **Delete scenario** → cascade-delete `scenario.rule_violation` + `scenario.legality_status` for that `scenario_id` in the same transaction as the scenario delete. (App-layer pre-check then delete, consistent with the project's FK-RESTRICT convention.)
2. **Re-run / re-load** → loader clears via the `roster_version` bump (old-version rows are never served and are overwritten on the next compute's `DELETE ... WHERE scenario_id`).
3. **Idle TTL sweep** → a periodic cron (alongside the live 02:00 job) deletes violation rows + resets `legality_status` to `PENDING` for any scenario whose `legality_status.updated_at` is older than **N days**. N comes from `dictionary` (`parent_code='SYS_PARAM'`, e.g. `SCENARIO_LEGALITY_TTL_DAYS`) — not hardcoded. A swept scenario recomputes lazily on its next open.

## 8. Ruleset wiring

The scenario already carries its ruleset: `scenario.rule_group_code` (`sql/schema/live/02-crew-roster.sql:1618`, `not null`). The worker reads it directly — no schema change. For Playwright/dev validation, point the test scenarios at the 14 Rust-migrated rules:

```sql
UPDATE scenario SET rule_group_code = 'pbs_solver_ruleset' WHERE id IN (6, 460);
```

## 9. Frontend (minimal — rides the unify abstraction)

The in-flight `GanttViolationSource` interface already makes the bell/Alert Center mode-agnostic. The scenario implementation changes from "pre-check only" to:

- On open: load persisted violations via `GET /api/scenario/:id/legality`; render `COMPUTING` placeholder until ready.
- Subscribe to WS `scenario:legality:{id}`; on push, refetch and render the bell + Alert Center.
- Keep the existing on-edit pre-check overlay (Spec 2) layered on top (same `isNew` diff), so a scenario gets a real at-rest bell **plus** live edit feedback — matching the live two-layer model.

No presentation-layer changes; only the scenario source's data origin and a `COMPUTING` state.

## 10. Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `sql/schema/scenario/*.sql` (+ migration) | `scenario.rule_violation`, `scenario.legality_status` DDL | — |
| `GET /api/scenario/:id/legality` (live-server) | freshness check + dedup flip + return rows or `COMPUTING` | `legality_status`, advisory lock |
| `scenario-legality` worker (live-server BullMQ) | run engine over `scenario.roster_flight`, persist, publish | shared `violations-init` engine code |
| `load-scenario-roster.mjs` (extend) | bump `roster_version`, set `STALE` on reload | `legality_status` |
| idle-TTL cron (live-server) | sweep stale-idle scenarios | `dictionary` TTL param |
| scenario violation source (gantt) | load + subscribe + render at-rest bell | `GanttViolationSource`, WS |

## 11. Testing (per §No-Illusion / §Playwright-Required)

- **Playwright (`e2e/tests/gantt/`, Scen-2xxx):**
  - First open of a scenario with `rule_group_code='pbs_solver_ruleset'` shows `COMPUTING` then a populated bell with the expected violation count (assert specific count, not just visibility).
  - Second open (simulated second client/session) reads the persisted rows without re-triggering compute (assert no `COMPUTING` flash / worker not re-enqueued).
  - Re-run bumps version → bell recomputes; old counts replaced.
  - Delete scenario → rows gone (assert empty).
- **Integration (live-server Vitest):** dedup — two concurrent `GET /legality` calls enqueue exactly one job; freshness predicate serves stored rows only when versions match; idle sweep deletes only beyond TTL.
- **Engine parity:** scenario pass over a known `scenario.roster_flight` yields the same per-crew violations the live engine produces for the same roster (reuse existing rule cpp-replica fixtures where applicable).

## 12. Version bump

Touches backend (live-server worker/route/SQL) and frontend (gantt scenario source) → bump **both** `BACKEND_VERSION` and `FRONTEND_VERSION` in `gantt/src/version.ts` per the project version rule.

## 13. Open items for the plan

- Exact home of the `scenario-legality` worker vs. reusing the existing `violations-init-worker` with a `schema`/`scenarioId` parameter (preferred — maximize code reuse).
- WS channel naming consistency with existing `violations:{airline}:{group}` conventions.
- Whether `GET /api/scenario/:id/legality` lives under the existing scenario route group or a new legality sub-route.
