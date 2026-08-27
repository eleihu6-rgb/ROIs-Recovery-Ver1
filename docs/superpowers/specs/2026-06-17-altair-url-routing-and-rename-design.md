# ROIs Altair: URL Routing + Product Rename

**Date:** 2026-06-17  
**Status:** Approved for planning

---

## Overview

Two tightly coupled changes:

1. **Product rename** — "ROIs Crew" → "ROIs Altair" across all UI surfaces.
2. **URL-based tab routing** — switching tabs updates the browser URL; navigating to a URL loads the correct tab. New base path: `/altair/`.

---

## Part 1: Product Rename

### Scope

Only UI-facing strings in the gantt app. No backend, database, or API changes. No git branch / file renames.

### Changes

| File | Before | After |
|------|--------|-------|
| `gantt/index.html` | `<title>ROIs Crew</title>` | `<title>ROIs Altair</title>` |
| `gantt/src/components/auth/login-page.tsx` | `"Crew Scheduling System"` label | `"Altair"` |
| `gantt/src/components/auth/login-page.tsx` | footer `"ROIS · Crew Resource Optimization"` | `"ROIS · Altair"` |

The `ROIS.` wordmark and `"Intelligent Crew Resource Optimization"` tagline are unchanged — they are platform-level, not product-level branding.

---

## Part 2: URL Routing

### Approach: History API sync hook (no new dependency)

The existing keep-alive architecture (all open tabs mounted simultaneously, active tab visible via `visibility:hidden`) is **preserved**. No router library is added.

A new `useUrlSync` hook bridges `shell-store` ↔ `window.location`:

- **URL → module (on mount):** reads `window.location.pathname`, maps to a module, calls `setModule()` — URL wins over localStorage on initial load.
- **URL → module (popstate):** listens to browser back/forward, calls `setModule()` with the derived module.
- **Module → URL (on activeModule change):** calls `history.pushState()` with the new path. Skips the very first render to avoid a race with the mount URL-read.

### Base path change

`vite.config.ts`: `base: "/fpqe/gantt/"` → `base: "/altair/"`

> **Out-of-band:** The nginx/Cloudflare routing rule must be updated from `/fpqe/gantt → vite:5173` to `/altair → vite:5173`. The API proxy paths (`/fpqe/live`, `/fpqe/rule`, `/fpqe/ai`) in `vite.config.ts` are **unchanged** — they are backend routes, not frontend base paths.

### URL scheme

| URL | Module / shell-store value |
|-----|---------------------------|
| `/altair/` | `dashboard` |
| `/altair/live` | `live` |
| `/altair/scenario` | `scenario` |
| `/altair/scenario/:id` | `scenario-gantt:{id}` |
| `/altair/rule` | `rule` |
| `/altair/data` | `data` |
| `/altair/legality` | `legality` |
| `/altair/system` | `system` |
| `/altair/regression` | `regression` |
| `/altair/dev` | `dev` |
| `/altair/help` | `help` |
| `/altair/release` | `release` |
| Unknown path | `dashboard` (fallback) |

Sub-item state (e.g., which Data sidebar page is active, which Live sub-item) stays store-only — not encoded in the URL. §Minimal-First.

### New files / edits

| File | Change |
|------|--------|
| `gantt/src/hooks/use-url-sync.ts` | New hook: path↔module mapping + history sync |
| `gantt/src/components/shell/app-shell.tsx` | Mount `useUrlSync()` inside `AppShell` |
| `gantt/vite.config.ts` | `base` → `"/altair/"` |

### SPA fallback

Vite dev server and `vite preview` serve `index.html` for all non-asset paths by default. Production nginx needs:
```nginx
try_files $uri /altair/index.html;
```

### Browser back/forward behaviour

- Tab click → `history.pushState` → back button returns to previous tab.
- Direct URL navigation → module is derived from pathname on mount.
- Closing a tab while its URL is active → the store activates the nearest open tab, which pushes its URL.

---

## Testing

- E2E: new spec `e2e/tests/gantt/url-routing.spec.ts`
  - Navigate to `/altair/data` → Data tab active
  - Navigate to `/altair/scenario/6` → Scenario-gantt tab opens for id=6
  - Click Live tab → URL updates to `/altair/live`
  - Browser back after two tab switches → correct tab restored
  - Login page: title says "ROIs Altair"
- §No-Illusion: paste Playwright PASS receipt before marking done.

---

## Out of scope

- Sub-item routing (live roster/pairing, data page, scenario sub-filter)
- `pbs-portal` URL routing
- File/directory renames in the repo
- Backend API path changes
