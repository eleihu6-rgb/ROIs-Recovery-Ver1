# Unified Crew-Manday Tool (Live + Scenario)

> Design spec — 2026-06-23
> Status: approved for planning
> Scope: one credit engine for both Live and Scenario crew-manday KPIs, reliable
> server recompute on save, browser-optimistic update for all KPIs, and a one-time
> repair of existing stale Live credit.

## 1. Problem

Two independent implementations compute the SAME thing — the 7502/8002 credit model —
for two schemas:

- **Live**: `recalcMandayCredit` (TypeScript, SQL, in `live-server`) → `f8.crew_manday_*`
- **Scenario**: the Rust `ruletool` core (via `live-server/scripts/ruletool.mjs`) → `scenario.crew_manday_*`

This causes two concrete failures:

1. **Drift risk** — two codebases for one credit definition. They already differ on
   ground credit (the SQL path reads the stored `roster_flight.act_credited_minutes`;
   the Rust core recomputes from the assignment definition `fixed_credit_min` /
   `credit_pct × duty`).
2. **Stale Live KPIs (the "386 ghost")** — proven root cause: Live roster mutations
   (`/api/roster/*`) trigger the recompute through `enqueueMandayRecalcForMutation`, an
   async, fire-and-forget BullMQ job with `jobId` dedup. Rapid same-crew bursts collapse
   to one job and any worker hiccup is silently swallowed. On 2026-06-22 14:33 `admin`
   bulk soft-deleted 20 flying duties for crew 386 in ~4 s; **none** recomputed. Result:
   crew 386 shows 84:25 monthly credit on a roster with zero flying duties (correct value
   is 8:00 — the 2 VAC days). Repo-wide, **~82 FD crews** show June credit >75 h with zero
   flying duties — the same ghost pattern. (`/api/draft/commit` was already made
   synchronous and is reliable; the gap is the `/api/roster/*` no-lock / bulk path.)

## 2. Goal

One tool calculates crew-manday for both contexts, parameterized by scope:

| Caller | Target schema | Scope | Source → Writes |
|---|---|---|---|
| **Live** (roster edit saved) | `f8` | changed crew(s) + affected date window | `f8.roster_flight` → `f8.crew_manday_*` |
| **Scenario** (run / open) | `scenario` | all crew in the scenario, full roster | `scenario.roster_flight` or solver `.gz` → `scenario.crew_manday_*` |

The Rust `ruletool` core (the solver's own credit model, already byte-validated against
solver output for scenarios) is the single authority. The TypeScript SQL credit math in
`recalcMandayCredit` is **fully retired** — every caller (Live edit, scenario, the three
import workers, admin refresh) routes through one driver. `recalcMandayCredit` is deleted
once the parity test (§7) proves the Rust core reproduces its output.

## 3. KPIs in scope — all seven, not just MCred

The roster pane derives seven KPIs from crew manday (`gantt/src/components/gantt/source/live-gantt-source.ts:559-567`,
type `CrewStats` in `gantt/src/types/crew.ts`). Today only `mcred` updates optimistically.

| Panel field | KPI | manday source |
|---|---|---|
| `mcred` | Monthly credit | `credit` (monthly) |
| `mbh` | Monthly block hours | `blh` (monthly) |
| `ybh` | Yearly block hours | `blh` (yearly) |
| `mdo` | Monthly days off | `is_day_off` (monthly) |
| `ydo` | Yearly days off | `is_day_off` (yearly) |
| `mal` | Monthly annual leave | `is_al` (monthly) |
| `yal` | Yearly annual leave | `is_al` (yearly) |

The design treats these generically: any manday-derived KPI gets the same two-tier
treatment. The unified tool already computes all of them (credit, blh, do/al/leave).

## 4. Architecture

### 4.1 The credit core (unchanged)
`rule-engine-rs` `ruletool` binary is a **pure stdin/stdout arithmetic core** — it reads
TSV crew-day activity rows and writes TSV daily/monthly/yearly buckets, and connects to
**no** database (`rule-engine-rs/src/bin/ruletool.rs`). The shared arithmetic lives in the
`rois_rule_engine` lib (`ground_credit`, `check_credit_band`, …), used by both the binary
and the PyO3 solver binding — so the math is already single-sourced. No change here beyond
any flags needed for the band params.

