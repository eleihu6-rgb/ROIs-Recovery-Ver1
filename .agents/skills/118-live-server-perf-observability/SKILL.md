---
name: 118-live-server-perf-observability
description: Add performance + observability to live-server (port 3000) hot Gantt/legality paths without breaking existing behavior — Prometheus route/cache metrics, versioned cache keys (INCR vs SCAN), additive lightweight list modes, recheck status-meta. Use when optimizing live-server latency/DB-load/payload, adding metrics, or executing the live-server performance enhancement plan. Also captures the iCloud-worktree workflow this repo requires.
---

# Live Server Performance & Observability

Patterns proven implementing `docs/superpowers/plans/2026-06-22-0628-live-server-performance-enhancement-ver1.md`
(committed to `main`: 5451e67a, 83e0dc2a, bf1f7915, 3e8b6324, 1b169681). Completion note:
`docs/superpowers/completed/2026-06-22-live-server-performance-enhancement-ver1-completion.md`.

## CRITICAL: work in a worktree OUTSIDE iCloud
The repo is in iCloud Drive and **silently reverts on-disk edits to tracked files mid-session**
(see memory `icloud-reverts-tracked-edits`). Before multi-file edits:
```
git worktree add -b <branch> /Users/kimi/<wt> HEAD
ln -s "<repo>/live-server/node_modules" /Users/kimi/<wt>/live-server/node_modules
ln -s "<repo>/node_modules" /Users/kimi/<wt>/node_modules
```
Edit/test/commit in the worktree. Cherry-pick onto `main` at the end (a plain merge can drag
unmerged sibling-branch commits, since the worktree often branches off another feature's HEAD).
Resolve the inevitable `gantt/src/version.ts` conflict by keeping BOTH bumps.

## Patterns

1. **Idempotent prom-client factory** — `live-server/src/utils/metrics.ts`:
   `getOrCreate{Counter,Histogram}` reuse `register.getSingleMetric(name)` so re-imports
   (vi.resetModules) and multi-entry imports don't throw "already registered".
2. **Cache hit/miss counters** — `utils/cache.ts`: `cache_{hit,miss}_total{cache_group,mode}`.
   `cache_group` = key prefix before first `:` (entity name — bounded, never an id). `mode`=single|chunk.
3. **Route metrics, template-labeled** — `plugins/metrics.ts` adds `onSend` (payload bytes) +
   `onResponse` (`reply.elapsedTime`) hooks. Label by `request.routeOptions.url` (the TEMPLATE,
   e.g. `/api/x/:id`), NEVER the concrete URL. Skip `/metrics` self-scrape. The plugin uses `fp`
   so `addHook` is global. Test that the concrete id does NOT appear in `/metrics` output.
4. **Versioned cache keys instead of SCAN** — `services/roster/roster-service.ts`: chunk key embeds
   a per-crew version (`roster:chunk:<crewId>:v<ver>:<start>:<end>`); writes `INCR roster:chunkver:<crewId>`
   (O(1)); reads versions via `mGet`. Keep an `invalidateAllChunks` (SCAN) fallback only for the rare
   reassign where the OLD crew is unknown. Bumps are fire-and-forget (`.catch`), TTL still backstops.
5. **Additive lightweight list modes** — keep default behavior byte-for-byte; gate the cheap path
   behind a new query enum and include it in the cache key:
   - pairing `?view=summary`: skip the segment fetch, omit `segments` (keep composition for coverage).
   - flight `?grouping=none`: SQL-paginate flat rows (LIMIT/OFFSET), no global bin-packing.
6. **Recheck observability** — `services/rule/legality-recheck.ts`: metrics
   `legality_recheck_total{group,status}` + duration/rule_count/range_days histograms; write a `:meta`
   JSON status record (startedAt/finishedAt/durationSec/ruleCodes/ruleCount/rangeDays) additive to the
   existing string `:status` key. Preserve the non-zero-exit backstop. Labels = group+status only.
7. **Query-plan guardrails** — `scripts/live-server-query-plan-check.sh` +
   `docs/modules/live-server/query-plan-guardrails.md`. EXPLAIN needs the live remote DB (local f8 is
   empty); ship the harness + checklist, pass DSN via `ROIS_DSN` env (no secret in repo).

## Testing (vitest, mock-redis)
- `--reporter=dot` works; `--reporter=list` is broken in this vitest (3.2.6) — use default or dot.
- Read metric values in tests via `register.getSingleMetric(name).get()` then find labeled value.
- Pre-existing fails are real: `flightService.getCompositions` (`allRanks.filter` — rankService.list
  unmocked) + 3 tsc errors (`base-cache-control.test.ts`, `auth/auth.test.ts`). Verify pre-existing by
  stashing your edits and re-running — do not attribute them to your change.
- Build is `npm --prefix live-server run build` (tsc over whole project incl. tests); it fails ONLY on
  the 3 pre-existing test-file errors. Prove your code is type-clean by confirming tsc lists none of
  YOUR files.

## Version bump
live-server is a backend module → bump `BACKEND_VERSION` in `gantt/src/version.ts` (+1).
