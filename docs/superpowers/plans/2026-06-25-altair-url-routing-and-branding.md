# ROIs Altair URL Routing and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the Gantt frontend under `/altair/`, synchronize top-level shell tabs with browser URLs, support direct scenario URLs such as `/altair/scenario/577`, and rename visible Gantt branding to ROIs Altair.

**Architecture:** Keep the existing Zustand shell store and keep-alive tab rendering. Add a focused URL mapping/sync hook that bridges `window.location.pathname` and `useShellStore.activeModule` via the browser History API. Update Vite base/config and UI branding without changing backend API proxy prefixes.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, Vitest, Playwright.

## Global Constraints

- Gantt frontend base path is `/altair/`.
- Landing page `/altair/` opens Dashboard.
- Live tab maps to `/altair/live`.
- Scenario list maps to `/altair/scenario`.
- Scenario Gantt ID maps to `/altair/scenario/:id`, for example `/altair/scenario/577`.
- Visible product branding changes from `ROIs Crew` to `ROIs Altair`.
- Existing backend proxy paths `/fpqe/live`, `/fpqe/rule`, and `/fpqe/ai` stay unchanged.
- Do not support `/altair/sceanrio`; the canonical route is `/altair/scenario`.
- Do not add a router dependency.
- Do not rename repository directories or packages.

---

## File Structure

- Create `gantt/src/hooks/use-url-sync.ts`
  - Owns URL constants, pure path/module mapping helpers, and the React hook that syncs shell state with `window.history`.
- Create `gantt/src/hooks/__tests__/use-url-sync.test.ts`
  - Unit tests for pure mapping helpers and hook behavior.
- Modify `gantt/src/components/shell/app-shell.tsx`
  - Mount `useUrlSync()` once in the shell.
- Modify `gantt/vite.config.ts`
  - Change frontend base and trailing slash redirect to `/altair/`.
  - Keep existing `/fpqe/*` API proxy paths.
- Modify `gantt/index.html`
  - Browser title becomes `ROIs Altair`.
- Modify `gantt/src/components/auth/login-page.tsx`
  - Login branding copy becomes Altair.
- Modify `e2e/config/playwright.config.ts`
  - Gantt webServer readiness URL becomes `/altair/`.
- Modify `e2e/tests/gantt/auth.setup.ts`
  - Auth setup navigates to `/altair/` before sessionStorage injection.
- Create `e2e/tests/gantt/altair-url-routing.spec.ts`
  - Covers direct paths, click-to-path, scenario direct URL, back/forward, and title.

---

### Task 1: URL Mapping Utilities

**Files:**
- Create: `gantt/src/hooks/use-url-sync.ts`
- Create: `gantt/src/hooks/__tests__/use-url-sync.test.ts`

**Interfaces:**
- Produces: `URL_BASE: '/altair'`
- Produces: `pathToModule(pathname: string): ActiveModule`
- Produces: `moduleToPath(module: ActiveModule): string`
- Produces: `useUrlSync(): void` as an initial no-op hook that will be completed in Task 2

- [ ] **Step 1: Write the failing mapping tests**

Create `gantt/src/hooks/__tests__/use-url-sync.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { moduleToPath, pathToModule, URL_BASE } from '@/hooks/use-url-sync'

describe('URL sync mapping', () => {
  it('uses /altair as the URL base', () => {
    expect(URL_BASE).toBe('/altair')
  })

  it.each([
    ['/altair/', 'dashboard'],
    ['/altair', 'dashboard'],
    ['/altair/live', 'live'],
    ['/altair/scenario', 'scenario'],
    ['/altair/scenario/577', 'scenario-gantt:577'],
    ['/altair/data', 'data'],
    ['/altair/legality', 'legality'],
    ['/altair/system', 'system'],
    ['/altair/regression', 'regression'],
    ['/altair/pbs', 'pbs'],
    ['/altair/dev', 'dev'],
    ['/altair/help', 'help'],
    ['/altair/release', 'release'],
  ])('maps %s to %s', (pathname, module) => {
    expect(pathToModule(pathname)).toBe(module)
  })

  it.each([
    ['/altair/scenario/notanumber'],
    ['/altair/scenario/0'],
    ['/altair/scenario/-1'],
    ['/altair/unknown'],
    ['/fpqe/gantt/'],
    ['/'],
  ])('falls back to dashboard for %s', (pathname) => {
    expect(pathToModule(pathname)).toBe('dashboard')
  })

  it.each([
    ['dashboard', '/altair/'],
    ['live', '/altair/live'],
    ['scenario', '/altair/scenario'],
    ['scenario-gantt:577', '/altair/scenario/577'],
    ['data', '/altair/data'],
    ['legality', '/altair/legality'],
    ['system', '/altair/system'],
    ['regression', '/altair/regression'],
    ['pbs', '/altair/pbs'],
    ['dev', '/altair/dev'],
    ['help', '/altair/help'],
    ['release', '/altair/release'],
  ])('maps module %s to %s', (module, pathname) => {
    expect(moduleToPath(module)).toBe(pathname)
  })

  it.each([
    ['scenario-gantt:notanumber'],
    ['scenario-gantt:0'],
    ['unknown-module'],
  ])('falls back to dashboard path for invalid module %s', (module) => {
    expect(moduleToPath(module)).toBe('/altair/')
  })
})
```

