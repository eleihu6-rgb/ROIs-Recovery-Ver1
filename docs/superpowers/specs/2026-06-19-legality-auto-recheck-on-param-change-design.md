# Auto-recheck legality on rule parameter change — Design

> Date: 2026-06-19
> Status: Design (awaiting implementation plan)
> Modules: gantt (frontend) + live-server (backend) + rule-engine-rs (Rust binaries, reused)

## 1. Problem

Saving a rule parameter change in the **Legality tab** today writes the legacy
`rule.param_json` to the DB and **stops there**. Violations are not rechecked. To see the
effect, an admin must separately trigger a recheck ("Refresh Violations" / Alert Center
"Scan live"). There is no indication that violations are now stale, and no record of when
legality was last verified.

Worse, the **automated** recheck path is broken/disconnected:

- `live-server/src/workers/violations-init-worker.ts` tries `import('@rois/rule-engine')`
  (a TS engine that does not exist / is not in `package.json`) and loads parameters from the
  **modern** `rule_instance.params`.
- The Legality tab edits the **legacy** `rule.param_json`. Legacy and modern param stores are
  **not synced** (no trigger, no migration, no sync service).
- The path that actually works reads **legacy `rule.param_json`** and runs the **Rust
  `rule-engine-rs`** binaries: the per-rule persist scripts (`persist-8056-violations.mjs`,
  `check-7501-sdfd.mjs`, …) and, for scenarios, `live-server/scripts/scenario-legality.mjs`.

So the fix must be built on the **Rust + legacy-`param_json`** path, which is the only one
connected to what the Legality tab edits.

## 2. Goal

When an admin saves a rule parameter change in the Legality tab:

1. Automatically recheck the rosters affected by that rule — **live** (default ruleset) and
   any **scenario that has a roster** and whose ruleset includes the rule.
2. Surface a **last-recheck timestamp + status** indicator in two places:
   - **Legality tab → default ruleset header** (info **+ a manual "Recheck now" button**).
   - **Alert Center toolbar** (info only; the existing "Scan live" button is removed).

## 3. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | **Live + Scenario together** | Requirement 1.C: only rosters that exist (live always; optimized scenarios). |
| Engine path | **Unified Rust orchestrator** (generalize `scenario-legality.mjs`) | Honors §Gantt-Unify; reuses the only working engine; reads the edited legacy `param_json`. |
| Live roster scope | **All crew in the active planning period** | Correctness/completeness (1.A/1.C); timestamp+progress indicator covers the wait. |
| Recheck granularity | **Whole ruleset** | Single-rule recheck and definition-dependency precision are infeasible *and* unnecessary (see §4). |
| Timestamp store | **Redis** | Consistent with existing violations-init progress keys; indicator degrades to "—" if absent. |
| Alert Center | **Info only**, remove "Scan live" | Auto-recheck makes the manual scan redundant. |
| Legality tab default-ruleset header | **Info + manual "Recheck now"** | Single admin control surface for an explicit re-run. |
| Scenario invalidation | **Relevance-windowed** | Users target this/next-month scenarios; rechecking outdated ones is not urgent. In-window scenarios auto-recompute on open; out-of-window ones show last-known violations + an "outdated" hint and recompute only on manual click. |
| Recheck efficiency | **Batch insert + window-scoped + lazy** | Avoid the row-by-row insert and redundant scans; live recheck touches only the active window; scenarios cost nothing until opened. |

### 3.1 Why granularity collapses (requirements 1.D + 1.E)

- **1.E (single-rule recheck):** Not feasible. Both engines run the **whole rule group per
  roster** and then bulk-replace that roster's violations: live deletes
  `WHERE crew_id = $1 AND rule_group_code = $2`; scenario deletes
  `WHERE scenario_id = $1`. There is no per-rule check entry point and no per-rule delete, so
  a single-rule recheck would clobber the other rules' violations.
