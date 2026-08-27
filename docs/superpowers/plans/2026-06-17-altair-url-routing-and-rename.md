# ROIs Altair — URL Routing + Product Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product to "ROIs Altair" across all UI, move the app to base path `/altair/`, and make tab-switching update the browser URL.

**Architecture:** A `useUrlSync` hook bridges the existing Zustand `shell-store` to `window.history` — no router library. On mount it reads the URL and calls `setModule`; on `activeModule` change it calls `history.pushState`; on popstate it calls `setModule`. The keep-alive architecture (all tabs mounted, active one visible) is fully preserved.

**Tech Stack:** React 19, Zustand, Vite, Playwright (E2E), Vitest (unit)

**Spec:** `docs/superpowers/specs/2026-06-17-altair-url-routing-and-rename-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `gantt/index.html` | Browser tab title |
| Modify | `gantt/src/components/auth/login-page.tsx` | UI branding text |
| Create | `e2e/tests/gantt/altair-branding.spec.ts` | Rename regression test |
| Create | `gantt/src/hooks/use-url-sync.ts` | Path utilities + `useUrlSync` hook |
| Create | `gantt/src/hooks/__tests__/url-sync.test.ts` | Unit tests for path mapping |
| Modify | `gantt/src/components/shell/app-shell.tsx` | Mount `useUrlSync()` |
| Modify | `gantt/vite.config.ts` | `base` → `/altair/`; webServer comment |
| Modify | `e2e/tests/gantt/auth.setup.ts` | Update goto path to `/altair/` |
| Modify | `e2e/config/playwright.config.ts` | Update webServer URL + comments |
| Create | `e2e/tests/gantt/url-routing.spec.ts` | E2E tests for URL routing |
| Modify | `gantt/src/version.ts` | Bump `FRONTEND_VERSION` (+2: one per task) |

---

## Task 1: Rename ROIs Crew → ROIs Altair

**Files:**
- Modify: `gantt/index.html`
- Modify: `gantt/src/components/auth/login-page.tsx`
- Create: `e2e/tests/gantt/altair-branding.spec.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Write the failing E2E test**

Create `e2e/tests/gantt/altair-branding.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

/**
 * Branding regression — product renamed from "ROIs Crew" to "ROIs Altair".
 *
 * Nav-6001–6002
 */

test('Nav-6001 — browser tab title is ROIs Altair', async ({ page }) => {
  await page.goto('/altair/')
  expect(await page.title()).toBe('ROIs Altair')
})

test.describe('unauthenticated login page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Nav-6002 — login page subtitle shows Altair branding', async ({ page }) => {
    await page.goto('/altair/')
    // The ROIS wordmark stays; the subtitle changes from "Crew Scheduling System" to "Altair"
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible()
    await expect(page.getByText('Altair', { exact: false })).toBeVisible()
    // Old branding must not appear
    await expect(page.getByText('Crew Scheduling System')).not.toBeVisible()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /path/to/repo
npx playwright test e2e/tests/gantt/altair-branding.spec.ts --config e2e/config/playwright.config.ts --reporter=list
```

Expected: FAIL — title is still "ROIs Crew", text "Altair" not found.

- [ ] **Step 3: Update the browser tab title**

In `gantt/index.html`, change:
```html
<title>ROIs Crew</title>
```
to:
```html
<title>ROIs Altair</title>
```

- [ ] **Step 4: Update the login page branding**

In `gantt/src/components/auth/login-page.tsx`, make two changes:

Change the subtitle label (around line 210):
```tsx
// Before:
          Crew Scheduling System
// After:
          Altair
```

