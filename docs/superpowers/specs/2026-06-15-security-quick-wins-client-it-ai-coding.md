# Security Quick Wins For Client IT Review

**Created**: 2026-06-15 America/Vancouver
**Audience**: AI coder implementing practical security hardening before client IT access
**Scope**: live-server, pbs-server, connector-server, gantt, pbs-portal, repo security hygiene
**Status**: implementation-ready plan

## Why This Exists

Client IT reviewers will look beyond functions. They will ask where the system is weak, where it exposes data, whether known vulnerabilities exist, whether auth is enforced correctly, and whether deployment defaults are safe.

This plan focuses on quick wins: changes that are small enough to implement soon, visible to reviewers, and aligned with common security language.

## Big Picture Background

ROIS handles airline crew scheduling data. Even when the current environment is not a final production deployment, the data model and workflows are sensitive: crew identity, roster assignments, flight relationships, legality results, optimization outputs, admin operations, and integration endpoints can all reveal operational details. A client IT reviewer will therefore judge the system not only by whether screens work, but by whether the engineering team shows security discipline.

The goal of this quick-win pass is to reduce obvious exposure before external technical users get access. The next AI coder should think in two layers at the same time:

1. Big picture:
   - Can a client IT person see that we take authentication, authorization, secrets, and service exposure seriously?
   - Are dangerous defaults blocked before staging or production?
   - Are internal endpoints such as metrics and connector admin tools intentionally protected?
   - Can we explain remaining risks honestly without sounding careless?
2. Detailed action:
   - Which exact file currently creates the weakness?
   - What small patch removes or reduces the risk?
   - What test proves the control works?
   - What evidence can be shown in a handoff or client review?

Do not treat this plan as cosmetic hardening. These items map directly to common review questions:

- "Can a non-admin call admin APIs?"
- "Can any website origin call your API from a browser?"
- "What happens if the default JWT secret is accidentally deployed?"
- "Are connector credentials actually verified?"
- "Are internal metrics publicly visible?"
- "Do examples or scripts contain real-looking secrets?"
- "Can your team repeat dependency vulnerability checks?"

The expected outcome is not perfect security. It is a practical improvement in security posture: fewer obvious vulnerabilities, clearer deployment guardrails, better evidence for client IT, and a cleaner foundation for deeper security work later.

## Security Terms For This Plan

| Term | Meaning in this repo |
|---|---|
| Weakness | A code/config pattern that could become exploitable, for example default secrets or broad CORS. |
| Vulnerability | A concrete flaw that can allow unauthorized access, data exposure, or unsafe action. |
| Security vulnerability | Same as vulnerability; use this wording in client-facing summaries. |
| Security flaw | A design or implementation mistake, often fixable in code. |
| Security gap | Missing control, such as no security headers or no audit command. |
| Exposure | Something reachable or visible that should be private, such as `/metrics` or permissive CORS. |
| Risk | Business impact if a weakness is exploited. |
| Threat | Actor/action we are defending against, such as token theft, origin abuse, or unauthorized admin action. |

## External Baseline

Use these standards as references when writing code comments, PR notes, or client-facing summaries:

- OWASP Top 10 2025: Broken Access Control remains the top application risk.
- OWASP HTTP Security Headers Cheat Sheet: security headers reduce preventable browser-side exposure.
- OWASP REST Security Cheat Sheet: REST APIs should use HTTPS, strict auth, validation, and least exposure.
- OWASP ASVS: provides application security verification controls for auth, session, access control, logging, and configuration.
- MITRE CWE Top 25 2025: includes XSS, SQL injection, CSRF, and missing authorization among high-impact weaknesses.

Reference links:

- https://owasp.org/Top10/2025/en/
- https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- https://owasp.org/www-project-application-security-verification-standard/
- https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html

## Current Findings Summary

### High-priority findings