- [ ] **Step 2: Run the mapping tests and verify they fail**

Run:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
```

Expected: FAIL because `@/hooks/use-url-sync` does not exist.

- [ ] **Step 3: Add the mapping implementation**

Create `gantt/src/hooks/use-url-sync.ts`:

```typescript
import { useEffect } from 'react'
import type { ActiveModule, KnownModule } from '@/stores/shell-store'

export const URL_BASE = '/altair' as const

const STATIC_PATH_TO_MODULE: Record<string, KnownModule> = {
  live: 'live',
  scenario: 'scenario',
  data: 'data',
  legality: 'legality',
  system: 'system',
  regression: 'regression',
  pbs: 'pbs',
  dev: 'dev',
  help: 'help',
  release: 'release',
}

const STATIC_MODULE_TO_PATH: Partial<Record<KnownModule, string>> = {
  dashboard: `${URL_BASE}/`,
  live: `${URL_BASE}/live`,
  scenario: `${URL_BASE}/scenario`,
  data: `${URL_BASE}/data`,
  legality: `${URL_BASE}/legality`,
  system: `${URL_BASE}/system`,
  regression: `${URL_BASE}/regression`,
  pbs: `${URL_BASE}/pbs`,
  dev: `${URL_BASE}/dev`,
  help: `${URL_BASE}/help`,
  release: `${URL_BASE}/release`,
}

const positiveInteger = (value: string): boolean => /^[1-9]\d*$/.test(value)

export const pathToModule = (pathname: string): ActiveModule => {
  if (pathname !== URL_BASE && !pathname.startsWith(`${URL_BASE}/`)) {
    return 'dashboard'
  }

  const suffix = pathname.slice(URL_BASE.length).replace(/^\/+|\/+$/g, '')
  if (!suffix) return 'dashboard'

  const parts = suffix.split('/')
  if (parts[0] === 'scenario' && parts.length === 2 && positiveInteger(parts[1])) {
    return `scenario-gantt:${parts[1]}`
  }

  if (parts.length === 1 && parts[0] in STATIC_PATH_TO_MODULE) {
    return STATIC_PATH_TO_MODULE[parts[0]]
  }

  return 'dashboard'
}

export const moduleToPath = (module: ActiveModule): string => {
  if (module.startsWith('scenario-gantt:')) {
    const id = module.slice('scenario-gantt:'.length)
    return positiveInteger(id) ? `${URL_BASE}/scenario/${id}` : `${URL_BASE}/`
  }

  return STATIC_MODULE_TO_PATH[module as KnownModule] ?? `${URL_BASE}/`
}

export const useUrlSync = (): void => {
  useEffect(() => undefined, [])
}
```

- [ ] **Step 4: Run the mapping tests and verify they pass**

Run:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
```

Expected: PASS for all mapping tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add gantt/src/hooks/use-url-sync.ts gantt/src/hooks/__tests__/use-url-sync.test.ts
git commit -m "feat(gantt): add Altair URL mapping helpers"
```

---

### Task 2: Shell URL Synchronization

**Files:**
- Modify: `gantt/src/hooks/use-url-sync.ts`
- Modify: `gantt/src/hooks/__tests__/use-url-sync.test.ts`
- Modify: `gantt/src/components/shell/app-shell.tsx`

**Interfaces:**
- Consumes: `pathToModule(pathname: string): ActiveModule`
- Consumes: `moduleToPath(module: ActiveModule): string`
- Produces: `useUrlSync(): void`, which applies URL-derived modules on mount/popstate and pushes paths on `activeModule` changes.

- [ ] **Step 1: Add failing hook behavior tests**

Append to `gantt/src/hooks/__tests__/use-url-sync.test.ts`:

```typescript
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach } from 'vitest'
import { useUrlSync } from '@/hooks/use-url-sync'
import { useShellStore } from '@/stores/shell-store'