- **1.D (recheck definition dependents):** Dependencies are **not queryable** — there is no
  `depends_on` column; a checker only "knows" its definition by **co-location in the same
  workset** (e.g. 7501, 7503, 2014 all in workset #103).
- **Conclusion:** Because we always recheck the **whole ruleset**, every definition dependent
  is re-evaluated regardless of whether the changed rule was a Definition or a checker. 1.D and
  1.E reduce to a single behaviour: **param change in ruleset R → recheck R against every
  roster bound to R.**

## 4. Architecture

### 4.1 Affected-roster resolution (backend, on param save)

After `PATCH /api/legality/rule/:ruleId/params` writes legacy `rule.param_json`:

1. Resolve the worksets that contain this rule:
   ```sql
   SELECT DISTINCT rs.workset_id
   FROM rule_set rs
   WHERE rs.rule_id = (r.function::text || coalesce(r.instance, ''))::bigint  -- the edited rule
   ```
2. **Live:** if any of those worksets is the **live default ruleset** (the workset whose name
   matches the default `rule_group` with `usage='GANTT' AND is_default=true`), enqueue a **live
   recheck** for that group.
3. **Scenario:** find scenarios bound to those worksets that have a roster:
   ```sql
   SELECT DISTINCT s.id, s.rule_group_code
   FROM scenario s
   WHERE s.workset_id = ANY($worksets) AND s.status = 'DONE'
   ```
   Mark each **stale** (lazy recompute — see §4.4).

### 4.2 Unified Rust recheck core (§Gantt-Unify)

Extract the rule-running core from `scenario-legality.mjs` into a shared module. Signature
(conceptual): `runLegalityRecheck({ scope, groupCode, dateRange })` where
`scope = { kind: 'live' } | { kind: 'scenario', scenarioId }`.

Core steps (identical for both scopes):

1. Build a TSV from the scope's roster source.
2. For each rule in the group, spawn its Rust binary from `rule-engine-rs/target/release`
   (`check-8002`, `check-8056`, …), passing parameters derived from **legacy `rule.param_json`**
   (e.g. `--min-limits`, `--night-start-min`).
3. Parse the TSV output into violation rows.
4. Bulk-replace violations for the scope (transactional delete + insert).
5. Update freshness/status.

Two thin **data adapters** (the only divergence):

| Aspect | Live adapter | Scenario adapter (existing) |
|---|---|---|
| Roster source | live `roster_flight`, all crew, active period | `scenario.roster_flight` for the scenario |
| Violation target | live `rule_violation` (delete by `(crew, group)`, bulk insert) | `scenario.rule_violation` (delete by `scenario_id`) |
| Freshness/status | Redis `legality:recheck:{airline}:{groupCode}` | `scenario.legality_status` (`roster_version`/`computed_version`) |

### 4.3 Live recheck trigger + status (Redis)

- Param save (or manual "Recheck now") → spawn the live recheck (detached child process, the
  same pattern as scenario `spawnCompute`).
- Redis key `legality:recheck:{airline}:{groupCode}` holds:
  ```json
  { "status": "idle|computing|done|failed", "lastCheckedAt": "<iso>", "progress": 0, "startedAt": "<iso>", "error": null }
  ```
- New endpoint `GET /api/legality/recheck-status?groupCode=` returns the current value.
- New endpoint `POST /api/legality/recheck` (admin) for the manual "Recheck now" button —
  enqueues the same live recheck.
- Frontend polls `recheck-status` while `status === 'computing'` (reuse the existing
  violations-init polling pattern in `rule-group-header.tsx`).

### 4.4 Scenario invalidation (relevance-windowed, lazy)

Scenarios commonly span a single month, often multiple months, and users target the **this/
next-month** scenario; rechecking outdated scenarios is **not urgent**. So invalidation is
split by a **relevance window** `W = [date_trunc('month', now()) .. end of next month]`
(SQL: `start = date_trunc('month', now())`, `end = date_trunc('month', now()) + interval '2 months' - interval '1 day'`).
A scenario is *in-window* if its period (`scenario.str_dt_loc..end_dt_loc`) overlaps `W`.

On param save, for each affected `status='DONE'` scenario:

- **In-window** → mark **stale** (`computed_version = computed_version - 1`, `status='PENDING'`)
  so `isFresh()` is false → the next `GET /api/scenario/:id/legality` recomputes via the unified
  core (existing behaviour). No proactive batch — recompute happens lazily on open.
- **Out-of-window** → set a **soft flag** `params_stale = true` on `scenario.legality_status`
  **without** touching `computed_version`/`status`. `isFresh()` stays true, so opening the
  scenario returns its **last-computed** violations immediately (no forced recompute) plus an
  `outdated` hint. Recompute happens **only** on an explicit manual "Recheck" click, which
  spawns the compute and clears `params_stale`.

This needs a new column: `scenario.legality_status.params_stale boolean NOT NULL DEFAULT false`
(migration). `ensureLegality` returns `paramsStale` alongside the status so the frontend can
render the hint, and a new `POST /api/scenario/:id/legality/recheck` forces a recompute and
clears the flag.

### 4.4.1 Recheck efficiency

The recompute cost is reduced by three measures applied in the shared core / live entry:

1. **Batch the violation INSERT.** The existing scenario script inserts violations
   **row-by-row in a loop** (one DB round-trip per violation — hundreds–thousands per
   recompute). The shared core replaces this with a single multi-row insert via `unnest(...)`
   parameter arrays, collapsing it to one round-trip. Biggest win at live (141-crew) scale.
2. **Window-scoped live recheck.** Live recheck reads and bulk-replaces only the client's
   active `[from,to]` window — other months' live violations are untouched.
3. **Lazy + windowed scenarios.** Out-of-window scenarios cost nothing (no recompute) until a
   user explicitly asks; in-window ones recompute once, on open.

*(Optional follow-up, not in the first cut: fetch each scenario/live roster slice once and
derive every rule's input in memory instead of re-querying `roster_flight` ~8–10× per
recompute. Strong win at scale but a larger core refactor — deferred to keep the first cut
minimal.)*

### 4.5 Frontend

- **Shared component `LegalityRecheckIndicator`** — renders status + `lastCheckedAt`, used in
  both surfaces. Polls `recheck-status` when computing.
  - Legality tab default-ruleset header (Image #4 red box): indicator **+ "Recheck now"**
    button (calls `POST /api/legality/recheck`).
  - Alert Center toolbar (Image #5 red box): indicator **only**; the "Scan live" button is
    removed.
- **States:** `idle` → "Last checked {ts}"; on save/recheck → "Checking legality…" (+ progress);
  on done → toast "Legality recheck done" + updated timestamp; `failed` → error + allow retry
  (manual button); no Redis entry → "—" / "Not yet checked".
- `legality-store.updateRuleParams` success → trigger recheck-status polling so the indicator
  flips to "Checking…" without a manual step.
- **Scenario legality view** — when `ensureLegality` returns `paramsStale: true` for an
  out-of-window scenario, show an "Legality may be outdated — rule parameters changed" hint
  with a **Recheck** button (`POST /api/scenario/:id/legality/recheck`). In-window scenarios
  recompute automatically on open (existing COMPUTING → READY flow), so no hint is needed there.

### 4.6 Data flow

```
Admin edits param in Legality tab → "Save All"
  → PATCH /api/legality/rule/:ruleId/params   (writes legacy rule.param_json)
  → resolve affected worksets
      ├─ live default ruleset?  → enqueue live recheck (Rust core, all crew)
      │       → Redis legality:recheck:* status=computing … done + lastCheckedAt
      └─ DONE scenarios on those worksets, split by relevance window W:
            ├─ in-window  → mark stale (computed_version-1, PENDING) → recompute on open
            └─ out-of-window → set params_stale flag only → show "outdated" hint on open
  → frontend indicator polls recheck-status → "Checking…" → toast + timestamp
  → bell / Alert Center reflect new live violations
  → in-window scenario open → recomputes via unified core
  → out-of-window scenario open → last-known violations + "Recheck" button (manual recompute)
```

## 5. Error handling

- Param save **succeeds independently** of recheck; if the recheck enqueue/spawn fails, the
  PATCH still returns 200 and the indicator shows `failed` with a retry affordance.
- Recheck failure → Redis `status='failed'`, `error` populated; indicator shows error.
- Redis flushed / no entry → indicator shows "—" (not "stale" — we cannot prove staleness
  without history); next recheck repopulates.
- Manual "Recheck now" while one is already `computing` → no-op (return current status).

## 6. Testing (§No-Illusion, §Playwright-Required)

E2E specs under `e2e/gantt/` (test-ID prefix `6xxx` Legality / reuse Alert Center tests):

1. **Reaches reality (regression):** change a rule whose Rust flag is sourced from
   `param_json` (e.g. **7503** `Max Consecutive` 2→1, or 7505 `Min DO`) → assert the **live
   violation count changes** after recheck completes. This proves the recheck flows through
   Rust + legacy `param_json` (guards against the broken modern path silently no-op-ing).
   *(8002's 40h window is currently a constant in the engine, not read from `param_json`, so
   it is not a valid probe — see §3.1.)*
2. **Legality tab indicator:** edit a param → Save → indicator shows "Checking legality…" →
   eventually shows an updated timestamp + success toast.
3. **Manual recheck:** click "Recheck now" on the default ruleset → indicator transitions
   computing → done; timestamp advances.
4. **Alert Center (3.C):** assert "Scan live" button is **absent**; assert the last-check
   indicator is present and shows the timestamp/status (info only, not clickable to trigger).
5. **Scenario in-window recompute:** edit a param bound to an in-window DONE scenario → open it
   → legality transitions COMPUTING → READY with violations reflecting the new param.
6. **Scenario out-of-window hint:** edit a param bound to an out-of-window DONE scenario → open
   it → last-known violations shown immediately + "outdated" hint + Recheck button; clicking
   Recheck recomputes and clears the hint. Use scenario **6** / **460** per project memory.

Each change must paste the PASS/FAIL receipt per §No-Illusion. Stale Alert Center / Legality
specs touched by the "Scan live" removal are updated per §Stale-Test.

## 7. Version bump

Frontend (gantt) and backend (live-server) both change → bump **both** `BACKEND_VERSION` and
`FRONTEND_VERSION` in `gantt/src/version.ts`.

## 8. Out of scope

- Repairing the modern `rule_instance` path or building the TS `@rois/rule-engine` (explicitly
  rejected — Approach B).
- Persisting recheck history beyond the latest timestamp/status (Redis holds only the latest).
- Per-rule / incremental recheck (infeasible; §3.1).
- Proactive batch recompute of all scenarios on param save (lazy/windowed instead).
- Eager background pre-warming of in-window scenarios (rejected option C — lazy-on-open suffices).
- Fetch-roster-once core optimization (§4.4.1 follow-up) — deferred from the first cut.
- Making 8002's 40h band editable via `param_json` (it is a constant in the engine today).

## 9. Key files

| File | Role / change |
|---|---|
| `live-server/scripts/legality-recheck-core.mjs` (new) | Shared Rust recheck core; batched multi-row insert. |
| `live-server/scripts/scenario-legality.mjs` | Refactor onto the shared core (scenario source adapter). |
| `live-server/scripts/live-legality.mjs` (new) | Live source adapter + entry; Redis status. |
| `sql/migration/2026-06-19-scenario-legality-params-stale.sql` (new) | Add `scenario.legality_status.params_stale boolean`. |
| `live-server/src/routes/rule/legality.ts` | PATCH → resolve affected + windowed invalidate; add `recheck` + `recheck-status`. |
| `live-server/src/services/rule/legality-recheck.ts` (new) | Affected-roster resolution; windowed stale-marking; spawn live recheck. |
| `live-server/src/services/scenario/legality-status.ts` | `ensureLegality` returns `paramsStale`; clear-flag-and-recompute helper. |
| `live-server/src/routes/scenario/legality.ts` | Add `POST /:id/legality/recheck` (clears `params_stale`, forces recompute). |
| `gantt/src/components/legality/legality-recheck-indicator.tsx` (new) | Shared indicator (info + optional Recheck now). |
| `gantt/src/components/legality/legality-view.tsx` | Mount indicator; trigger live recheck on param save. |
| `gantt/src/components/panes/violation-list-dialog.tsx` | Remove "Scan live"; mount indicator (info). |
| Scenario legality view component | "Outdated — params changed" hint + Recheck button when `paramsStale`. |
| `gantt/src/version.ts` | Version bump. |