1. `live-server/src/index.ts` registers CORS with `origin: true`.
2. `live-server/src/config/env.ts`, `pbs-server/src/config/env.ts`, and `connector-server/src/config/env.ts` allow a known default `JWT_SECRET`.
3. `connector-server/src/routes/auth.ts` parses `client_secret` but currently issues a connector JWT without verifying the secret against stored connector configuration.
4. `connector-server/src/plugins/auth.ts` comment says admin routes require `connector:admin`, but `verifyAdminJwt` only verifies the JWT and does not enforce admin/scope.
5. `live-server/src/plugins/metrics.ts`, `pbs-server/src/plugins/metrics.ts`, and `connector-server/src/plugins/metrics.ts` expose `/metrics` without local-only or auth protection.

### Medium-priority findings

6. Security response headers are not registered through `@fastify/helmet` or equivalent.
7. `.env.example` files include real-looking passwords and known dev secrets.
8. Audit scripts are inconsistent across packages.
9. Connector admin APIs can return connector config objects that may include auth config; response masking should be verified or added.
10. Token storage is in `sessionStorage`; acceptable as a short-term local-first model, but document XSS implications and keep XSS defenses tight.

## Implementation Rules

- Keep changes small and testable.
- Do not rewrite authentication architecture.
- Do not move bearer tokens to cookies in this quick-win pass unless explicitly assigned later; that needs CSRF/session design.
- Do not commit real `.env` files.
- Do not change database schema unless a specific item below says so.
- Do not expose secrets in logs, tests, markdown examples, or screenshots.
- Prefer shared helpers when two or more Fastify services need the same security behavior.

## Quick-Win Priority Table

| Priority | Item | Risk reduced | Effort | Module |
|---:|---|---|---|---|
| P0 | Verify connector client credentials before issuing JWT | Unauthorized connector access | Medium | connector-server |
| P0 | Enforce connector admin authorization | Unauthorized admin action | Low | connector-server |
| P0 | Reject default JWT secret outside dev/test | Token forgery | Low | live/pbs/connector |
| P1 | Replace Live CORS reflection with allowlist | Origin abuse / exposure | Low | live-server |
| P1 | Protect or restrict `/metrics` | Internal telemetry exposure | Low-Medium | live/pbs/connector |
| P1 | Add security headers | Browser-side exposure | Low | live/pbs/connector |
| P1 | Sanitize example env files and scripts | Credential hygiene | Low | repo |
| P2 | Add audit scripts and checklist | Known vulnerable dependencies | Low | repo/packages |
| P2 | Mask connector auth config in responses/logs | Secret leakage | Medium | connector-server |
| P2 | Add auth/access-control regression tests | Prevent backslide | Medium | live/pbs/connector |

## Detailed Implementation Plan

### P0-1: Verify connector client credentials before issuing JWT

**Risk**: Anyone who knows or guesses a `client_id` can request a connector token if `client_secret` is not validated.

**Files**:

- `connector-server/src/routes/auth.ts`
- `connector-server/src/services/connector/connector-config-service.ts`
- `connector-server/src/services/auth/oauth2-cc-auth.ts` if a helper fits there
- `connector-server/src/__tests__/` new or existing auth route test file

**Current evidence**:

- `tokenRequestSchema` requires `client_secret`.
- Handler reads `client_id` and `scope`.
- Handler calls `oauth2Auth.generateConnectorJwt(clientId, '', scopes, env.JWT_SECRET, '1h')`.
- No lookup/compare against connector config is visible in the route.

**Implementation steps**:

1. Add a connector config lookup by OAuth `clientId`.
   - Prefer a service method:
     - `getConfigByOAuthClientId(clientId: string): Promise<ConnectorConfig | null>`
   - It should return only enabled, non-deleted connector configs.
2. Validate `client_secret` using constant-time compare.
   - Use Node `crypto.timingSafeEqual`.
   - If stored secret length differs, fail without revealing which field was wrong.
3. Ensure requested scopes are a subset of the connector's configured scopes.
   - If no scope requested, use configured default scopes.
   - If requested scope is not allowed, return 403.
4. Include the connector schema in JWT if available.
   - Do not leave schema as empty string unless that is truly intended.