### 4.2 Shared manday driver (new, in `live-server`)
A new service module owns the DB I/O around the Rust core. It is the **single** entry point
for every manday recompute, replacing the standalone `ruletool.mjs` DB plumbing AND all uses
of the SQL `recalcMandayCredit`:

```
mandayTool.recompute({
  schema: 'f8' | 'scenario',
  scenarioId?: number,              // scenario only
  crewIds?: string[],              // scoped (Live edit / repair); omit = all crew (imports, scenario)
  startDt?: string, endDt?: string, // windowed (Live edit / imports); omit = full (scenario)
  recomputeBlh?: boolean,          // imports may keep blh import-fed; see 4.5
})
```

Modes (all the same driver, just different scope args):
- **Live edit / repair** — `crewIds` + window (scoped; zero the credit-model columns in
  the window via `UPDATE`, then UPSERT — never delete rows).
- **Imports** (`roster-inbound`, `roster-ground-inbound`, `manday-inbound`) — date window,
  all crew (no `crewIds`); the full-mode the SQL engine used.
- **Scenario** — `scenarioId`, all crew, full roster (no window).

Flow inside the driver (runs in live-server, uses the **warm** `fastify.db` pool):
1. Read roster activity for the scope (`roster_flight` + `pairing_segment` + assignment
   definitions) → build TSV rows (FLY / GND, with flags DO/VAC/ILL).
2. Spawn the `ruletool` binary, pipe TSV in, read TSV out (pure compute, ~ms; no DB).
3. **UPSERT** the returned daily/monthly/yearly buckets into the target schema's
   `crew_manday_*` tables (warm pool), touching **only** the credit-model columns
   (`credit`, `is_day_off`, `is_al`/`is_leave`, and `blh` per 4.5). It MUST NOT
   `DELETE` rows: the live `crew_manday_*` tables carry ~60 import-fed columns
   (`fdp`, `dp`, `per_diem`, …) a delete-then-reinsert would erase. Measured on live
   `f8.crew_manday_fd_monthly` (June 2026, 765 rows): `fdp` is populated in 718 rows
   and `blh ≠ credit` in 734 rows (96%) — so neither column may be clobbered. In
   scoped mode (Live edit / repair) the driver first **zeroes the credit-model columns
   in the window** via `UPDATE` (not row delete) so days that lost all events drop to 0;
   monthly/yearly are re-aggregated from the daily table afterward. This is exactly the
   column contract `recalcMandayCredit` had — only the credit arithmetic moves to Rust.

Because the DB stays in live-server's warm pool and only the arithmetic is spawned, the
~445 ms cold-connect that the standalone scenario CLI pays does **not** apply to Live.

### 4.3 Live save path (the reliability fix)
On save (`/api/draft/commit` and the `/api/roster/*` mutations), after the DB transaction
commits, call `mandayTool.recompute` **synchronously** for **all crew the save touched**
in **one** driver pass (one Rust spawn, deduped crew list — Option A). Then broadcast
`roster-updated`. This replaces `enqueueMandayRecalcForMutation` on the edit path. No
queue, no dedup-drop, no deferral: every change recomputes immediately before the response
returns. The editing user does not wait on this for their own KPIs (see 4.4).

### 4.4 Two-tier KPI freshness
- **Tier 1 — browser optimistic (instant, all seven KPIs).** When User A edits, recompute
  the per-crew **delta** for every manday KPI from the in-memory roster items and apply it
  to the displayed value before save. Generalizes the existing MCred delta
  (`draftCreditDeltaByCrew` / `sumCrewCreditMinutes`) to block hours, days off, and annual
  leave. A's view is correct immediately, independent of save latency.
- **Tier 2 — server authoritative (on save).** The unified tool writes `crew_manday_*`;
  the `roster-updated` broadcast makes other open gantts (User B) refetch roster + the full
  `CrewStats` and redraw. Already wired in `lock-store.ts:refreshCrewsFromBroadcast`; it
  refetches all seven KPIs, so no change needed there beyond the reliable server recompute.

