# Burp Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the validated Burp findings without committing captured credentials or permitting invalid permission and lock identifiers.

**Architecture:** Validation remains at Fastify route/service boundaries and derives allowed permission codes from canonical database rows. Nginx maintains security headers at every HTTPS response location, while a small Pentest sanitizer strips secret-bearing headers from retained Burp evidence before a repository check enforces the policy.

**Tech Stack:** TypeScript, Fastify, Zod, Drizzle, Vitest, Nginx, Node.js.

**Spec:** `docs/superpowers/specs/2026-08-18-burp-findings-remediation-design.md`

## Global Constraints

- Scope is SIT and UAT only; do not scan production.
- Do not put credentials, raw Burp request/response content, or crew personal data into source, tests, issues, or logs.
- Preserve existing API response envelopes and existing valid permission/lock behavior.
- Do not rewrite Git history, force-push, or rotate credentials for #47.
- Use focused tests before broader module verification; run `npm run check:ui` only when frontend style source changes.

---

### Task 1: Validate Profile Permission Identifiers (#46)

**Files:**
- Modify: `live-server/src/services/admin/permission-admin-service.ts`
- Modify: `live-server/src/routes/admin/permission-admin.ts`
- Test: `live-server/src/__tests__/routes/admin/permission-admin.test.ts`

**Interfaces:**
- Consumes: `systemMenu`, `profileMenuPrivilege`, and `profileCtrlPrivilege` database models.
- Produces: `setMenus()` and `setCtrls()` reject identifiers not represented by the canonical menu hierarchy before mutation.

- [ ] **Step 1: Add failing route tests for unknown and malformed values.**

```ts
it('rejects an unknown menu before calling setMenus', async () => {
  const res = await app.inject({
    method: 'PUT', url: '/api/admin/profiles/3/menus',
    payload: { menuCodes: ['<invalid>'] },
  })
  expect(res.statusCode).toBe(400)
  expect(admin.profile.setMenus).not.toHaveBeenCalled()
})
```

Add the equivalent control test for a mismatched `{ menuCode, ctlCode }` pair and assert a valid known pair remains accepted.

- [ ] **Step 2: Run the focused route test and confirm it fails.**

Run: `cd live-server && npm test -- --run src/__tests__/routes/admin/permission-admin.test.ts`

Expected: new rejection assertions fail because current schemas only enforce string length.

- [ ] **Step 3: Add strict code-shape parsing at the route boundary.**

Define a shared `codeSchema` using uppercase letters, digits, and underscores with the existing 50-character limit. Use it for `menuCodes`, `ctrls[].menuCode`, and `ctrls[].ctlCode`; preserve all current valid codes.

- [ ] **Step 4: Validate canonical membership in the service before any delete.**

Query `systemMenu` once per operation. For menus, require every requested code to be a non-button menu. For controls, require a button row whose `parentMenuCode` equals the requested menu code. Throw a typed validation error before `delete(profile*Privilege)` when any item is absent or mismatched.

- [ ] **Step 5: Map the service validation error to the existing 400 envelope and run tests.**

Run: `cd live-server && npm test -- --run src/__tests__/routes/admin/permission-admin.test.ts`

Expected: PASS, including valid full replacement behavior.

- [ ] **Step 6: Commit the focused change.**

```bash
git add live-server/src/services/admin/permission-admin-service.ts \
  live-server/src/routes/admin/permission-admin.ts \
  live-server/src/__tests__/routes/admin/permission-admin.test.ts
git commit -m "fix(live-server): validate profile permission identifiers"
```

### Task 2: Validate Lock Crew Identifiers (#46)

**Files:**
- Modify: `live-server/src/routes/lock/lock.ts`
- Create: `live-server/src/__tests__/routes/lock.test.ts`

**Interfaces:**
- Consumes: request payload `crewId: string`.
- Produces: lock acquire/release/heartbeat routes reject an invalid crew ID before calling `lockService` or `wsBroadcast`.