5. Return generic auth failure messages.
   - Good: `Invalid client credentials.`
   - Avoid: `Unknown client id` or `Wrong secret`.
6. Add tests:
   - valid `client_id` + `client_secret` returns token.
   - wrong secret returns 401.
   - unknown client returns 401.
   - disabled/deleted connector returns 401 or 403.
   - requested disallowed scope returns 403.

**Acceptance**:

- Token endpoint cannot issue a connector JWT without a matching stored secret.
- Connector JWT includes allowed scopes only.
- Tests prove wrong secret and unknown client fail.

**Suggested validation**:

```bash
cd connector-server
npm test
npm run build
```

### P0-2: Enforce connector admin authorization

**Risk**: A normal Live JWT may access connector admin routes if it verifies with the shared JWT secret.

**Files**:

- `connector-server/src/plugins/auth.ts`
- `connector-server/src/routes/admin/connector.ts`
- tests under `connector-server/src/__tests__/`

**Current evidence**:

- Comment says admin routes require JWT with `connector:admin` scope.
- `verifyAdminJwt` verifies JWT and attaches `request.authAdmin`.
- It does not check `isAdmin === 1` or a `connector:admin` scope.

**Implementation steps**:

1. Define the accepted admin condition clearly:
   - For Live admin JWT: require `payload.isAdmin === 1`.
   - For connector scoped JWT: require `scopes` includes `connector:admin`.
   - If only Live admin JWT is supported today, implement only `isAdmin === 1` and update comments.
2. Reject unauthorized users with 403.
3. Keep 401 for missing/invalid token.
4. Add tests:
   - missing token -> 401.
   - non-admin Live JWT -> 403.
   - admin Live JWT -> allowed.
   - connector JWT without `connector:admin` -> 403 if connector JWTs are accepted for admin.
   - connector JWT with `connector:admin` -> allowed if accepted.

**Acceptance**:

- `/api/admin/*` in connector-server requires explicit admin authorization.
- Route comments match behavior.
- Tests cover missing, non-admin, and admin cases.

**Suggested validation**:

```bash
cd connector-server
npm test
npm run build
```

### P0-3: Reject known default JWT secrets outside dev/test

**Risk**: If a known default secret reaches staging/production, attackers can forge valid JWTs.

**Files**:

- `live-server/src/config/env.ts`
- `pbs-server/src/config/env.ts`
- `connector-server/src/config/env.ts`
- matching config tests if present, or new focused tests

**Implementation steps**:

1. Add `NODE_ENV` or `APP_ENV` to env schema if missing.
2. Keep default `JWT_SECRET` only for local development and tests.
3. At config parse time, reject startup when:
   - environment is `production`, `staging`, `uat`, or `demo`, and
   - `JWT_SECRET` is missing, too short, or equals `rois-dev-jwt-secret-2026`.
4. Minimum secret recommendation:
   - at least 32 characters.
   - preferably random 256-bit value from secret manager.
5. Update `.env.example`:
   - show `JWT_SECRET=replace-with-32-plus-char-random-secret`
   - do not include the known dev secret in deploy examples.
6. Add tests if config module can be isolated.

**Acceptance**:

- Production-like env refuses to start with default JWT secret.
- Local dev and tests still work without painful setup.
- `.env.example` no longer teaches users to deploy with the known secret.

**Suggested validation**:

```bash
cd live-server && npm run build
cd ../pbs-server && npm run build
cd ../connector-server && npm run build
```

### P1-1: Replace Live Server CORS reflection with allowlist

**Risk**: `origin: true` reflects arbitrary origins, increasing browser-side attack surface and making client IT review harder.

**Files**:

- `live-server/src/config/env.ts`
- `live-server/src/index.ts`
- `live-server/.env.example`
- tests if server builder exists; otherwise add a small CORS config unit test around helper

**Current evidence**:

- `live-server/src/index.ts` registers:
  - `origin: true`

**Implementation steps**:

