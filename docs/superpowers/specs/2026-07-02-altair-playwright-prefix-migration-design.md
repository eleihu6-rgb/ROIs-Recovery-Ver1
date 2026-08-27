# Altair Playwright Prefix Migration Design

## Goal

Make the Gantt Playwright suite express the new active public prefix contract: Gantt page routes and Gantt service API routes use `/altair`, not `/fpqe`.

This is a Playwright-first slice only. Runtime Vite, Cloudflare/nginx, ai-server, and backend code are not changed in this step.

## Scope

Change active Playwright tests, helpers, scripts, and Playwright config so `/fpqe` no longer invalidates the test runner. Gantt Playwright routes should expect:

- App routes under `/altair`.
- Live API mocks under `/altair/live/...`.
- AI API mocks and watch URLs under `/altair/ai/...`.
- Scenario deep links preserved as `/altair/scenario/:id`.

PBS Portal Playwright defaults should use the currently served portal base `/pbs`, not the old `/fpqe/pbs`, so the main Playwright config does not time out waiting for a dead base path.

## Approach

1. Update Gantt E2E route mocks and shared Gantt helpers that currently match `/fpqe/live`, `/fpqe/rule`, or `/fpqe/ai` to match `/altair/live`, `/altair/rule`, or `/altair/ai`.
2. Update URL routing assertions so `/altair/scenario/:id` remains the visible URL when a scenario Gantt tab is opened directly.
3. Update PBS Portal Playwright base defaults and comments from `/fpqe/pbs` to `/pbs`.
4. Keep the Gantt app base assertions at `/altair`.
5. Do not edit runtime source in this step; failures may remain if required backend services are down.

## Testing

After Playwright-only changes, run the smallest relevant checks:

- `rg -n '/fpqe|fpqe|\\/fpqe' e2e --glob '!e2e/test-results/**' --glob '!e2e/results/**' --glob '!test-results/**' --glob '!results/**'`
- `cd e2e && npx playwright test tests/gantt/altair-url-routing.spec.ts --config=config/playwright.config.ts --project=gantt --reporter=list`
- Targeted Gantt specs with changed route mocks, for example `tests/gantt/ai-chat.spec.ts`, if runtime services are available.

If tests fail because required backend services are down or setup dependencies are too broad, report that as a remaining Playwright/runtime blocker separate from `/fpqe`.

## Risks

- This will intentionally make some Gantt E2E tests fail until runtime routes are migrated.
- The main Playwright config may still fail if backend services such as live-server `:3000` or pbs-server `:3002` are not running.
- AI live-stream watch URLs may require a later ai-server config migration from `/fpqe/ai` to `/altair/ai`.