- [ ] **Step 1: Create a Fastify route test with mocked Redis, lock service, and WebSocket broadcast.**

```ts
const res = await app.inject({
  method: 'POST', url: '/api/locks/acquire',
  payload: { crewId: '<script>', pairingIds: [], username: 'planner' },
})
expect(res.statusCode).toBe(400)
expect(acquireCrewLocks).not.toHaveBeenCalled()
```

Also test a normal numeric/alphanumeric crew ID accepted by the current client contract.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `cd live-server && npm test -- --run src/__tests__/routes/lock.test.ts`

Expected: invalid `crewId` is currently accepted because it only has `min(1)`.

- [ ] **Step 3: Replace the minimum-only Zod rule with the canonical bounded character rule.**

Apply the same rule to acquire, release, and heartbeat schemas. Do not alter `username` ownership semantics in this task.

- [ ] **Step 4: Run the focused lock tests.**

Run: `cd live-server && npm test -- --run src/__tests__/routes/lock.test.ts`

Expected: PASS; invalid input causes no Redis/service/broadcast call.

- [ ] **Step 5: Commit the lock validation change.**

```bash
git add live-server/src/routes/lock/lock.ts live-server/src/__tests__/routes/lock.test.ts
git commit -m "fix(live-server): reject malformed lock crew identifiers"
```

### Task 3: Apply HSTS and Narrow the CSP Style Policy (#41, #27)

**Files:**
- Modify: `deploy/nginx/conf.d/f8-sit.conf`
- Modify: `deploy/nginx/conf.d/f8-uat.conf`
- Test: create `deploy/nginx/test-security-headers.sh`

**Interfaces:**
- Consumes: deployed SIT/UAT Nginx configuration.
- Produces: HSTS on all HTTPS responses and a CSP using `style-src 'self'; style-src-attr 'unsafe-inline'` rather than broad `style-src 'unsafe-inline'`.

- [ ] **Step 1: Add a configuration test that checks both environments.**

```bash
grep -Fq 'Strict-Transport-Security "max-age=31536000; includeSubDomains" always' "$config"
grep -Fq "style-src 'self'; style-src-attr 'unsafe-inline';" "$config"
! grep -Fq "style-src 'self' 'unsafe-inline'" "$config"
```

The test must check every Gantt HTML location because Nginx child `add_header` directives do not inherit parent headers.

- [ ] **Step 2: Run the test and confirm it fails on the current configurations.**

Run: `bash deploy/nginx/test-security-headers.sh`

Expected: FAIL for missing HSTS and broad inline style policy.

- [ ] **Step 3: Add HSTS with `always` to every HTTPS response location and update CSP directives.**

Apply the final header consistently to root redirect, SPA shell/fallback, static assets, and proxied API locations in both configurations. Preserve existing directives and CSP connect sources.

- [ ] **Step 4: Run local configuration and header tests.**

Run: `bash deploy/nginx/test-security-headers.sh`

Run: `ssh yuan.z@10.15.12.2 'sudo nginx -t'`

Expected: both PASS. Do not reload Nginx until the deployment change is reviewed.

- [ ] **Step 5: After deployment, verify SIT and UAT headers without credentials.**

Run: `curl -sSI https://crew-f8-usva-sit.roiscloud.com/altair/`

Run: `curl -sSI https://crew-f8-usva-uat.roiscloud.com/altair/`

Expected: HSTS present and CSP contains the narrowed style directives.

- [ ] **Step 6: Commit the configuration and test.**

```bash
git add deploy/nginx/conf.d/f8-sit.conf deploy/nginx/conf.d/f8-uat.conf \
  deploy/nginx/test-security-headers.sh
git commit -m "fix(nginx): harden HSTS and CSP style policy"
```

### Task 4: Sanitize Burp Evidence and Block Future Secret-Bearing Exports (#47)