const renderHook = (): { unmount: () => void } => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)

  const Probe = () => {
    useUrlSync()
    return null
  }

  act(() => {
    root.render(React.createElement(Probe))
  })

  return {
    unmount: () => {
      act(() => root.unmount())
      el.remove()
    },
  }
}

describe('useUrlSync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useShellStore.setState({
      activeModule: 'dashboard',
      openTabs: ['dashboard'],
      scenarioTabLabels: {},
      scenarioTabTypes: {},
      sidebarStatesByModule: {},
      sidebarState: 'expanded',
      sidebarUserOverride: false,
    })
    window.history.replaceState(null, '', '/altair/')
  })

  it('applies the URL module on mount and opens the tab', () => {
    window.history.replaceState(null, '', '/altair/scenario/577')

    const { unmount } = renderHook()

    expect(useShellStore.getState().activeModule).toBe('scenario-gantt:577')
    expect(useShellStore.getState().openTabs).toContain('scenario-gantt:577')
    unmount()
  })

  it('pushes a new path when activeModule changes', () => {
    const { unmount } = renderHook()

    act(() => {
      useShellStore.getState().setModule('live')
    })

    expect(window.location.pathname).toBe('/altair/live')
    unmount()
  })

  it('responds to browser popstate', () => {
    const { unmount } = renderHook()
    window.history.pushState(null, '', '/altair/data')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(useShellStore.getState().activeModule).toBe('data')
    unmount()
  })
})
```

- [ ] **Step 2: Run the hook tests and verify they fail**

Run:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
```

Expected: FAIL because `useUrlSync()` is still a no-op.

- [ ] **Step 3: Implement the hook**

Replace the `useUrlSync` function in `gantt/src/hooks/use-url-sync.ts` with:

```typescript
import { useEffect, useRef } from 'react'
import { useShellStore } from '@/stores/shell-store'
```

The file should keep the existing type import:

```typescript
import type { ActiveModule, KnownModule } from '@/stores/shell-store'
```

Then use this hook body:

```typescript
export const useUrlSync = (): void => {
  const activeModule = useShellStore((s) => s.activeModule)
  const setModule = useShellStore((s) => s.setModule)
  const applyingUrlRef = useRef(false)

  useEffect(() => {
    const applyCurrentPath = (): void => {
      const nextModule = pathToModule(window.location.pathname)
      applyingUrlRef.current = true
      setModule(nextModule)
      window.setTimeout(() => {
        applyingUrlRef.current = false
      }, 0)
    }

    applyCurrentPath()
    window.addEventListener('popstate', applyCurrentPath)
    return () => window.removeEventListener('popstate', applyCurrentPath)
  }, [setModule])

  useEffect(() => {
    if (applyingUrlRef.current) return
    const nextPath = moduleToPath(activeModule)
    if (window.location.pathname === nextPath) return
    window.history.pushState(null, '', nextPath)
  }, [activeModule])
}
```

The complete import block should be:

```typescript
import { useEffect, useRef } from 'react'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveModule, KnownModule } from '@/stores/shell-store'
```

- [ ] **Step 4: Mount the hook in AppShell**

Modify `gantt/src/components/shell/app-shell.tsx` imports:

```typescript
import { useUrlSync } from '@/hooks/use-url-sync'
```

Inside `AppShell`, after the existing shell/load hooks are declared, add:

```typescript
  useUrlSync()
```

Keep the existing `useEffect` that calls `loadShell()`, `loadColumns()`, `loadFilters()`, and `fetchAssignmentGroups()`.

- [ ] **Step 5: Run hook tests and shell typecheck**

Run:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
cd gantt && npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits with 0 errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add gantt/src/hooks/use-url-sync.ts gantt/src/hooks/__tests__/use-url-sync.test.ts gantt/src/components/shell/app-shell.tsx
git commit -m "feat(gantt): sync Altair URLs with shell tabs"
```

---

### Task 3: Vite Base Path, Branding, and E2E Coverage

**Files:**
- Modify: `gantt/vite.config.ts`
- Modify: `gantt/index.html`
- Modify: `gantt/src/components/auth/login-page.tsx`
- Modify: `e2e/config/playwright.config.ts`
- Modify: `e2e/tests/gantt/auth.setup.ts`
- Create: `e2e/tests/gantt/altair-url-routing.spec.ts`

**Interfaces:**
- Consumes: `/altair/` Vite base from `gantt/vite.config.ts`
- Consumes: `useUrlSync()` mounted in `AppShell`
- Produces: user-visible Altair branding and browser-level route regression coverage.

- [ ] **Step 1: Add the failing E2E spec**

Create `e2e/tests/gantt/altair-url-routing.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'