Change the footer (around line 225):
```tsx
// Before:
        © 2026 ROIS · Crew Resource Optimization
// After:
        © 2026 ROIS · Altair
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx playwright test e2e/tests/gantt/altair-branding.spec.ts --config e2e/config/playwright.config.ts --reporter=list
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Bump FRONTEND_VERSION**

In `gantt/src/version.ts`, change:
```typescript
export const FRONTEND_VERSION = 274
```
to:
```typescript
export const FRONTEND_VERSION = 275
```

- [ ] **Step 7: Commit**

```bash
git add gantt/index.html gantt/src/components/auth/login-page.tsx e2e/tests/gantt/altair-branding.spec.ts gantt/src/version.ts
git commit -m "feat(gantt): rename ROIs Crew → ROIs Altair in UI"
```

---

## Task 2: URL path mapping — unit tests + implementation

**Files:**
- Create: `gantt/src/hooks/__tests__/url-sync.test.ts`
- Create: `gantt/src/hooks/use-url-sync.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `gantt/src/hooks/__tests__/url-sync.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { pathToModule, moduleToPath } from '../use-url-sync'

describe('pathToModule', () => {
  it('maps /altair/ to dashboard', () => {
    expect(pathToModule('/altair/')).toBe('dashboard')
  })
  it('maps /altair (no trailing slash) to dashboard', () => {
    expect(pathToModule('/altair')).toBe('dashboard')
  })
  it('maps /altair/live to live', () => {
    expect(pathToModule('/altair/live')).toBe('live')
  })
  it('maps /altair/scenario to scenario', () => {
    expect(pathToModule('/altair/scenario')).toBe('scenario')
  })
  it('maps /altair/rule to rule', () => {
    expect(pathToModule('/altair/rule')).toBe('rule')
  })
  it('maps /altair/data to data', () => {
    expect(pathToModule('/altair/data')).toBe('data')
  })
  it('maps /altair/legality to legality', () => {
    expect(pathToModule('/altair/legality')).toBe('legality')
  })
  it('maps /altair/system to system', () => {
    expect(pathToModule('/altair/system')).toBe('system')
  })
  it('maps /altair/regression to regression', () => {
    expect(pathToModule('/altair/regression')).toBe('regression')
  })
  it('maps /altair/dev to dev', () => {
    expect(pathToModule('/altair/dev')).toBe('dev')
  })
  it('maps /altair/help to help', () => {
    expect(pathToModule('/altair/help')).toBe('help')
  })
  it('maps /altair/release to release', () => {
    expect(pathToModule('/altair/release')).toBe('release')
  })
  it('maps /altair/scenario/6 to scenario-gantt:6', () => {
    expect(pathToModule('/altair/scenario/6')).toBe('scenario-gantt:6')
  })
  it('maps /altair/scenario/460 to scenario-gantt:460', () => {
    expect(pathToModule('/altair/scenario/460')).toBe('scenario-gantt:460')
  })
  it('falls back to dashboard for unknown paths', () => {
    expect(pathToModule('/altair/unknown')).toBe('dashboard')
  })
  it('falls back to dashboard for deep unknown paths', () => {
    expect(pathToModule('/altair/scenario/notanumber')).toBe('dashboard')
  })
  it('falls back to dashboard for / (not under /altair)', () => {
    expect(pathToModule('/')).toBe('dashboard')
  })
})

describe('moduleToPath', () => {
  it('maps dashboard to /altair/', () => {
    expect(moduleToPath('dashboard')).toBe('/altair/')
  })
  it('maps live to /altair/live', () => {
    expect(moduleToPath('live')).toBe('/altair/live')
  })
  it('maps scenario to /altair/scenario', () => {
    expect(moduleToPath('scenario')).toBe('/altair/scenario')
  })
  it('maps rule to /altair/rule', () => {
    expect(moduleToPath('rule')).toBe('/altair/rule')
  })
  it('maps data to /altair/data', () => {
    expect(moduleToPath('data')).toBe('/altair/data')
  })
  it('maps legality to /altair/legality', () => {
    expect(moduleToPath('legality')).toBe('/altair/legality')
  })
  it('maps system to /altair/system', () => {
    expect(moduleToPath('system')).toBe('/altair/system')
  })
  it('maps scenario-gantt:6 to /altair/scenario/6', () => {
    expect(moduleToPath('scenario-gantt:6')).toBe('/altair/scenario/6')
  })
  it('maps scenario-gantt:460 to /altair/scenario/460', () => {
    expect(moduleToPath('scenario-gantt:460')).toBe('/altair/scenario/460')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/repo/gantt
npx vitest run src/hooks/__tests__/url-sync.test.ts
```