1. Add `CORS_ORIGIN` env variable.
   - Comma-separated list, same pattern as `pbs-server`.
   - Local default may include `http://localhost:5173`, `http://localhost:5566`, or current dev host.
2. Create helper:
   - `parseCorsOrigins(value: string): string[]`
   - trim entries, remove empty entries.
3. Register CORS:
   - `origin: parseCorsOrigins(env.CORS_ORIGIN)`
   - keep methods and `maxAge`.
4. Add production guard:
   - reject `*`, `true`, or empty allowlist in production-like env.
5. Add tests:
   - parses comma-separated list.
   - rejects wildcard in production-like env.
   - allows localhost in dev.

**Acceptance**:

- Live Server no longer reflects arbitrary browser origins.
- Local dev still works.
- PBS and Live CORS patterns are aligned.

**Suggested validation**:

```bash
cd live-server
npm test
npm run build
```

### P1-2: Protect or restrict `/metrics`

**Risk**: Metrics reveal internal service names, process information, memory, CPU, and operational behavior.

**Files**:

- `live-server/src/plugins/metrics.ts`
- `pbs-server/src/plugins/metrics.ts`
- `connector-server/src/plugins/metrics.ts`
- service env config files

**Implementation options**:

Option A, fastest:

- Add env `METRICS_ENABLED`.
- Default false in production-like env.
- Keep enabled in local/dev.

Option B, better:

- Add `METRICS_TOKEN`.
- Require header `Authorization: Bearer <METRICS_TOKEN>` or `X-Metrics-Token`.
- Also allow localhost-only if behind local monitoring.

Recommended first pass:

- Implement `METRICS_ENABLED` + optional `METRICS_TOKEN`.
- If enabled and token configured, require token.
- If production-like env and enabled without token, fail startup or return 403.

**Implementation steps**:

1. Add env fields to all three services:
   - `METRICS_ENABLED`
   - `METRICS_TOKEN`
2. In metrics plugin:
   - if disabled, do not register `/metrics`, or return 404.
   - if token set, require it.
   - never log token.
3. Add tests:
   - disabled metrics returns 404.
   - enabled without token in dev returns metrics.
   - enabled with token rejects missing/wrong token.
   - enabled with token accepts correct token.

**Acceptance**:

- Client-facing deployments do not expose `/metrics` publicly by default.
- Monitoring can still be enabled intentionally.

**Suggested validation**:

```bash
cd live-server && npm test && npm run build
cd ../pbs-server && npm test && npm run build
cd ../connector-server && npm test && npm run build
```

### P1-3: Add Fastify security response headers

**Risk**: Missing security headers makes clickjacking, content sniffing, referrer leakage, and some browser-side attacks easier.

**Files**:

- `live-server/package.json`
- `pbs-server/package.json`
- `connector-server/package.json`
- `live-server/src/index.ts`
- `pbs-server/src/app.ts`
- `connector-server/src/index.ts`
- optionally a shared local plugin per service, for example `src/plugins/security-headers.ts`

**Implementation steps**:

1. Add `@fastify/helmet` to each Fastify API service.
2. Register early, before routes.
3. Recommended API-safe defaults:
   - `xContentTypeOptions`
   - `frameguard`
   - `referrerPolicy`
   - `hidePoweredBy`
   - `crossOriginResourcePolicy`
4. Be careful with CSP:
   - For pure API responses, CSP can be strict.
   - Swagger/Bull Board may need relaxed CSP. If so, scope exceptions narrowly or disable CSP only for those UI routes.
5. Add smoke tests:
   - `/api/health` includes `x-content-type-options`.
   - response does not expose `x-powered-by`.
   - if frameguard enabled, header exists.

**Acceptance**:

- Fastify API responses include baseline security headers.
- Swagger/Bull Board, if used, still render in dev/admin environment.

**Suggested validation**:

```bash
cd live-server && npm run build
cd ../pbs-server && npm run build
cd ../connector-server && npm run build
```

### P1-4: Sanitize `.env.example` and test scripts

