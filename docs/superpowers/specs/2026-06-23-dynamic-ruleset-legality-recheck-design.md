# Dynamic rule-set legality recheck (live auto + scenario manual)

> Status: design / spec · Date: 2026-06-23 (re-baselined onto the Model-B-drop / `ruleset_id` model)
> Module: `live-server` (recheck core + adapters), `sql` (migration), `gantt` (frontend group)
> Related (parallel) work: `docs/superpowers/specs/2026-06-23-rule-tab-to-legality-migration-design.md`
> (Phases 1/2a/2b — Legality UI/CRUD); this spec is the recheck ENGINE, which those phases do not touch.

## 1. Goal

When the **Live** recheck runs (auto, on a rule-param save) and when a **Scenario** manual recheck runs,
both must dynamically pull — from **their own rule set** — every rule function+instance to enforce AND
the param values, with **no hardcoded instances and no hardcoded param values**. A planner's edit always
takes effect; violations are tagged with the **current** instance.

- A rule set is now identified by **`ruleset_id`** (bigint = `workset.id`; Model-B `rule_group` was dropped).
- Live's rule set = the **default RULE workset** = `workset where category='RULE'` (id 103 preferred), as
  already resolved by `resolveAffected`/`resolveRulesetId`.
- Scenario's rule set = the scenario's `ruleset_id` (today read from `f8.scenario.ruleset_id`; see §6).
- A function (`8002`) is a *template* (Rust kernel `check-8002`). Each instance (`001` BH, `002` DP) carries
  its own `param_json` and is enforced+tagged independently.

## 2. Why (the bug)

`live-server/scripts/legality-recheck-core.mjs` still **hardcodes every instance** when reading params and
when tagging output: `8002/006`, `8056/006`, `8030/004`, `8004/004`, `7505/002`, `7506/002`, `7501/004`
(+`2014/014`), `7503/003`, `7504/003`. The rule set has since renamed **every** instance to `001` (verified
2026-06-23; `8002` now has `001`=BH and `002`=DP). So the recheck:
1. reads a non-existent instance → silently falls back to a hardcoded cap → **ignores the planner's edit**;
2. tags violations with the stale instance → the gantt (grouping by the current instance) **never matches**.

The Model-B-drop migration (already merged) fixed only the *keying* (`rule_group_code` → `ruleset_id`) in the
scripts; the instance hardcoding is untouched and is what this spec fixes.

## 3. Scope

In scope (shared core + both adapters, §Gantt-Unify):
- Resolve **function → instances** dynamically from the context's own rule set (by `ruleset_id`).
- Enforce **every instance** of each implemented function and **every param row** (window), reading **all
  values by header name** from `param_json` (removes hardcoded CLI values: 8030 age/division/max, 8004
  grace-days, etc.).
- "One finding per window" → `rule_violation` unique key gains `rule_instance` + `scope_key`; cumulative-window
  findings anchor `start_dt` to the triggering pairing.
- Frontend: drop the hardcoded `RECHECK_GROUP`; derive the recheck target from the default set.

Out of scope (explicit, with an in-code `log()`):
- `Type=DP` instances (e.g. `8002/002`) — need a duty-period source not cleanly in `roster_flight`; enumerated
  and skipped with a log.
- Functions with no kernel (`7502`, `7272`, `7500`; `2014` is a definition read by others) — unchanged.
- Moving scenario metadata `f8.scenario` → the `scenario` schema — owned by the parallel migration; this spec
  isolates the read so it re-points in one line when that lands (§6).

## 4. Architecture

### 4.1 Shared resolver in the core, keyed on `ruleset_id`

```
resolveRulesetRules(db, rulesetId)
  -> select r.function, r.instance, r.param_json#>'{tables,0,header}' header,
            r.param_json#>'{tables,0,rows}' rows
       from rule_set rs join rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1     // = ruleset_id
```

`computeViolations(source, ctx, onlyCodes)` calls it once with `ctx.rulesetId`, builds
`byFunction: Map<fn, instance[]>`, and exposes `ctx.instancesOf(fn)` + `ctx.log`. `rule_set`/`rule` live in
`f8` (search_path resolves them in both scripts). No `rule_group`, no name-hop.

### 4.2 Kernel template contract (rewrite per kernel)

```
for (const inst of ctx.instancesOf(NNNN)) {
  for (const row of inst.rows) {                          // every param row (window)
    if (isDeferredType(row)) { ctx.log(`skip ${NNNN}/${inst.instance} ${scopeKey}: Type=DP`); continue }
    const v = readByHeader(inst.header, row)              // values by COLUMN NAME
    if (missing required) { ctx.log(`skip ...: missing X`); continue }   // NO silent fallback
    push(runBin('check-NNNN', argsFrom(v), tsv) tagged { rule_code:NNNN, rule_instance: inst.instance, scope_key })
  }
}
```