Expected: FAIL — "Cannot find module '../use-url-sync'"

- [ ] **Step 3: Implement the path utility functions**

Create `gantt/src/hooks/use-url-sync.ts` (utility functions only for now — the hook is added in Task 3):

```typescript
import type { ActiveModule } from '@/stores/shell-store'

export const URL_BASE = '/altair'

const KNOWN_MODULES = [
  'live', 'scenario', 'rule', 'data', 'legality',
  'system', 'regression', 'dev', 'help', 'release',
] as const

/** Map a browser pathname to a shell-store module string. */
export function pathToModule(pathname: string): ActiveModule {
  // Strip the base prefix, then normalise leading/trailing slashes
  const rest = pathname.slice(URL_BASE.length).replace(/^\//, '').replace(/\/$/, '')
  if (!rest) return 'dashboard'

  // /altair/scenario/:id → scenario-gantt:{id}
  const scenarioMatch = rest.match(/^scenario\/(\d+)$/)
  if (scenarioMatch) return `scenario-gantt:${scenarioMatch[1]}`

  if ((KNOWN_MODULES as readonly string[]).includes(rest)) return rest as ActiveModule
  return 'dashboard'
}

/** Map a shell-store module string to its canonical browser pathname. */
export function moduleToPath(module: ActiveModule): string {
  if (module === 'dashboard') return `${URL_BASE}/`
  if (module.startsWith('scenario-gantt:')) {
    return `${URL_BASE}/scenario/${module.slice('scenario-gantt:'.length)}`
  }
  return `${URL_BASE}/${module}`
}

/** Placeholder — Task 3 replaces this with the real hook body. */
export function useUrlSync(): void {}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /path/to/repo/gantt
npx vitest run src/hooks/__tests__/url-sync.test.ts
```

Expected: PASS — all 24 tests pass.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/hooks/use-url-sync.ts gantt/src/hooks/__tests__/url-sync.test.ts
git commit -m "feat(gantt): URL path mapping utilities for Altair routing"
```

---

## Task 3: useUrlSync hook + Vite base + E2E wiring

**Files:**
- Modify: `gantt/src/hooks/use-url-sync.ts` (replace the placeholder `useUrlSync`)
- Modify: `gantt/src/components/shell/app-shell.tsx`
- Modify: `gantt/vite.config.ts`
- Modify: `e2e/tests/gantt/auth.setup.ts`
- Modify: `e2e/config/playwright.config.ts`
- Create: `e2e/tests/gantt/url-routing.spec.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Write the failing E2E tests**

Create `e2e/tests/gantt/url-routing.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

/**
 * URL routing — tab changes update the URL; direct URL navigation loads the correct tab.
 *
 * Nav-6010–6015
 *
 * These tests require the app to be running with base: "/altair/" in vite.config.ts.
 * They run authenticated (storageState from gantt-admin.json via the gantt project config).
 */

test('Nav-6010 — app root /altair/ shows the shell (authenticated)', async ({ page }) => {
  await page.goto('/altair/')
  await expect(page.getByTestId('shell-top-nav-wrap')).toBeVisible({ timeout: 15_000 })
})

test('Nav-6011 — clicking Live tab sets URL to /altair/live', async ({ page }) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page).toHaveURL(/\/altair\/live$/)
})

test('Nav-6012 — clicking Data tab sets URL to /altair/data', async ({ page }) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await expect(page).toHaveURL(/\/altair\/data$/)
})

test('Nav-6013 — navigating directly to /altair/data loads the Data tab', async ({ page }) => {
  await page.goto('/altair/data')
  await expect(page.getByTestId('shell-top-nav-wrap')).toBeVisible({ timeout: 15_000 })
  // Data tab nav button should appear active (it's the module that was loaded)
  await expect(page).toHaveURL(/\/altair\/data$/)
  // Data-specific sidebar item must be visible to confirm Data tab is active
  await expect(page.getByTestId('data-tree-item-basic.org-base')).toBeVisible({ timeout: 10_000 })
})

test('Nav-6014 — navigating directly to /altair/live loads the Live tab', async ({ page }) => {
  await page.goto('/altair/live')
  await expect(page.getByTestId('shell-top-nav-wrap')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/altair\/live$/)
  // The Live sidebar shows "Scheduling" section header
  await expect(page.getByTestId('shell-sidebar')).toBeVisible()
})

test('Nav-6015 — browser back button restores the previous tab URL', async ({ page }) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  await expect(page).toHaveURL(/\/altair\/live$/)
  await page.getByTestId('module-nav-data').click()
  await expect(page).toHaveURL(/\/altair\/data$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/altair\/live$/)
})
```