test.describe('Altair URL routing and branding', () => {
  test('Altair-7001 — /altair/ loads dashboard with Altair title', async ({ page }) => {
    await page.goto('/altair/')
    await expect(page).toHaveTitle('ROIs Altair')
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/altair\/$/)
  })

  test('Altair-7002 — clicking Live and Scenario updates the URL', async ({ page }) => {
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()
    await expect(page).toHaveURL(/\/altair\/live$/)

    await page.getByTestId('module-nav-scenario').click()
    await expect(page).toHaveURL(/\/altair\/scenario$/)
  })

  test('Altair-7003 — direct scenario URL opens the scenario Gantt tab', async ({ page }) => {
    await page.route('**/api/scenario/577/gantt-data', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { message: 'Scenario 577 fixture intentionally absent' } }),
    }))
    await page.route('**/api/scenario/577/lock-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { locked: false, owner: null, expiresAt: null } }),
    }))
    await page.route('**/api/scenario/577/legality', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { status: 'DONE', violations: [] } }),
    }))

    await page.goto('/altair/scenario/577')
    await expect(page).toHaveURL(/\/altair\/scenario\/577$/)
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 15_000 })
  })

  test('Altair-7004 — browser back restores the prior module URL', async ({ page }) => {
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()
    await expect(page).toHaveURL(/\/altair\/live$/)
    await page.getByTestId('module-nav-scenario').click()
    await expect(page).toHaveURL(/\/altair\/scenario$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/altair\/live$/)
  })
})
```

- [ ] **Step 2: Run the new E2E spec and verify it fails**

Run:

```bash
npx playwright test e2e/tests/gantt/altair-url-routing.spec.ts --config e2e/config/playwright.config.ts --project=gantt --reporter=list
```

Expected: FAIL because the app still serves under `/fpqe/gantt/` and the title is still `ROIs Crew`.

- [ ] **Step 3: Update Vite base and redirect**

Modify `gantt/vite.config.ts`:

```typescript
  const redirect = (req: { url?: string }, res: { writeHead(s: number, h: Record<string, string>): void; end(): void }, next: () => void) => {
    if (req.url === '/altair') { res.writeHead(301, { Location: '/altair/' }); res.end(); return; }
    next();
  };
```

Change:

```typescript
  base: "/fpqe/gantt/",
```

to:

```typescript
  base: "/altair/",
```

Do not change these proxy keys:

```typescript
      "/fpqe/live": {
      "/fpqe/rule": {
      "/fpqe/ai": {
```

- [ ] **Step 4: Update browser and login branding**

Modify `gantt/index.html`:

```html
    <title>ROIs Altair</title>
```

Modify `gantt/src/components/auth/login-page.tsx`:

```tsx
          Altair
```

in the wordmark label that currently renders `Crew Scheduling System`.

Modify the footer text:

```tsx
        © 2026 ROIS · Altair
```

Do not change the `ROIS.` wordmark or `Intelligent Crew Resource Optimization` tagline.

- [ ] **Step 5: Update Playwright Gantt base assumptions**

Modify the comment in `e2e/config/playwright.config.ts`:

```typescript
 * GANTT_BASE_URL      — Gantt frontend origin (default http://localhost:5173; app at /altair/)
```

Modify the Gantt webServer URL in `e2e/config/playwright.config.ts`:

```typescript
      url: `${env.ganttBase}/altair/`,
```

Modify `e2e/tests/gantt/auth.setup.ts`:

```typescript
  await page.goto('/altair/')
```

- [ ] **Step 6: Run targeted verification**

Run:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
cd gantt && npx tsc --noEmit
npx playwright test e2e/tests/gantt/altair-url-routing.spec.ts --config e2e/config/playwright.config.ts --project=gantt --reporter=list
```

Expected:

- Vitest mapping/hook tests PASS.
- TypeScript exits with 0 errors.
- Playwright `altair-url-routing.spec.ts` PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add gantt/vite.config.ts gantt/index.html gantt/src/components/auth/login-page.tsx e2e/config/playwright.config.ts e2e/tests/gantt/auth.setup.ts e2e/tests/gantt/altair-url-routing.spec.ts
git commit -m "feat(gantt): serve Altair routes and update branding"
```

---

## Final Verification

- [ ] Run all targeted checks:

```bash
cd gantt && npm test -- src/hooks/__tests__/use-url-sync.test.ts
cd gantt && npx tsc --noEmit
npx playwright test e2e/tests/gantt/altair-url-routing.spec.ts --config e2e/config/playwright.config.ts --project=gantt --reporter=list
```

- [ ] Inspect `git status --short` and confirm only intentional files remain changed.
- [ ] Report exact pass/fail results and any environment blockers.