- Only the **function** number stays hardcoded (the kernel's identity = the binary name). 8002 disambiguates
  by `Type` (BH computed, DP skipped) — not by instance number.
- `scope_key` = `${Period}${Unit}` (e.g. `28CD`); `''` when absent.
- Single-window rules (8056/7506/8030/8004/7504) iterate instances, enforce row 0 (their table is one row).
- 7501/7503/7504 read the `2014` Local Night definition via `ctx.instancesOf(2014)[0]` (skip+log if absent).

### 4.3 Context wiring

- Live (`live-legality.mjs`): set `ctx.rulesetId = RULESET_ID` (already computed via `resolveRulesetId`).
- Scenario (`scenario-legality.mjs`): switch the manual `for (rule of RULES)` loop to
  `computeViolations(source, ctx, null)`; `ctx.rulesetId` already set by `loadContext`.

## 5. Persistence & conflict key

Current unique keys (post-Model-B-drop, verified on DB):
- `f8.rule_violation`: `(crew_id, pairing_id, duty_seq, ruleset_id, rule_code, start_dt)`
- `scenario.rule_violation`: `(scenario_id, crew_id, pairing_id, duty_seq, ruleset_id, rule_code)`

Migration `sql/migration/2026-06-23-rule-violation-scope-key.sql` (idempotent, per schema):
- `ADD COLUMN scope_key varchar(40) NOT NULL DEFAULT ''`.
- Replace the unique key with the same columns **+ `rule_instance` + `scope_key`**.

`start_dt` anchoring: cumulative-window findings (8002) anchor `start_dt`/`end_dt` to the **triggering pairing
span** (in-window) rather than the rolling-window start — so a 365-day finding lands in a current monthly
partition (`f8.rule_violation` is partitioned by `start_dt`) and the windowed delete-before-reinsert clears it.
The window range moves into `scope_key` + the message. (Scenario wipes by `scenario_id`, so anchoring matters
only for live correctness, but the same code path serves both.)

Writers: add `scope_key` to `COLS`, `CONFLICT`, and the chunk map in both scripts (`ruleset_id` already present).

## 6. Scenario metadata source (isolated)

`loadContext` currently reads `select ruleset_id, str_dt_loc, end_dt_loc from f8.scenario where id=$1`. Per the
target architecture (all scenario data in the `scenario` schema, no `f8.scenario`), this read will move to the
`scenario`-schema metadata location once the parallel migration adds it. This spec keeps `loadContext` as the
**single** point of that read so the re-point is one line; it does **not** build the schema migration.

## 7. Frontend (drop the hardcode)

`gantt/src/components/legality/legality-rule-sets-view.tsx` hardcodes `RECHECK_GROUP='pbs_solver_ruleset'`.
Replace with the **default set's id** from the rulesets list (`sets.find(s => s.isDefault)?.id`), passed to
`triggerRecheck`/the indicator (the recheck route accepts a numeric group = `ruleset_id`). Guard the
auto-recheck effect on a resolved id.

## 8. No silent fallback (requirement)

The inline fallbacks in `legality-recheck-core.mjs` (8002 40h/28d, 8056 24/FLY, 8030 P/35/1, 8004 grace 0,
7506 FLY, 7501/7503/7504 row arrays + 2014 night) and the `.unwrap_or` defaults in the Rust binaries must
become **unreachable**: a missing instance/row/param → emit nothing + `ctx.log()`. The dead accessors
`ruleRow0`/`ruleParam`/`ruleHeaderRow0` are removed.

## 9. Testing (§No-Illusion, §Playwright-Required)

1. Core unit tests (node:test, mock `resolveRulesetRules`): renamed `006→001` resolves+tags `001`; 8002
   enumerates `001`+`002`, DP skipped (+log); param values come from `param_json` (change row → emitted limit
   changes); multi-row → up to 3 findings with distinct `scope_key`.
2. Real-DB proof (skill-110 method): scoped 8002 recheck → `rule_violation` rows tagged `rule_instance='001'`
   (not `006`); tightening the 28CD cap raises the `28CD` count, `90CD`/`365CD` independent. Restore after.
3. Playwright `Live-13xx` (real UI): Legality tab → edit a default-set param → auto-recheck → reopen gantt →
   Alert Center count under the **current** instance; restore params + recheck in `finally`.

## 10. Files

| Concern | File |
|---|---|
| Resolver + kernels + no-fallback | `live-server/scripts/legality-recheck-core.mjs` |
| Live ctx.rulesetId + span accessor + scope_key persistence | `live-server/scripts/live-legality.mjs` |
| Scenario → computeViolations + span + scope_key persistence | `live-server/scripts/scenario-legality.mjs` |
| Migration (f8 + scenario) | `sql/migration/2026-06-23-rule-violation-scope-key.sql` |
| Schema source-of-truth | `sql/schema/live/04-rule-violation.sql`, `sql/schema/05-rule-violation.sql`, `sql/migration/2026-06-15-scenario-legality-tables.sql` |
| Frontend group | `gantt/src/components/legality/legality-rule-sets-view.tsx` (+`version.ts`) |
| Tests | `live-server/scripts/__tests__/*`, `e2e/tests/gantt/*` |

## 11. Open items (settle in plan/execution)

- Triggering-pairing attribution for 8002 anchoring uses `firstPairingSpanByCrew` (first in-window FLY pairing).
- Confirm scenario rows used in tests have a populated `ruleset_id`.
- The exact unique-constraint names to DROP are read from the DB at migration time (auto-named, truncated).
