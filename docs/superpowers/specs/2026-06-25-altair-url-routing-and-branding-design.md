# ROIs Altair URL Routing and Branding

**Date:** 2026-06-25
**Status:** Approved approach, pending implementation plan

## Goal

Move the Gantt frontend from the old `/fpqe/gantt/` frontend base path to `/altair/`, make the browser URL reflect the active top-level tab, support direct navigation to a scenario Gantt by URL, and rename the visible product branding from "ROIs Crew" to "ROIs Altair".

## Scope

In scope:

- Gantt frontend base path becomes `/altair/`.
- Landing page at `/altair/` opens the Dashboard module.
- Clicking Live updates the browser URL to `/altair/live`.
- Clicking Scenario updates the browser URL to `/altair/scenario`.
- Direct navigation to `/altair/scenario/:id` opens that scenario Gantt tab, for example `/altair/scenario/577`.
- Browser back and forward restore the matching active module.
- UI/browser-tab branding changes from "ROIs Crew" to "ROIs Altair".

Out of scope:

- Backend API route changes. Existing `/fpqe/live`, `/fpqe/rule`, and `/fpqe/ai` proxy paths stay unchanged.
- PBS portal routing.
- Encoding Live sub-items, Scenario filters, Data sub-pages, pane state, or Gantt viewport state in the URL.
- Supporting the misspelled path `/altair/sceanrio`; the canonical route is `/altair/scenario`.
- Repository directory or package renames.

## Existing Context

The Gantt app currently uses a Zustand shell store rather than a route library:

- `gantt/src/stores/shell-store.ts` stores `activeModule` and `openTabs`.
- Static modules use strings such as `dashboard`, `live`, and `scenario`.
- Scenario Gantt tabs already use `scenario-gantt:<id>`, for example `scenario-gantt:577`.
- `gantt/src/components/shell/app-shell.tsx` renders all open tabs in a keep-alive content area, hiding inactive tabs without unmounting them.

This keep-alive behavior is important for Canvas layout, scenario state, and currently open tabs, so the URL routing design should adapt to the shell store instead of replacing it.

## Chosen Approach

Use a lightweight History API sync hook and keep the existing shell/store architecture.

The hook will bridge `window.location.pathname` and `useShellStore`:

- On shell startup, read the current path and set the matching `activeModule`.
- On browser `popstate`, read the path again and set the matching `activeModule`.
- When `activeModule` changes because the user clicked a tab or opened a scenario, push the matching path with `history.pushState`.
- Skip redundant pushes when the current path already matches the active module.

No new routing dependency is introduced.

## URL Mapping

| URL | Shell module |
| --- | --- |
| `/altair/` | `dashboard` |
| `/altair` | `dashboard` |
| `/altair/live` | `live` |
| `/altair/scenario` | `scenario` |
| `/altair/scenario/577` | `scenario-gantt:577` |
| `/altair/data` | `data` |
| `/altair/legality` | `legality` |
| `/altair/system` | `system` |
| `/altair/regression` | `regression` |
| `/altair/pbs` | `pbs` |
| `/altair/dev` | `dev` |
| `/altair/help` | `help` |
| `/altair/release` | `release` |
| unknown `/altair/*` path | `dashboard` |
| path outside `/altair` | `dashboard` |

For scenario IDs:

- Only positive integer IDs map to `scenario-gantt:<id>`.
- Invalid values such as `/altair/scenario/notanumber` fall back to `dashboard`.
- Opening `/altair/scenario/577` adds `scenario-gantt:577` to `openTabs` through the existing `setModule` behavior.

## Branding

Visible Gantt product branding changes from "ROIs Crew" to "ROIs Altair".

Required UI-facing updates:

- Browser tab title: `ROIs Altair`.
- Login product label currently saying "Crew Scheduling System": `Altair`.
- Login footer currently saying "ROIS · Crew Resource Optimization": `ROIS · Altair`.
- Existing platform-level `ROIS` wordmark remains unchanged.

## Implementation Boundaries

Expected code changes:

- `gantt/vite.config.ts`
  - Change Vite `base` from `/fpqe/gantt/` to `/altair/`.
  - Change the dev/preview trailing slash redirect from `/fpqe/gantt` to `/altair`.
  - Keep backend API proxies under `/fpqe/live`, `/fpqe/rule`, and `/fpqe/ai`.
- `gantt/src/hooks/use-url-sync.ts`
  - Add mapping helpers and the History API sync hook.
- `gantt/src/components/shell/app-shell.tsx`
  - Mount the URL sync hook after shell state loads.
- `gantt/index.html`
  - Change document title to `ROIs Altair`.
- `gantt/src/components/auth/login-page.tsx`
  - Update visible login branding strings.
- Tests under `gantt/src/**/__tests__` and/or `e2e/tests/gantt/`
  - Cover mapping helpers and user-visible navigation behavior.

## Startup Ordering

The shell currently restores state from localStorage. URL routing must win over localStorage when a user lands directly on a URL.

Design rule:

- Load persisted shell state first so existing tab metadata remains available.
- Then apply the URL-derived module as the active module if the path maps to one.
- The URL-derived module must be present in `openTabs`.

This preserves useful restored tabs while making direct URL navigation deterministic.

## Production Deployment Note

The frontend server/reverse proxy must serve the SPA under `/altair/`.

Production needs an SPA fallback equivalent to:

```nginx
try_files $uri /altair/index.html;
```

Backend API routes are not part of this path move and should continue to proxy through the existing `/fpqe/*` prefixes unless a separate backend routing change is approved.

## Testing

Automated checks should include:

- Unit tests for `pathToModule` and `moduleToPath`.
- `/altair/` maps to Dashboard.
- `/altair/live` maps to Live.
- `/altair/scenario` maps to Scenario.
- `/altair/scenario/577` maps to `scenario-gantt:577`.
- Clicking Live changes the URL to `/altair/live`.
- Clicking Scenario changes the URL to `/altair/scenario`.
- Opening or activating scenario `577` changes the URL to `/altair/scenario/577`.
- Browser back/forward changes the active module.
- Browser title is `ROIs Altair`.
- Login page shows Altair branding before authentication.

Before completion, run the relevant TypeScript and test commands and report exact pass/fail output.

