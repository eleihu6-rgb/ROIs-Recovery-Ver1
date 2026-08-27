---
name: 119-pbs-overseas-speed-latency
description: Reduce overseas perceived latency for pbs-server (Fastify, :3002) and pbs-portal (React/Vite/TanStack Query) — response compression, low-cardinality route metrics, private ETags on stable GETs, a combined /portal/bootstrap endpoint, portal-layout prefetch, and a byte-aware perf baseline. Use when optimizing PBS transfer size / round trips / unmeasured backend latency, or when adding/maintaining any of those pieces. Also the canonical reference for how to write+run pbs-server (node:test) and pbs-portal (vitest) tests in THIS repo, including the environment gotchas that block them.
---

# PBS Overseas Speed & Latency

Implements the plan `docs/superpowers/plans/2026-06-22-0829-pbs-overseas-speed-latency.md`.
Goal: fewer round trips + smaller payloads + measured latency for overseas PBS users,
without changing the `{ code, data, message }` contract.

## What shipped (origin/main @ 2a21a32a, PBS Ver B9/F5)

1. **Compression** — `@fastify/compress` (gzip, threshold 1024) registered in
   `pbs-server/src/app.ts` after security headers, before routes.
2. **Route metrics** — `observePbsHttpResponse` in `pbs-server/src/plugins/metrics.ts`
   (two Histograms: `rois_pbs_server_http_request_duration_seconds`,
   `rois_pbs_server_http_response_bytes`). Wired from the existing `onResponse` hook in
   `app.ts`. **Labels = method, matched route template (`request.routeOptions.url`), status_code ONLY.**
   Never label with raw `request.url` (query strings) / ids / tokens.
3. **Private ETags** — `pbs-server/src/utils/private-etag.ts` `sendPrivateJsonWithEtag(req,reply,data)`:
   sha1 of `{code,data,message}`, `Cache-Control: private, no-cache`, returns 304 on `If-None-Match`.
   Applied to `bidding-calendar.ts`, `dashboard-profile.ts`, `lineholder-summary.ts`, `portal-bootstrap.ts`.
4. **Portal bootstrap** — `pbs-server/src/routes/portal-bootstrap.ts` GET `/api/portal/bootstrap`
   = `Promise.all`(profile + bidding calendar + lineholder summary) behind one private ETag.
   Contract: `packages/contracts/pbs-portal-bootstrap.{js,d.ts}`. Portal client:
   `pbs-portal/src/shared/services/portal-bootstrap-service.ts`.
5. **Portal prefetch** — `shared-bidding-workbench-layout.tsx` `useEffect([])` calls
   `queryClient.prefetchQuery` for the 3 workbench queries. Hooks export named fetch fns
   (`fetchBiddingCalendar`, `fetchDashboardUserProfile`, `fetchTierPageData`).
6. **Baseline** — `pbs-performance-baseline-core.ts` now records `responseBytes` per sample,
   `avgBytes`/`maxBytes` per endpoint, AvgBytes/MaxBytes report columns, and the bootstrap endpoint.
7. **Doc** — `docs/modules/pbs/2026-06-22-overseas-deployment-cache-headers.md` (CDN/static headers).

## Testing in THIS repo — the gotchas that cost time

- **pbs-server uses `node --test`, NOT vitest** (despite CLAUDE.md). The `npm test` script has a
  hardcoded glob, so `npm test -- <file>` does NOT isolate — it appends. Run one file with:
  `DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/path/x.test.ts`
- **pbs-server tests must set env BEFORE importing app**: `process.env.{DATABASE_URL,PBS_SCHEMA,JWT_SECRET,CORS_ORIGIN}` then
  `const { buildServer } = await import("../app.js")`. Auth = a REAL signed JWT (`jwt.sign({id,name,employeeNo,userCode,userName,authMode:"password"...}, JWT_SECRET)`); the auth plugin does `jwt.verify`, so `"Bearer test"` → 401.
- **buildServer({ skipDatabase: true, <serviceName>Service: {...} })** injects mocks. Service interfaces are
  single-method (getCurrentProfile / getCurrentCalendar / getCurrentSummary). Don't invent methods
  (`getSession` is NOT on PbsAuthService → tsc fails); omit `authService` entirely if you only need JWT auth.
- **Prom metric helper must be idempotent**: tests call `register.clear()`. Create-or-get each Histogram via
  `register.getSingleMetric(name) ?? new Histogram(...)` inside the helper so it survives a cleared registry.
- **Full pbs-server suite: `npm test` = 434 tests, all unit/skipDatabase — no live DB needed.**

- **pbs-server npm install**: `package-lock.json` is **gitignored** (root .gitignore). pbs-server has its
  OWN npm node_modules (root uses pnpm). Install deps with `npm install <pkg> --legacy-peer-deps`
  (pre-existing bullmq/redis peer conflict). Commit only `package.json`.

- **pbs-portal vitest is broken on a fresh/partial install**: importing `@rois/ui` →
  `@radix-ui/react-slot` fails with `Cannot find package 'react'` because `packages/ui/node_modules`
  has no react (react/react-dom are **peerDependencies**, expected to be hoisted by a full install).
  Local fix (uncommitted, node_modules is gitignored):
  `cd packages/ui/node_modules && ln -sfn ../../../pbs-portal/node_modules/react react && ln -sfn ../../../pbs-portal/node_modules/react-dom react-dom`
  Then service-only tests AND component/layout tests run. Run one file: `npx vitest run src/path/x.test.tsx`.
- **Known pre-existing portal failures** (NOT regressions): 6 in `src/features/pairing/`
  (`pairing-bid-control.test.tsx`, `pairing-page.test.tsx`) — pairing-number autocomplete label/id +
  debounce. Confirm any new failure is outside `features/pairing` before blaming your change.

## Versioning + merge discipline

- Bump the **dedicated PBS counters** in `gantt/src/version.ts`: `PBS_BACKEND_VERSION` (pbs-server),
  `PBS_FRONTEND_VERSION` (pbs-portal) — NOT the global BACKEND/FRONTEND (those are live-server/gantt).
- To land ONLY PBS work on main when your working branch carries unrelated WIP: commit each task staging
  only its files, then cherry-pick the PBS commits onto a clean worktree off `origin/main`
  (`git worktree add -b tmp /tmp/x origin/main`), bump version there, `git push origin tmp:main`.
  Keeps unrelated commits + uncommitted WIP off main. Pre-push hook runs UI Standard Gate (must be 0 hard).

## Verify
`npm --prefix pbs-server run build && npm --prefix pbs-server test`
`npm --prefix pbs-portal run build && npm --prefix pbs-portal run lint && npx vitest run` (portal, after the react symlink)
Overseas sample: `npm --prefix pbs-server run perf:pbs -- --base-url=https://<host> --samples=5 --budget-ms=2000`
(reports per-endpoint p95 + avg/max bytes; check `content-encoding: gzip` and repeat-GET 304s).
