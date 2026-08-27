---
name: 110-rule-param-recheck-alert-center-count
description: End-to-end Playwright pattern — change a legality rule's param, fire a scoped live recheck, reopen the gantt, and READ the per-rule violation count off the Alert Center group badge (not the canvas bell). Use to prove "param change → recompute → reopen → see new violations" for any wired rule (8002/8056/8030/8004/7501/7503/7504/7505/7506), or as the recipe for any rule-param before/after count comparison.
---

# Rule param change → scoped recheck → Alert Center count (end-to-end)

Prove the live legality loop through the real UI/stack:

```
PATCH /api/legality/rule/:id/params   (change one row's value)
  → POST /api/legality/recheck {ruleCodes:['8002']}   (SCOPED per-rule, the perf fix)
    → live-legality.mjs recomputes only that rule over the window → rewrites rule_violation
  → reopen gantt → Alert Center → group by Rule → read the "<code>/<inst>" count badge
```

Worked example committed: `e2e/tests/gantt/legality-recheck-8002-count-compare.spec.ts`
(**Viol-8011**: 59h cap → 19 msgs vs 100h cap → 0 msgs; tighter cap ⇒ strictly more).
Companion: `legality-recheck-8002-user-story.spec.ts` (Viol-8010, message-text assertion).

## Why the Alert Center, not the canvas bell

The canvas "bell" is a per-crew visual indicator — you can't read a number off it and a
Playwright assertion has to reverse-engineer `__ganttTest.liveViolations()`. The **Alert
Center** gives a ready-made count:

- open: `getByTestId('violations-button').first().click()` → `violation-list-dialog`
- group by rule: `dialog.getByTestId('alert-groupby-rule').click()`
- each rule is an `alert-group-item` showing `<code>/<inst>` (e.g. `8002/006`) + a **count
  badge** (the trailing `tabular-nums` span)
- rows (non-virtualized, exact count): `[data-testid="violation-list-row"][data-rule-id="8002/006"]`
- close: `getByTestId('violation-list-dialog-close')` — NOT `getByRole('button',{name:'Close'})`
  (strict-mode violation: title-bar X **and** footer Close both match)

This guidance is also memo'd in `docs/architecture/rule-migration-playbook.md` (Phase 5).

## The recipe (copy from the worked example)

1. **Login + get rule**: `ganttApiLogin(request)`; GET `/api/legality/ruleset/103`, find
   `function===8002 && instance==='006'`. Keep `rule.id` and original `rule.paramJson`.
2. **Change a cell**: deep-clone paramJson, set `tables[0].rows[0][COL]` (8002/006 Max
   Limits = **col 7**: …Period(4) Unit(5) Prorated(6) MaxLimits(7) MinLimits(8) Type(9)).
   PATCH `/api/legality/rule/:id/params` with `{paramJson}`, **timeout 60_000** (the route
   hits the remote DB via `affectedRuleCodes`; default 15s is too tight).
3. **Recheck scoped**: POST `/api/legality/recheck` `{groupCode:'pbs_solver_ruleset',
   from, to, ruleCodes:['8002']}`, timeout 60_000. Window = gantt's default 2-month
   (`2026-06-01`..`2026-08-01` for June data). The POST returns immediately (`computing`);
   poll GET `/api/legality/recheck-status?groupCode=...` until `status==='done'` (or
   `failed`). Wrap the poll GET in try/catch — the server is busy mid-recheck.
4. **Reopen gantt**: `seedGanttAuth` then `gotoGantt(page)`.
5. **Wait for the async violation stream to settle** before reading the badge: poll
   `__ganttTest.liveViolations()` filtered to the rule code until the count stops growing
   (two equal reads ~3s apart). Reading too early undercounts.
6. **Read the count** from the Alert Center (above). Assert the **invariant**, not a
   hard-coded headcount: tighter cap ⇒ more, looser ⇒ fewer (`lowCount > highCount`,
   `lowCount > 0`, `highCount >= 0`).
7. **Restore** in `finally`: PATCH back the original `rule.paramJson` + one more scoped
   recheck so the shared DB is left as found. The DB is shared — never leave a changed cap.

Run alone (heavy: ~4 min, two rechecks + two bootstraps):
```
cd e2e && GANTT_API_URL=http://127.0.0.1:3000 npx playwright test \
  --config=config/playwright.config.ts --project=gantt \
  tests/gantt/legality-recheck-8002-count-compare.spec.ts --no-deps --reporter=list
```

## Gotchas (cost real time — read before running)