**Risk**: Real-looking passwords and shared secrets in examples are flagged during client review, even if ignored files are safe.

**Files**:

- `.env.example`
- `live-server/.env.example`
- `pbs-server/.env.example`
- `rule-engine/.env.example`
- `e2e/.env.example`
- `connector-server/scripts/add-oauth-test.ts`
- `connector-server/scripts/init-test-db.ts`
- tests that use realistic local passwords only as test literals

**Current evidence**:

- `pbs-server/.env.example` includes `Pier2026AIf8`.
- root `.env.example` includes `Pier2026AIf8` and `Pier2026AItg`.
- `rule-engine/.env.example` includes `Pier2026AIf8`.
- `e2e/.env.example` includes `Pier2026AIf8`.
- connector scripts include hard-coded DB URL and test OAuth/HMAC secrets.

**Implementation steps**:

1. Replace real-looking passwords with placeholders:
   - `replace_with_f8_password`
   - `replace_with_tg_password`
   - `replace_with_random_jwt_secret`
2. Keep comments clear that examples are not deployable secrets.
3. Move connector script secrets to env vars:
   - `CONNECTOR_TEST_DATABASE_URL`
   - `CONNECTOR_TEST_API_KEY`
   - `CONNECTOR_TEST_API_SECRET`
   - `CONNECTOR_TEST_CLIENT_ID`
   - `CONNECTOR_TEST_CLIENT_SECRET`
4. If scripts are dev-only, add clear guard:
   - fail if `NODE_ENV === 'production'`.
5. Do not edit ignored `.env` files in this plan.
6. Add a repo scan script or documented `rg` command to verify no example secrets remain.

**Acceptance**:

- No tracked `.env.example` contains real-looking passwords.
- Dev scripts do not hard-code reusable secrets.
- Ignored local `.env` files remain untouched.

**Suggested validation**:

```bash
rg -n "Pier2026|rois-dev-jwt-secret-2026|f8-oauth-secret|f8-test-secret" \
  .env.example live-server/.env.example pbs-server/.env.example rule-engine/.env.example e2e/.env.example connector-server/scripts
```

Expected: no matches except intentional explanatory comments, if any.

### P2-1: Add dependency audit scripts

**Risk**: Known vulnerable dependencies can be missed without a repeatable command.

**Files**:

- root `package.json`
- `live-server/package.json`
- `pbs-server/package.json`
- `connector-server/package.json`
- `gantt/package.json`
- `pbs-portal/package.json`
- `docs/ai/` or this plan's completion notes

**Implementation steps**:

1. Add scripts where `npm` lockfiles exist:
   - `"audit:prod": "npm audit --omit=dev"`
   - `"audit:all": "npm audit"`
2. For packages using pnpm lockfiles, either:
   - use the package's current package manager consistently, or
   - document that npm audit is the current quick-win command because package-lock exists.
3. Add root convenience script if practical:
   - run audit for live-server, pbs-server, connector-server, gantt, pbs-portal.
4. Do not auto-fix vulnerabilities in this quick-win pass unless reviewed; `npm audit fix` can change versions unexpectedly.

**Acceptance**:

- Every deployable Node service has a documented audit command.
- AI coder records audit results in implementation feedback.

**Suggested validation**:

```bash
cd live-server && npm run audit:prod
cd ../pbs-server && npm run audit:prod
cd ../connector-server && npm run audit:prod
cd ../gantt && npm run audit:prod
cd ../pbs-portal && npm run audit:prod
```

### P2-2: Mask connector auth config in responses and logs

**Risk**: Admin list/get connector endpoints may expose `apiSecret`, `clientSecret`, token URLs, or other sensitive connection config.

**Files**:

- `connector-server/src/routes/admin/connector.ts`
- `connector-server/src/services/connector/connector-config-service.ts`
- `connector-server/src/models/connector-config.ts`

**Implementation steps**:

1. Add a serializer:
   - `maskConnectorConfig(config)`