### 4.5 Block-hours nuance
`blh` (the source of MBH/YBH) is handled per caller, mirroring `recalcMandayCredit`'s
`recomputeBlh` knob — and crucially **not** modeled as `credit`:

- **Live edit (`recomputeBlh: true`)** — recompute **real** `blh` from `flight.blk_min`
  (`roster_flight.flt_id → flight`, summed per duty, bucketed to crew-base-local date),
  so a de-assign correctly drops block hours and MBH/YBH finally move on edits. The Rust
  core's FLY-credit-as-block approximation is **not** used for live `blh` (block ≠ credit
  in 96% of live rows — see 4.2); the driver overrides it with the real `flight.blk_min`
  sum. This is the existing `recalcMandayCredit(recomputeBlh:true)` path, now reachable
  from the unified driver.
- **Imports / admin full (`recomputeBlh: false`)** — leave `blh` import-fed (untouched);
  recompute only `credit` + flags. Matches the SQL engine's full-mode default.
- **Scenario** — no import feed exists, so the Rust core's modeled `blh` (FLY credited
  minutes, FT 1.0) is written as-is; scenario tables hold only credit-model columns.

## 5. Repair of existing stale data
Once the tool runs Live, do a one-time `mandayTool.recompute` pass over every crew whose
current month credit disagrees with their current roster — at minimum the ~82 FD ghosts and
the cabin equivalent. Run it as an admin-triggered job (reuse the existing
`/api/admin/manday-credit-refresh` surface), scoped per crew. Verified safe: a rolled-back
recompute of crew 386 produces 8:00 (down from 84:25) and leaves prod untouched until run.

## 6. Migrate all callers in one go
Every current `recalcMandayCredit` caller is moved onto `mandayTool.recompute`, then the SQL
function is deleted:

- `live-server/src/routes/draft/draft.ts` (commit) — scoped, all touched crew (Option A).
- `live-server/src/routes/roster/roster.ts` (all `/api/roster/*` mutations) — scoped,
  synchronous; `enqueueMandayRecalcForMutation` + the `manday:recalc` worker/queue are removed.
- `live-server/src/workers/roster-inbound-worker.ts` — full mode, date window.
- `live-server/src/workers/roster-ground-inbound-worker.ts` — full mode, date window.
- `live-server/src/workers/manday-inbound-worker.ts` — full mode, date window.
- `live-server/src/routes/admin/manday-credit-refresh.ts` — full or scoped (also the repair).
- `live-server/scripts/ruletool.mjs` — scenario path folds into the shared driver (or calls it).

Ordering: land the driver + parity test (§7) first, switch callers, then delete
`recalcMandayCredit` and the dead queue/worker. Parity must stay green at each step.

## 7. Testing (§Playwright-Required, §No-Illusion, §Simulate-User)

1. **Parity (real DB, rolled back) — the deletion gate.** For representative FD and CC
   crew/month, in **both** scoped (Live) and full (import) mode, the unified tool's output
   equals the old SQL `recalcMandayCredit` row-for-row. This must be green before any caller
   switches and before `recalcMandayCredit` is deleted. Vitest in `live-server`.
2. **Scoped vs full** — Live scoped recompute of one crew+window matches the same crew's
   slice of a full recompute. Vitest.
3. **Live two-user Playwright** (extends `mcred-cross-user-update.spec.ts`):
   - A edits a flying duty → A's MCred **and** MBH/MDO change instantly (Tier 1).
   - A saves → B's roster + all seven KPIs update without manual refresh (Tier 2).
   - A undo → all KPIs revert.
4. **Regression for the 386 bug** — bulk de-assign of a multi-crew set in one save →
   every affected crew's credit is recomputed (no ghost), asserted via the panel KPI, the
   test that would have caught the original silent drop.

## 8. Version / docs
- Backend change (live-server driver + save path) → bump `BACKEND_VERSION`.
- Frontend change (Tier-1 deltas for all KPIs) → bump `FRONTEND_VERSION`.
- Update the gantt playbook §13 (manday recompute) and the relevant memory.