- **Shared redis client can wedge.** The live-server uses ONE `fastify.redis` client. After
  a long heavy session it can get stuck: every `get`/`set` hangs forever (no command
  timeout) while Redis itself is healthy. Symptom: `/api/health` + `/api/auth/login`
  (DB-only) return instantly, but `/api/legality/recheck-status` and POST `/recheck`
  (redis ops) hang → POST times out at 60s. Fix: **restart live-server** (`touch
  live-server/src/index.ts` triggers tsx-watch reload), then poll `recheck-status` until
  HTTP 200. websocket pSubscribe uses a *duplicated* client (`websocket.ts:120`), so that's
  not the cause — it's just a stale/half-open shared connection.
- **Redis key casing split (open bug).** Recheck status keys exist under BOTH `f8` and `F8`
  (`legality:recheck:F8:pbs_solver_ruleset:status` vs `f8:...`). The route uses
  `env.FILIALE` (now `F8`); older code/CLI used lowercase `f8`. Reads/writes can target
  different keys. Worth unifying to one casing.
- **8002 must attach a pairing or it's invisible.** 8002 `rule_violation` rows had
  `pairing_id NULL` and the gantt does NOT surface null-pairing violations. The recheck
  core attaches the crew's first pairing (`firstPairingByCrew`) so the bell/Alert Center
  render. If a rule shows 0 on the gantt but the DB has rows, check pairing attribution.
- **Baseline drift.** The 8002/006 28-day cap baseline in the shared DB is currently
  **55:00** (was documented 40:00). Don't assume a fixed baseline — capture it at test
  start and restore exactly that. Assert invariants, not absolute counts (other sessions
  edit rosters on the shared remote DB).
- **Counts drift / under-load timeouts.** Repeated heavy gantt bootstraps contend the
  shared remote DB; use generous timeouts (recheck-settle 300s, stream-settle 90s) and
  resilient polling.

## Where the code lives

- Recheck core (param-driven rules, scoping): `live-server/scripts/legality-recheck-core.mjs`
- Live runner + scoped DELETE: `live-server/scripts/live-legality.mjs` (`--rules a,b`)
- Spawn + dep map + crash-spin backstop: `live-server/src/services/rule/legality-recheck.ts`
  (`affectedRuleCodes`, `spawnLiveRecheck`, `RULE_RECHECK_DEPS`)
- Routes: `live-server/src/routes/rule/legality.ts` (PATCH returns `recheckRuleCodes`;
  POST `/recheck` accepts `ruleCodes`)
- Alert Center UI: `gantt/src/components/panes/violation-list-dialog.tsx`
- Gantt test helpers: `e2e/utils/gantt-hook.ts` (`seedGanttAuth`/`gotoGantt`/`ganttApiLogin`)

## Update 2026-06-23 — recheck is now dynamic (no hardcoded instance/param)

The recheck engine (`legality-recheck-core.mjs`) was rewritten so live auto-check AND scenario
manual recheck pull rule function/instance + param VALUES from their own rule set at runtime
(`resolveRulesetRules(db, rulesetId)` → `ctx.instancesOf(fn)`); kernels run every instance × every
param row, tag `rule_instance` + a new `scope_key` (e.g. `28CD`/`90CD`/`365CD`), and skip+log on
missing/Type=DP (no silent fallback). Implications for this recipe:

- **Rule codes renamed**: every instance is now `/001` (e.g. assert **`8002/001`**, not `8002/006`).
  Alert Center group testid still `[data-rule-id="8002/001"]`; rows are per `(instance, scope_key)`.
- **Identity moved to `ruleset_id`** (bigint workset id; Model-B `rule_group` dropped). Default live
  set = workset **103**. `rule_violation`/`legality_status` use `ruleset_id` not `rule_group_code`.
  The recheck route still accepts a string `--group` and resolves it (numeric → used as ruleset_id).
- **Migration** `sql/migration/2026-06-23-rule-violation-scope-key.sql` adds `scope_key` + widens the
  unique key with `rule_instance` + `scope_key` (run on f8 + scenario). Recheck writers MUST use the
  new ON CONFLICT target — a stale checkout's recheck breaks on the new constraint.
- **Stale-server trap**: an out-of-date live-server 500s on `/api/legality/rulesets`
  (`relation "rule_group" does not exist`) → gantt loads no rulesets → no violations. Run up-to-date
  servers. To validate worktree code, run worktree live-server (PORT in .env) + gantt vite with
  `VITE_LIVE_TARGET=http://127.0.0.1:<port>`; browser reads the shared DB so the recheck (your core)
  and the read both see the same rows. Proven by `e2e/tests/gantt/legality-dynamic-instance-recheck.spec.ts`
  (**Live-1320**: Alert Center shows 8002/001, no stale 8002/006).
