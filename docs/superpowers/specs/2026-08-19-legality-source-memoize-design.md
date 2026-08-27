# Design: Memoize per-pass read-only source accessors in legality recheck

**Date:** 2026-08-19
**Status:** Approved for implementation (pending plan)
**Scope:** `live-server/scripts/legality-recheck-core.mjs` — add a per-pass source memoization wrapper; no rule-logic or SQL changes.

## Problem

Every rule function loads its own copy of the read-only reference data by calling the shared `source` adapter's accessors. The same accessor is invoked many times across the 15 rules in one recheck pass, each time issuing a fresh remote-DB query:

| accessor | calls per pass (measured) | rules involved |
|---|---|---|
| `crewTeams()` | 8 | 8056 / 8071 / 7305 / 7505 / 7507 / 7506 / 7508 / 7503 |
| `crewQualEntries()` | 7 | 8056 / 8071 / 7305 / 7505 / 7507 / 7506 / 7508 / 7503 / 7504 |
| `crewOffsets()` | 7 | 8056 / 8071 / 7305 / 7505 / 7507 / 7506 / 7508 / 7503 / 7504 |
| `crewBaseTimezone()` | 5 | 8002 / 8004 / 1001 / 7506 / 7508 / 7503 / 7504 |
| `flyDuties()` / `assignmentsAll()` / `rosterDuties()` | 2-3 | 7305 / 7508 / 7506 / 7503 / 7504 |

The recheck wall time is almost entirely remote-DB query latency (measured pg total ≈ WALL: 27.1s vs 27.2s median for workset 103 / division P / June). Duplicate reference loads are a sizable fraction of that.

## Goal

Make each read-only accessor execute its DB query **once per recheck pass**, reusing the same result (same Promise) for every subsequent call from any rule — while keeping the persisted `rule_violation` rows byte-identical and the `id` identity sequence unchanged.

## Non-goals

- No change to any rule's matching/continuity/PA logic, row ordering, or kernel semantics.
- No change to any SQL or to the `source` adapter implementations (live and scenario adapters stay untouched).
- No rule-parallelism (that is a separate follow-up, P1).
- No acc-ref `UPDATE`/index optimization (separate follow-up, P2).

## Background / constraints confirmed

- The `source` object passed to `computeViolations` is a **fresh, stateless closure per pass** (`liveSource(db, fromIso, toExclusiveIso)` in `live-legality.mjs`; the scenario adapter is analogous). Accessors are async and issue their own queries.
- All data the accessors return is **static within one pass**: the acc-ref persist (duty_ref_tz write-back) commits *before* `computeViolations` runs, and nothing mutates the underlying tables during rule evaluation.
- Rules never bypass accessors for data reads: the only use of `source.db` in the core is `resolveRulesetRules(source.db, ctx.rulesetId)` for rule-parameter parsing (L2289). All rule data comes through `source.<accessor>()` calls.
- Argument-carrying accessors exist: `mandayMetricsByDay(365)`, `flyDuties(false)`, `qualificationFlightSegments({...})`, `rosterProperties({...})`, `baseQuals(crewIds)`. Cache keys must distinguish arguments.
- Output ordering is preserved by `computeViolations` (rules run in `RULES` order, rows appended in order) and persisted by `live-legality.mjs` in array order → `rule_violation.id` (IDENTITY) sequence is decided by that order. Memoization must not perturb it (it cannot: it only dedupes identical queries, results are identical values).

## Design

### 1. `memoizeSource(source)` helper (new, exported for tests)

- Iterate `Object.keys(source)`; copy non-function properties verbatim (e.g. `db`).
- For each function property, return a wrapper `(…args) =>`:
  - cache key = `name + '|' + stableArgs(args)` where `stableArgs` JSON-serializes each arg with a type tag (`n:` for numbers, `b:` for booleans, `j:` for JSON-stringified objects/arrays) so `1` and `"1"` never collide.
  - On first call: `const p = source[name](...args); cache.set(key, p); p.catch(() => { cache.delete(key) }); return p` — caches the **Promise** so concurrent callers share one query, and removes the entry on rejection so a later call retries (failure semantics stay "query again", matching today).
  - On subsequent calls: `return cache.get(key)` (the shared Promise).
- `db` and any non-function member are passed through untouched.

### 2. Wire into `computeViolations` (L2285)

- At the top of `computeViolations`, wrap the incoming source: `source = memoizeSource(source)`.
- Nothing else changes: rules keep calling `source.crewTeams()` etc. with identical argument shapes.

### 3. Where the memo lives

- Inside the core, so every caller benefits with one change: live CLI recheck (`live-legality.mjs`), live-server business paths, scenario recheck, and `preview-draft`.
- Cache lifetime = one `computeViolations` call (a new source closure is created per pass), so there is no cross-pass or cross-request staleness.

## Testing

1. **Unit (Vitest, fake source)**: same args → underlying accessor called once; different args → once each; non-function props (db) pass through; rejected promise removes cache entry and a later call retries; result equality across callers (same object identity for the shared Promise).
2. **Regression (real data)**: run the existing `verify-rule-batch-parity.mjs` gate — outputs must stay byte-identical.
3. **Timing proof**: re-measure workset 103 / P / June 4× and report median WALL before vs after, plus the pg-query preload output confirming the duplicate accessor queries (8× crewTeams, 7× crewQualEntries, 7× crewOffsets, 5× crewBaseTimezone, 2× flyDuties/assignmentsAll) collapse to single executions.

## Expected impact

- Reference-load DB time roughly cut by the dedup factor → est. WALL median 27.2s → ~23-24s for the benchmark case. No change in result rows or order.