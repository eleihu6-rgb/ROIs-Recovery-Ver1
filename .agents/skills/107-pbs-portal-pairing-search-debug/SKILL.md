---
name: 107-pbs-portal-pairing-search-debug
description: Use when debugging PBS portal pairing search issues, pool counts, rank/base/RP filters, or pairing-search E2E failures.
---

# PBS Portal — Pairing Search Debug & Fix

## Purpose
Debug and fix issues in the PBS portal pairing search feature:
pool counts panel errors, wrong pairing counts, rank/base/RP filter issues.

## Context
- **Portal**: `pbs-portal/` (Vite :3030, proxies `/api` to :3002)
- **Backend**: `pbs-server/` (Fastify :3002, but may conflict — see below)
- **Playbook**: `docs/modules/pbs/portal-playbook.md`

## Port Conflict Gotcha
`ROIs-Altair-PBS-Ver1/pbs-server` may occupy port 3002.
Check: `lsof -nP -i :3002 | grep LISTEN` → verify it's from the right project.
Fix: start Ver4 server on 3012, spin second portal on 3032:
```bash
# Terminal 1: start correct pbs-server
cd pbs-server && PORT=3012 npm run dev

# Terminal 2: start second portal pointing to it
cd pbs-portal && PBS_PORTAL_DEV_PORT=3032 PBS_PORTAL_API_PROXY_TARGET=http://localhost:3012 npx vite
```
Then run tests with:
```bash
PBS_API_URL=http://localhost:3012 PBS_PORTAL_BASE_URL=http://localhost:3032/fpqe/pbs \
  npx playwright test tests/pbs-portal/pairing-search.spec.ts ...
```

## Key Files
- `pbs-server/src/services/pairing-search/actor-base.ts` — `resolvePairingSearchActorContext`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts` — rank + RP filter SQL
- `pbs-server/src/services/pairing-search/pairing-search-service.ts` — orchestrates context + queries
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` — property SQL
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts` — per-property SQL
- `e2e/tests/pbs-portal/pairing-search.spec.ts` — PBS-3200/3201/3202

## Pairing Search Filters Applied (in order)
1. **Base**: `WHERE p.base = actor.base` (from `pbs_user.base` or `crew_base.base`)
2. **Rank**: `AND EXISTS (SELECT 1 FROM pairing_composition pc WHERE pc.pairing_id = p.id AND pc.acting_rank = actor.rank AND pc.is_deleted = 0)` — only when `pbs_user.rank` is non-null
3. **RP date**: `AND (p.sch_str_dt_utc AT TIME ZONE 'UTC')::date BETWEEN $rpStart AND $rpEnd` — scopes to roster period (current month if `roster_period.pbs_*` has no current window)

## RP (Roster Period) Resolution
- Period code e.g. "Jun 2026" → `{ startDate: "2026-06-01", endDate: "2026-06-30" }`
- Resolver: current period logic reads `f8.roster_period.pbs_*` for the bidding window → falls back to `buildFallbackPeriodCode(now)` = current UTC month
- `f8_pbs.pbs_period` is removed; do not use it for current period debugging
- Count impact for crew 247 (CA @ YEG): all months = 745, Jun 2026 only = 105

## Actor Resolution SQL
```sql
SELECT
  COALESCE(NULLIF(BTRIM(pu.base), ''), NULLIF(BTRIM(cb.base), '')) AS base,
  NULLIF(BTRIM(COALESCE(pu.rank, '')), '') AS rank
FROM f8_pbs.pbs_user pu
LEFT JOIN LATERAL (
  SELECT base FROM f8.crew_base WHERE crew_id = $crewId AND exp_dt IS NULL AND is_prime_base = 1
  ORDER BY eff_dt DESC, id DESC LIMIT 1
) cb ON true
WHERE pu.crew_id = $crewId AND pu.user_code = $userCode
```

## Quick Debug Checklist
- "Try refresh again": POST `/api/pairing-search/current-rules/counts` → check status code
  - 404 = wrong server on 3002
  - 422 = unimplemented property code
  - 500 = check pbs-server logs; may be bad bid value format
- Count too high (e.g., 14202 = raw total): rank/base/RP filter not applied → check correct server
- Count seems wrong for month: check what `periodCode` the client is sending; verify `roster_period.pbs_*` has an open window if not using current month
- Count is 0 with valid properties: `pairing_composition` may not have the user's rank; `pbs_user.rank` may be null

## E2E Tests
```bash
# With correct server on 3012 and portal on 3032:
PBS_TEST_USER=247 PBS_TEST_PASS=rois \
PBS_API_URL=http://localhost:3012 \
PBS_PORTAL_BASE_URL=http://localhost:3032/fpqe/pbs \
npx playwright test tests/pbs-portal/pairing-search.spec.ts \
  --reporter=list --config=config/playwright.config.ts --project=pbs-portal
```
Expected: 6/6 pass; PBS-3201 logs "105 pairings" for crew 247 (CA at YEG, Jun 2026 RP).