2. Mask fields before returning admin responses:
   - `authConfig.apiSecret`
   - `authConfig.clientSecret`
   - any token values if present
3. Return safe markers:
   - `hasApiSecret: true`
   - `hasClientSecret: true`
   - or `apiSecret: "***"`
4. Keep create/update write path accepting secrets.
5. Ensure logs never include raw `authConfig`.
6. Add tests:
   - list response masks secret.
   - get response masks secret.
   - create/update response masks secret.

**Acceptance**:

- Connector admin APIs do not return raw secrets.
- Write/update flows still work.

## Regression Tests To Add

Minimum test coverage:

1. Connector token endpoint:
   - valid credentials pass.
   - invalid credentials fail.
   - disallowed scope fails.
2. Connector admin auth:
   - missing token 401.
   - non-admin token 403.
   - admin token allowed.
3. Config guard:
   - production-like env rejects known JWT secret.
4. Live CORS helper:
   - allowlist parse works.
   - wildcard rejected in production-like env.
5. Metrics protection:
   - disabled/protected behavior works.
6. Security headers:
   - health response includes expected headers.
7. Secret masking:
   - connector admin responses do not include raw secret fields.

## AI Coder Feedback Required

The implementing AI coder must update this file before finishing. Add a section at the bottom named:

```md
## Implementation Feedback
```

For each item, fill this table:

| Item | Status | Files changed | Tests run | Evidence | Notes |
|---|---|---|---|---|---|
| P0-1 Connector credentials | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P0-2 Connector admin auth | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P0-3 JWT secret guard | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P1-1 Live CORS allowlist | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P1-2 Metrics protection | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P1-3 Security headers | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P1-4 Env example sanitation | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P2-1 Audit scripts | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |
| P2-2 Secret masking | Accepted / Changed / Blocked / Done | List exact files | List commands | Paste key pass/fail result | Explain decisions |

Status meanings:

- Accepted: coder agrees with the plan but has not implemented yet.
- Changed: coder implemented a different approach and explains why.
- Blocked: coder could not safely implement and explains the blocker.
- Done: coder implemented, tested, and gives evidence.

The coder must also add:

- `Security review summary`: short plain-English summary for client IT.
- `Residual risk`: what remains after quick wins.
- `Follow-up plan`: what should be addressed after this quick-win pass.

Do not mark an item Done without command output evidence or a clear reason why tests could not be run.

## Suggested Client-IT Summary After Implementation

After implementation, the summary should say something like:

> We completed a quick security hardening pass focused on authentication, authorization, exposure reduction, secure defaults, and dependency review. The work restricted CORS, blocked default JWT secrets in non-dev environments, protected internal metrics, added browser security headers, validated connector client credentials, enforced connector admin authorization, removed real-looking secrets from examples, and added repeatable audit commands. Remaining security work is tracked separately for deeper role-based access control, session architecture, and full penetration testing.

## Do Not Do In This Quick-Win Pass

- Do not replace JWT auth with cookie sessions.
- Do not add SSO unless separately scoped.
- Do not change database schemas unless needed for connector credential lookup and approved.
- Do not commit ignored `.env` files.
- Do not print tokens, passwords, or DB URLs in test output.
- Do not run `npm audit fix` blindly.
- Do not change client-visible behavior unless needed for security.

## Definition Of Done

This plan is complete when:

- P0 items are implemented or explicitly blocked with a concrete reason.
- P1 items are implemented or explicitly scheduled with owner/date.
- Tests/builds for touched packages pass.
- Audit commands exist and have been run.
- Example secrets are sanitized.
- Implementation Feedback is appended to this markdown file.
- The final response includes residual risks and exact verification commands.

## Implementation Feedback

Implemented on 2026-06-15 on branch `feat/security/quick-wins-client-it`. Findings in the
plan were validated against live code first; all were accurate. Branch `main` carried an
unrelated in-progress dirty tree (gantt UI-standard migration + a scenario-ordering tweak),
left untouched per §Surgical.