- [ ] **Step 2: Run the E2E tests to confirm they fail**

```bash
npx playwright test e2e/tests/gantt/url-routing.spec.ts --config e2e/config/playwright.config.ts --reporter=list
```

Expected: FAIL — app is still served at `/fpqe/gantt/`, navigation to `/altair/` may 404 or show wrong content.

- [ ] **Step 3: Implement the useUrlSync hook body**

In `gantt/src/hooks/use-url-sync.ts`, replace the placeholder `useUrlSync` with:

```typescript
/**
 * Syncs the shell-store activeModule ↔ window.location.pathname.
 *
 * URL → module: on mount, reads the pathname and overrides localStorage.
 * URL → module: on popstate (back/forward), reads the new pathname.
 * module → URL: on activeModule change, pushes a new history entry.
 *   (Skips the very first render to avoid pushing before the URL-read
 *    effect has had a chance to correct the module from the URL.)
 */
export function useUrlSync(): void {
  const setModule = useShellStore((s) => s.setModule)
  const activeModule = useShellStore((s) => s.activeModule)
  const skipFirst = useRef(false)

  // URL → module
  useEffect(() => {
    const urlModule = pathToModule(window.location.pathname)
    if (urlModule !== useShellStore.getState().activeModule) {
      setModule(urlModule)
    }
    const handler = () => setModule(pathToModule(window.location.pathname))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [setModule])

  // module → URL
  useEffect(() => {
    if (!skipFirst.current) {
      skipFirst.current = true
      return
    }
    const path = moduleToPath(activeModule)
    if (window.location.pathname !== path) {
      history.pushState(null, '', path)
    }
  }, [activeModule])
}
```

The full file `gantt/src/hooks/use-url-sync.ts` now looks like:

```typescript
import { useEffect, useRef } from 'react'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveModule } from '@/stores/shell-store'

export const URL_BASE = '/altair'

const KNOWN_MODULES = [
  'live', 'scenario', 'rule', 'data', 'legality',
  'system', 'regression', 'dev', 'help', 'release',
] as const

export function pathToModule(pathname: string): ActiveModule {
  const rest = pathname.slice(URL_BASE.length).replace(/^\//, '').replace(/\/$/, '')
  if (!rest) return 'dashboard'
  const scenarioMatch = rest.match(/^scenario\/(\d+)$/)
  if (scenarioMatch) return `scenario-gantt:${scenarioMatch[1]}`
  if ((KNOWN_MODULES as readonly string[]).includes(rest)) return rest as ActiveModule
  return 'dashboard'
}

export function moduleToPath(module: ActiveModule): string {
  if (module === 'dashboard') return `${URL_BASE}/`
  if (module.startsWith('scenario-gantt:')) {
    return `${URL_BASE}/scenario/${module.slice('scenario-gantt:'.length)}`
  }
  return `${URL_BASE}/${module}`
}

export function useUrlSync(): void {
  const setModule = useShellStore((s) => s.setModule)
  const activeModule = useShellStore((s) => s.activeModule)
  const skipFirst = useRef(false)

  useEffect(() => {
    const urlModule = pathToModule(window.location.pathname)
    if (urlModule !== useShellStore.getState().activeModule) {
      setModule(urlModule)
    }
    const handler = () => setModule(pathToModule(window.location.pathname))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [setModule])

  useEffect(() => {
    if (!skipFirst.current) {
      skipFirst.current = true
      return
    }
    const path = moduleToPath(activeModule)
    if (window.location.pathname !== path) {
      history.pushState(null, '', path)
    }
  }, [activeModule])
}
```