**Files:**
- Create: `pentest/src/report/burp-report-sanitizer.ts`
- Create: `pentest/src/report/burp-report-sanitizer.test.ts`
- Modify: `pentest/package.json`
- Modify: `pentest/reports/burp-scanner/report-live-20260818.html`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a Burp HTML report string.
- Produces: `sanitizeBurpReport(html: string): string`, which redacts values for Authorization, Cookie, Set-Cookie, Proxy-Authorization, and Proxy-Authenticate headers while preserving report structure.

- [ ] **Step 1: Add failing sanitizer tests with synthetic report fragments only.**

```ts
expect(sanitizeBurpReport('Authorization: Bearer sample-token<br>')).toContain(
  'Authorization: [REDACTED]<br>',
)
expect(sanitizeBurpReport('Cookie: a=b<br>')).not.toContain('a=b')
expect(sanitizeBurpReport('Severity: High<br>')).toContain('Severity: High')
```

Never use a production token, real crew ID, or copied raw report line in tests.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `cd pentest && npm test -- --run src/report/burp-report-sanitizer.test.ts`

Expected: FAIL because the sanitizer does not exist.

- [ ] **Step 3: Implement line-preserving header redaction and a report guard.**

Match only header labels at an HTML line boundary and replace their values with `[REDACTED]`; do not parse or alter finding descriptions. Add an npm script that fails when a Burp report contains any protected header followed by a non-redacted value.

- [ ] **Step 4: Sanitize the committed report using the new implementation.**

Run the sanitizer against `pentest/reports/burp-scanner/report-live-20260818.html`, then run the guard. Confirm the report remains valid HTML and its issue headings still exist.

- [ ] **Step 5: Ignore future raw Burp exports and run Pentest verification.**

Add an ignore rule for raw Burp capture exports while retaining the sanitized audit artifact. Run:

```bash
cd pentest && npm test -- --run src/report/burp-report-sanitizer.test.ts
cd pentest && npm run typecheck
```

- [ ] **Step 6: Commit the sanitized artifact and guard.**

```bash
git add .gitignore pentest/package.json pentest/src/report/burp-report-sanitizer.ts \
  pentest/src/report/burp-report-sanitizer.test.ts \
  pentest/reports/burp-scanner/report-live-20260818.html
git commit -m "fix(pentest): redact sensitive Burp report headers"
```

### Task 5: End-to-End Verification and Issue Evidence

**Files:**
- Modify: no repository files unless a stale test requires correction.

**Interfaces:**
- Consumes: the completed changes from Tasks 1-4.
- Produces: verified remediation evidence for GitHub issues #46, #41, #27, and #47.

- [ ] **Step 1: Run the smallest service and Pentest test sets.**

```bash
cd live-server && npm test -- --run src/__tests__/routes/admin/permission-admin.test.ts src/__tests__/routes/lock.test.ts
cd pentest && npm test -- --run src/report/burp-report-sanitizer.test.ts
```

- [ ] **Step 2: Run module-level static verification.**

```bash
cd live-server && npm run build
cd pentest && npm run typecheck
bash deploy/nginx/test-security-headers.sh
```

- [ ] **Step 3: Run the deployed header and browser checks after deployment.**

Use Playwright to open SIT Altair Live, Scenario, Legality, and Data routes and assert normal first paint plus no CSP console violation. Capture only non-sensitive evidence.

- [ ] **Step 4: Add sanitized verification comments to issues.**

Comment on #46 with focused test results, #41/#27 with deployed header results, and #47 with sanitizer/guard results plus the explicitly accepted old-history residual risk. Do not paste raw HTTP captures.

- [ ] **Step 5: Inspect changed scope before final commit and handoff.**

Run: `git diff --check` and the available changed-symbol impact inspection. Verify only the planned files were touched, preserve unrelated existing changes, and report exact PASS/FAIL receipts.