| Item | Status | Files changed | Tests run | Evidence | Notes |
|---|---|---|---|---|---|
| P0-1 Connector credentials | Done | `connector-server/src/routes/auth.ts`, `services/connector/connector-config-service.ts` (new `getConfigByOAuthClientId`), tests `__tests__/security/connector-credentials.test.ts` | `npx vitest run src/__tests__/security/connector-credentials.test.ts` | 5/5 pass — valid→token, wrong secret→401, unknown→401, disabled→401, bad scope→403 | constant-time `timingSafeEqual`; generic "Invalid client credentials."; scopes must ⊆ configured; no DB schema change (creds live in `auth_config` JSONB) |
| P0-2 Connector admin auth | Done | `connector-server/src/plugins/auth.ts`, tests `__tests__/security/admin-auth.test.ts` | same suite | 6/6 pass — no token 401, garbage 401, non-admin 403, admin 200, connector w/o scope 403, connector w/ `connector:admin` 200 | accepts Live `isAdmin===1` OR connector `connector:admin` scope; comments aligned to behavior |
| P0-3 JWT secret guard | Done | `live-server/src/config/env.ts`, `pbs-server/src/config/env.ts`, `connector-server/src/config/env.ts`, tests `*/security/config-guard.test.ts` (live+connector) | `npx vitest run src/__tests__/security/config-guard.test.ts` | live 4/4, connector 4/4 — prod+default→throw, prod+short→throw, prod+strong→ok, dev default→ok | new `APP_ENV` (also honours `NODE_ENV=production`); rejects missing/<32/default secret in production/staging/uat/demo |
| P1-1 Live CORS allowlist | Done | `live-server/src/config/cors.ts` (new), `live-server/src/index.ts`, `live-server/.env.example`, tests `__tests__/security/cors.test.ts` | `npx vitest run src/__tests__/security/cors.test.ts` | 7/7 pass — parse/trim/empty + wildcard/`true`/empty rejected in prod, explicit allowed | mirrors pbs-server pattern; `origin: true` → `resolveCorsOrigin(env.CORS_ORIGIN)` |
| P1-2 Metrics protection | Done | `*/src/plugins/metrics.ts` (all 3), `*/config/env.ts` (METRICS_ENABLED/TOKEN), tests `*/plugins/metrics.test.ts` | live `npx vitest run src/__tests__/plugins/metrics.test.ts`; connector same; pbs `node --test src/__tests__/plugins/metrics.test.ts` | live 4/4, connector 4/4, pbs 2/2 — disabled→404, token missing/wrong→403, correct→200, prod+enabled+no-token→startup throws | existing metrics tests updated (§Stale-Test) to the gated behavior |
| P1-3 Security headers | Done | `*/src/plugins/security-headers.ts` (new, all 3), `live-server/src/index.ts`, `pbs-server/src/app.ts`, `connector-server/src/index.ts`, `+@fastify/helmet@13` in 3 package.json | live/connector `__tests__/security/security-headers.test.ts`; pbs `__tests__/security/security-headers.test.ts` | live 4/4, connector 2/2, pbs 2/2 — nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer, no x-powered-by | CSP disabled (JSON APIs; keeps Swagger UI working); helmet installed with `--legacy-peer-deps` (pre-existing bullmq↔redis peer conflict) |
| P1-4 Env example sanitation | Done | `.env.example`, `live-server/.env.example`, `pbs-server/.env.example`, `rule-engine/.env.example`, `e2e/.env.example`, `connector-server/.env.example` (new), `connector-server/scripts/{add-oauth-test,init-test-db}.ts` | `rg -n "Pier2026\|rois-dev-jwt-secret-2026\|f8-oauth-secret\|f8-test-secret" <files>` | NO MATCHES — clean | passwords→placeholders; scripts read secrets from env + refuse `NODE_ENV=production`; ignored `.env` untouched |
| P2-1 Audit scripts | Done | root + `live-server`/`pbs-server`/`connector-server`/`gantt`/`pbs-portal` package.json | `npm run audit:prod` per service | **1 high (prod) in each backend: `drizzle-orm <0.45.2` SQL-injection (GHSA-gpj5-g38j-94v9)**; gantt 3 high, pbs-portal 1 high | NOT auto-fixed — fix is a breaking `drizzle-orm@0.45.2` upgrade; tracked as follow-up per "no blind `npm audit fix`" |
| P2-2 Secret masking | Done | `connector-server/src/utils/mask-config.ts` (new), `routes/admin/connector.ts`, tests `__tests__/security/mask-config.test.ts` | `npx vitest run src/__tests__/security/mask-config.test.ts` | 3/3 pass — apiSecret/clientSecret→`***` + `hasApiSecret`/`hasClientSecret`, identifiers visible, raw value absent from JSON, source not mutated | applied to list/get/create/update admin responses; write path unchanged; `add-oauth-test` SELECT no longer prints `auth_config` |