- [ ] **Step 4: Mount useUrlSync in AppShell**

In `gantt/src/components/shell/app-shell.tsx`, add the import and mount the hook.

Add to the imports at the top:
```typescript
import { useUrlSync } from '@/hooks/use-url-sync'
```

Inside the `AppShell` component (before the return), add one line alongside the other `useEffect`/hook calls:
```typescript
export const AppShell = () => {
  const topNavVisible         = useShellStore((s) => s.topNavVisible)
  const loadShell             = useShellStore((s) => s.loadFromStorage)
  const loadColumns           = useColumnStore((s) => s.loadFromStorage)
  const loadFilters           = useFilterStore((s) => s.loadFromStorage)
  const fetchAssignmentGroups = useAssignmentStore((s) => s.fetchGroups)

  useUrlSync()   // ← add this line

  useEffect(() => {
    loadShell()
    // ...
  }, [...])
  // ... rest unchanged
```

- [ ] **Step 5: Change the Vite base path**

In `gantt/vite.config.ts`, change:
```typescript
  base: "/fpqe/gantt/",
```
to:
```typescript
  base: "/altair/",
```

- [ ] **Step 6: Update the auth setup path**

In `e2e/tests/gantt/auth.setup.ts`, change line 36:
```typescript
  await page.goto('/fpqe/portal/')
```
to:
```typescript
  await page.goto('/altair/')
```

- [ ] **Step 7: Update the Playwright config webServer URL and comments**

In `e2e/config/playwright.config.ts`:

Change the `GANTT_BASE_URL` comment on line 12:
```typescript
 * GANTT_BASE_URL      — Gantt frontend origin (default http://localhost:5173; app at /fpqe/gantt/)
```
to:
```typescript
 * GANTT_BASE_URL      — Gantt frontend origin (default http://localhost:5173; app at /altair/)
```

Change the webServer `url` check (around line 141):
```typescript
      url: `${env.ganttBase}/fpqe/gantt/`,
```
to:
```typescript
      url: `${env.ganttBase}/altair/`,
```

- [ ] **Step 8: Run the UI standard check**

```bash
cd /path/to/repo
npm run check:ui
```

Expected: 0 hard violations. (This change touches no CSS.)

- [ ] **Step 9: Re-run the unit tests to confirm they still pass**

```bash
cd /path/to/repo/gantt
npx vitest run src/hooks/__tests__/url-sync.test.ts
```

Expected: PASS — 24 tests pass.

- [ ] **Step 10: Run the E2E tests to confirm they now pass**

```bash
npx playwright test e2e/tests/gantt/url-routing.spec.ts e2e/tests/gantt/altair-branding.spec.ts --config e2e/config/playwright.config.ts --reporter=list
```

Expected: PASS — all 7 tests (2 branding + 5 routing) pass.

> **Note:** If running against a production nginx deploy, add `try_files $uri /altair/index.html;` to the nginx location block for `/altair/` — this is needed for direct URL navigation (e.g. `/altair/data`) to serve `index.html` rather than 404. The Vite dev server handles this automatically.

- [ ] **Step 11: Bump FRONTEND_VERSION**

In `gantt/src/version.ts`, change:
```typescript
export const FRONTEND_VERSION = 275
```
to:
```typescript
export const FRONTEND_VERSION = 276
```

- [ ] **Step 12: Commit**

```bash
git add \
  gantt/src/hooks/use-url-sync.ts \
  gantt/src/components/shell/app-shell.tsx \
  gantt/vite.config.ts \
  e2e/tests/gantt/auth.setup.ts \
  e2e/config/playwright.config.ts \
  e2e/tests/gantt/url-routing.spec.ts \
  gantt/src/version.ts
git commit -m "feat(gantt): URL routing — /altair/ base + tab URL sync"
```
