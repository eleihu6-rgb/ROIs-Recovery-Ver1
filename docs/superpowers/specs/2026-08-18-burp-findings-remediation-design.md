# Burp Findings Remediation Design

Date: 2026-08-18

## Scope

Address the open Burp-derived GitHub issues:

- #46: validate persisted permission and lock identifiers.
- #41: send HSTS consistently on the SIT and UAT public responses.
- #27: remove the broad CSP `style-src 'unsafe-inline'` policy without breaking Altair.
- #47: redact the committed Burp report and prevent future raw captures from being committed.

This design does not add Burp as an automated scan engine. That is a separate integration change.

## Decisions

### Identifier validation (#46)

The profile permission endpoints will validate each requested menu and control reference against the canonical `system_menu` records before deleting or inserting privilege rows. Unknown, malformed, or incorrectly related values fail with a 400 response and leave the existing permission set unchanged.

The lock endpoints will accept only the canonical crew-id character set and bounded length already used by the service data model. The route will reject invalid values before they become Redis keys or WebSocket payloads. This is input integrity hardening; JSON responses and `X-Content-Type-Options: nosniff` remain in place, and no claim of browser XSS execution is made without a browser proof.

### Transport and content security policies (#41, #27)

The deployment-managed Nginx configurations for both SIT and UAT will send HSTS on all HTTPS responses, including proxied, static, SPA fallback, error, and WebSocket upgrade paths. The HTTPS-only server configuration will use `max-age=31536000; includeSubDomains`.

Altair CSP will replace the broad `style-src 'unsafe-inline'` directive with a policy that keeps external styles restricted to `self` and allows only the narrowly required inline style-attribute behavior through CSP Level 3 directives. The change must be verified against normal Altair navigation before enforcement. If the browser support or runtime behavior prevents an equivalent restriction, the implementation stops and reports the measured violation rather than weakening unrelated directives.

### Burp report hygiene (#47)

The current Burp HTML report will be sanitized in place: request and response blocks will not retain Authorization, Cookie, Set-Cookie, or proxy-authentication headers. The sanitization must preserve enough endpoint, severity, and remediation evidence for an audit reviewer.

The raw-report location will be ignored, and a repository test or check will reject secret-bearing HTTP headers in committed Burp report artifacts. No Git history rewrite, forced push, credential rotation, or deletion of existing reachable commits is in scope by user decision. The issue and final delivery will state that old repository history can still contain the original export.

## Affected Areas

- `live-server/src/routes/admin/permission-admin.ts`
- `live-server/src/services/admin/permission-admin-service.ts`
- `live-server/src/routes/lock/lock.ts`
- corresponding `live-server/src/__tests__/...` route/service tests
- `deploy/nginx/conf.d/f8-sit.conf` and `deploy/nginx/conf.d/f8-uat.conf`
- `pentest/reports/burp-scanner/report-live-20260818.html`
- `pentest` report-hygiene check and its test, plus the applicable ignore rule

## Verification

1. Focused Live Server tests prove invalid permission and lock identifiers are rejected without DB/Redis mutation and valid identifiers still work.
2. Focused browser coverage proves an injected persisted identifier cannot render as HTML or execute in Altair.
3. Nginx syntax validation runs for both deployment configurations. Header checks against SIT and UAT verify HSTS and the final CSP on static, SPA, API, and WebSocket-relevant routes.
4. Report-hygiene test proves the sanitized file has no secret-bearing headers while retaining finding metadata.
5. `npm run check:ui` runs if the CSP-related frontend verification requires frontend style edits; otherwise it is not applicable.

## Residual Risk

The sanitized replacement does not remove the original Burp report from prior Git commits, clones, forks, caches, or backups. A later approved security response may perform credential rotation and a coordinated history rewrite.