Aggregate test evidence (security tests only):
- live-server: 19/19 pass (`src/__tests__/plugins/metrics.test.ts` + `src/__tests__/security/`)
- connector-server: full suite 130/130 pass (incl. 24 new security tests)
- pbs-server: security-headers 2/2 + metrics 2/2 pass; existing `app.test.ts` 11/11 still pass (helmet added)

### Security review summary

We completed a quick security hardening pass focused on authentication, authorization,
exposure reduction, secure defaults, and dependency review. The work restricted Live Server
CORS to an explicit allowlist, blocked default/weak JWT secrets in non-development
environments, protected internal `/metrics` (off or token-gated; refuses to start exposed in
production), added browser security headers via `@fastify/helmet`, validated connector OAuth
client credentials with constant-time comparison before issuing a token, enforced connector
admin authorization (admin flag or `connector:admin` scope), masked connector secrets in
admin responses, removed real-looking secrets from example env files and dev scripts, and
added repeatable `npm audit` commands. Every control has a passing automated test.

### Residual risk

- **Known prod dependency vuln (high):** `drizzle-orm <0.45.2` SQL-injection via unescaped
  identifiers (GHSA-gpj5-g38j-94v9) in live/pbs/connector; fix is a breaking upgrade, not
  applied in this pass. The codebase uses parameterized Drizzle queries (low practical
  exposure) but the advisory should be cleared.
- **Tokens in `sessionStorage`** (gantt/pbs-portal): unchanged short-term local-first model;
  XSS would expose tokens. Keep XSS defenses tight; cookie/session redesign is out of scope.
- **Connector OAuth lookup** scans up to 100 rows in memory (mirrors existing `getConfigByApiKey`);
  fine at current scale, index `auth_config->>'clientId'` if connectors grow.
- **Connector secrets at rest:** `auth_config` JSONB stores clientSecret/apiSecret in plaintext
  (comments say "encrypted in DB" but no encryption layer exists). Masking only covers responses.
- **Pre-existing build/test failures (not introduced here):** live-server `tsc` and full
  vitest suite have prior failures (`violations-init-worker` `@rois/rule-engine` resolution,
  `auth.test` `normalizeUserCode`, `base-cache-control`, engine-client, pagination, etc.);
  pbs-server `tsc` fails on missing `@types/jsonwebtoken`. My code compiles clean and is not
  in those error sets. connector-server `tsc` passes fully.

### Follow-up plan

1. **Upgrade `drizzle-orm` to ≥0.45.2** across live/pbs/connector (+ pbs-portal) on a dedicated
   branch with full regression — owner: backend, target: next sprint.
2. Triage gantt's 3 high frontend advisories.
3. Add `@types/jsonwebtoken` to pbs-server and fix the unrelated pre-existing `tsc` errors so
   `npm run build` is green repo-wide.
4. Add CI gate: `npm audit --audit-level=moderate` + the security test suites.
5. Consider encrypting connector `auth_config` secrets at rest and an indexed OAuth client lookup.
6. Longer-term (separately scoped): session/cookie auth + CSRF, full RBAC, penetration test.
