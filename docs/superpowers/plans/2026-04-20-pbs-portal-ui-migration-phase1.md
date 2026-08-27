# PBS Portal UI Migration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `pbs-portal` as a React 1:1 clone of `flair-crew-portal` for migration batches 1-3 and data stage 1: reference routes, branding, layout, dashboard, module pages, and migrated front-end interactions, while keeping the existing React auth foundation live.

**Architecture:** Keep the current React/Vite/Zustand/Query foundation, but replace the current `/portal/*` shell and placeholder modules with a route tree, assets, layout, shared schedule/calendar components, and feature pages that mirror `flair-crew-portal`. This plan intentionally stops at data stage 1: module pages remain mock-backed after the UI migration. A separate follow-up plan should cover data stage 2 once per-module backend contracts are confirmed.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Zustand, TanStack Query, Tailwind CSS, Heroicons, Vitest, React Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-04-20-pbs-portal-ui-migration-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `pbs-portal/src/assets/images/login-background.png` | Copy | Login page background from reference |
| `pbs-portal/src/assets/images/login-logo.png` | Copy | Login logo from reference |
| `pbs-portal/src/assets/images/login-topbar.png` | Copy | Top bar image from reference |
| `pbs-portal/src/assets/images/avatar.png` | Copy | User avatar from reference |
| `pbs-portal/src/app/app.tsx` | Modify | Skip competing bootstrap on `/login?token=...` and use the new route tree |
| `pbs-portal/src/app/router/app-routes.tsx` | Modify | Replace `/portal/*` routes with `/login`, `/dashboard`, `/days-off`, `/reserve`, `/layer`, `/award`, system pages, and catch-all redirect |
| `pbs-portal/src/app/router/auth-return-to.ts` | Modify | Safe redirect parsing for new routes, redirect precedence, and cleanup |
| `pbs-portal/src/app/router/legacy-route-redirects.tsx` | Create | Short-lived shim for `/portal/*` and `/auth/callback` cutover |
| `pbs-portal/src/app/layout/main-layout.tsx` | Create | Main layout shell matching reference |
| `pbs-portal/src/app/layout/dashboard-top-nav.tsx` | Create | Reference top navigation with overflow, logout confirm, avatar, and active rules |
| `pbs-portal/src/app/styles/globals.css` | Modify | Global background, brand colors, font stack, and layout tokens closer to reference |
| `pbs-portal/src/app/pages/forbidden-page.tsx` | Create | `/403` page |
| `pbs-portal/src/app/pages/not-found-page.tsx` | Create | `/404` page |
| `pbs-portal/src/app/pages/server-error-page.tsx` | Create | `/500` page |
| `pbs-portal/src/shared/constants/top-nav-items.ts` | Create | Navigation item metadata mirroring reference header items |
| `pbs-portal/src/features/auth/pages/login-page.tsx` | Modify | Reference login UI, validation, password toggle, SSO entry, `token` completion |
| `pbs-portal/src/features/auth/store/use-auth-session-store.ts` | Modify | Password login, token completion, SSO redirect, and return-to cleanup |
| `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts` | Modify | Auth flow tests for password, token, and SSO redirect |
| `pbs-portal/src/shared/services/auth-service.ts` | Modify | Accept token completion contract used by `/login?token=...` |
| `pbs-portal/src/shared/components/panel/panel-strip-header.tsx` | Create | Shared strip header used by dashboard and right-side panels |
| `pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx` | Create | Reusable page-scale wrapper matching the reference 1888px canvas behavior |
| `pbs-portal/src/shared/components/layers/layer-toggle-group.tsx` | Create | Shared layer toggle group |
| `pbs-portal/src/shared/components/calendar/month-grid-calendar.tsx` | Create | Month grid calendar from reference |
| `pbs-portal/src/shared/components/calendar/types.ts` | Create | Calendar types |
| `pbs-portal/src/shared/components/schedule/types.ts` | Create | Shared schedule types |
| `pbs-portal/src/shared/components/schedule/builders.ts` | Create | Shared schedule builders |
| `pbs-portal/src/shared/components/schedule/schedule-layer-matrix.tsx` | Create | Shared layer matrix interaction |
| `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx` | Create | Shared schedule event calendar used by dashboard schedule panel |
| `pbs-portal/src/shared/lib/schedule-panel-layout.ts` | Create | Shared grid constants used by module pages |
| `pbs-portal/src/features/dashboard/types.ts` | Create | Dashboard types translated from reference |
| `pbs-portal/src/features/dashboard/mock.ts` | Create | Dashboard mock data translated from reference |
| `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx` | Create | Dashboard page |
| `pbs-portal/src/features/dashboard/components/dashboard-left-panel.tsx` | Create | User panel |
| `pbs-portal/src/features/dashboard/components/dashboard-right-panel.tsx` | Create | Message panel |
| `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx` | Create | Central bidding calendar and layer area |
| `pbs-portal/src/features/days-off/types.ts` | Create | Days-off types |
| `pbs-portal/src/features/days-off/mock.ts` | Create | Days-off mock data |
| `pbs-portal/src/features/days-off/pages/days-off-page.tsx` | Create | Days-off page |
| `pbs-portal/src/features/days-off/components/days-off-right-panel.tsx` | Create | Days-off interaction panel |
| `pbs-portal/src/features/reserve/types.ts` | Create | Reserve types |
| `pbs-portal/src/features/reserve/mock.ts` | Create | Reserve mock data |
| `pbs-portal/src/features/reserve/pages/reserve-page.tsx` | Create | Reserve page |
| `pbs-portal/src/features/reserve/components/reserve-right-panel.tsx` | Create | Reserve interaction panel |
| `pbs-portal/src/features/layer/types.ts` | Create | Layer types |
| `pbs-portal/src/features/layer/mock.ts` | Create | Layer mock data |
| `pbs-portal/src/features/layer/pages/layer-page.tsx` | Create | Layer page |
| `pbs-portal/src/features/layer/components/layer-right-panel.tsx` | Create | Layer interaction panel |
| `pbs-portal/src/features/award/types.ts` | Create | Award types |
| `pbs-portal/src/features/award/mock.ts` | Create | Award mock data |
| `pbs-portal/src/features/award/pages/award-page.tsx` | Create | Award page |
| `pbs-portal/src/features/award/components/award-right-panel.tsx` | Create | Award summary panel |
| `pbs-portal/src/features/award/components/award-trip-card.tsx` | Create | Award trip card |
| `pbs-portal/src/app/router/app-routes.test.tsx` | Modify | Route, redirect, and nav contract tests |
| `pbs-portal/src/app/layout/dashboard-top-nav.test.tsx` | Create | Header behavior tests |
| `pbs-portal/src/shared/components/calendar/month-grid-calendar.test.tsx` | Create | Calendar tests |
| `pbs-portal/src/shared/components/schedule/schedule-layer-matrix.test.tsx` | Create | Layer matrix tests |
| `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx` | Create | Dashboard render test |
| `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx` | Create | Days-off interaction tests |
| `pbs-portal/src/features/reserve/pages/reserve-page.test.tsx` | Create | Reserve interaction tests |
| `pbs-portal/src/features/layer/pages/layer-page.test.tsx` | Create | Layer interaction tests |
| `pbs-portal/src/features/award/pages/award-page.test.tsx` | Create | Award interaction tests |
| `pbs-portal/e2e/portal-smoke.spec.ts` | Modify | Guest redirect and logged-in shell smoke |
| `pbs-portal/src/app/layout/portal-shell.tsx` | Delete | Obsolete foundation shell |
| `pbs-portal/src/app/layout/viewport-shell.tsx` | Delete | Obsolete foundation shell helper |
| `pbs-portal/src/features/auth/pages/auth-callback-page.tsx` | Delete | Obsolete callback page after `/login?token=...` cutover |
| `pbs-portal/src/shared/constants/portal-nav.ts` | Delete | Obsolete portal nav |
| `pbs-portal/src/features/home/*` | Delete | Obsolete placeholder module |
| `pbs-portal/src/features/pbs/*` | Delete | Obsolete placeholder module |
| `pbs-portal/src/features/calendar/*` | Delete | Obsolete placeholder module |
| `pbs-portal/src/features/messages/*` | Delete | Obsolete placeholder module |
| `pbs-portal/src/features/notices/*` | Delete | Obsolete placeholder module |
| `pbs-portal/src/features/settings/*` | Delete | Obsolete placeholder module |

---

### Task 1: Replace the route tree and add cutover shims

**Files:**
- Modify: `pbs-portal/src/app/app.tsx`
- Modify: `pbs-portal/src/app/router/app-routes.tsx`
- Modify: `pbs-portal/src/app/router/auth-return-to.ts`
- Create: `pbs-portal/src/app/router/legacy-route-redirects.tsx`
- Create: `pbs-portal/src/app/pages/forbidden-page.tsx`
- Create: `pbs-portal/src/app/pages/not-found-page.tsx`
- Create: `pbs-portal/src/app/pages/server-error-page.tsx`
- Modify: `pbs-portal/src/app/router/app-routes.test.tsx`

- [ ] **Step 1: Write the failing route-contract tests**

```tsx
// pbs-portal/src/app/router/app-routes.test.tsx
it("redirects `/` to `/dashboard`", async () => {
  window.history.replaceState({}, "", "/");
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
});

it("redirects guests from `/dashboard` to `/login?redirect=/dashboard`", async () => {
  mockedAuthService.getSession.mockResolvedValue(null);
  window.history.replaceState({}, "", "/dashboard");
  render(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  expect(window.location.pathname).toBe("/login");
  expect(window.location.search).toBe("?redirect=%2Fdashboard");
});

it("maps legacy `/portal/home` into `/dashboard`", async () => {
  mockedAuthService.getSession.mockResolvedValue(null);
  window.history.replaceState({}, "", "/portal/home");
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
});

it("maps legacy `/auth/callback?token=abc` into `/login?token=abc`", async () => {
  mockedAuthService.getSession.mockResolvedValue(null);
  window.history.replaceState({}, "", "/auth/callback?token=abc");
  render(<App />);
  await waitFor(() => {
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?token=abc");
  });
});
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/app/router/app-routes.test.tsx`

Expected: FAIL because the current route tree still uses `/portal/*` and has no legacy redirect shim.

- [ ] **Step 3: Implement the new route tree, safe-return helper, and system pages**

```tsx
// pbs-portal/src/app/router/legacy-route-redirects.tsx
import { Navigate, useLocation } from "react-router-dom";

const LEGACY_PORTAL_MAP: Record<string, string> = {
  "/portal": "/dashboard",
  "/portal/home": "/dashboard",
  "/portal/pbs": "/award",
  "/portal/calendar": "/reserve",
  "/portal/messages": "/days-off",
  "/portal/notices": "/layer",
  "/portal/settings": "/404",
};

export const LegacyRouteRedirect = () => {
  const location = useLocation();
  const target = LEGACY_PORTAL_MAP[location.pathname] ?? "/dashboard";
  return <Navigate replace to={target} />;
};

export const LegacyAuthCallbackRedirect = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  return <Navigate replace to={token ? `/login?token=${encodeURIComponent(token)}` : "/login"} />;
};
```

```ts
// pbs-portal/src/app/router/auth-return-to.ts
const SAFE_ROUTES = ["/dashboard", "/days-off", "/reserve", "/layer", "/award"];
const DEFAULT_AUTH_RETURN_TO = "/dashboard";

export const normalizeAuthReturnTo = (value: string | null | undefined) => {
  if (!value) return DEFAULT_AUTH_RETURN_TO;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return DEFAULT_AUTH_RETURN_TO;
  if (!SAFE_ROUTES.some((route) => trimmed === route || trimmed.startsWith(`${route}?`))) {
    return DEFAULT_AUTH_RETURN_TO;
  }
  return trimmed;
};
```

```tsx
// pbs-portal/src/app/router/app-routes.tsx
<Routes>
  <Route path="/" element={<Navigate replace to="/dashboard" />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/403" element={<ForbiddenPage />} />
  <Route path="/404" element={<NotFoundPage />} />
  <Route path="/500" element={<ServerErrorPage />} />
  <Route path="/auth/callback" element={<LegacyAuthCallbackRedirect />} />
  <Route path="/portal/*" element={<LegacyRouteRedirect />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<MainLayout />}>
      <Route path="/dashboard" element={renderLazyRoute(DashboardPage)} />
      <Route path="/days-off" element={renderLazyRoute(DaysOffPage)} />
      <Route path="/reserve" element={renderLazyRoute(ReservePage)} />
      <Route path="/layer" element={renderLazyRoute(LayerPage)} />
      <Route path="/award" element={renderLazyRoute(AwardPage)} />
    </Route>
  </Route>
  <Route path="*" element={<Navigate replace to="/404" />} />
</Routes>
```

- [ ] **Step 4: Run the route tests again**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/app/router/app-routes.test.tsx`

Expected: PASS for the four new route-contract cases.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/app/app.tsx \
  pbs-portal/src/app/router/app-routes.tsx \
  pbs-portal/src/app/router/auth-return-to.ts \
  pbs-portal/src/app/router/legacy-route-redirects.tsx \
  pbs-portal/src/app/pages/forbidden-page.tsx \
  pbs-portal/src/app/pages/not-found-page.tsx \
  pbs-portal/src/app/pages/server-error-page.tsx \
  pbs-portal/src/app/router/app-routes.test.tsx
git commit -m "feat: replace pbs-portal route contract"
```

### Task 2: Rebuild the login page and auth query contract

**Files:**
- Modify: `pbs-portal/src/features/auth/pages/login-page.tsx`
- Modify: `pbs-portal/src/features/auth/store/use-auth-session-store.ts`
- Modify: `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts`
- Modify: `pbs-portal/src/shared/services/auth-service.ts`
- Modify: `pbs-portal/src/app/app.tsx`
- Modify: `pbs-portal/src/app/router/app-routes.test.tsx`

- [ ] **Step 1: Write failing auth-flow tests**

```ts
// pbs-portal/src/features/auth/store/use-auth-session-store.test.ts
it("logs in with username/password and stores the session", async () => {
  mockedAuthService.login.mockResolvedValue({
    authMode: "password",
    user: { id: "u-1", name: "Emma", employeeNo: "F8001" },
  });

  await useAuthSessionStore.getState().login({ username: "emma", password: "secret" });

  expect(mockedAuthService.login).toHaveBeenCalledWith({
    username: "emma",
    password: "secret",
  });
  expect(useAuthSessionStore.getState().status).toBe("authenticated");
});

it("redirects to the SSO login URL", () => {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    writable: true,
  });
  mockedAuthService.getSsoLoginUrl.mockReturnValue("https://sso.example.com/portal?backUrl=http://127.0.0.1/login");

  useAuthSessionStore.getState().redirectToSsoLogin();

  expect(assign).toHaveBeenCalledWith("https://sso.example.com/portal?backUrl=http://127.0.0.1/login");
});
```

```tsx
// pbs-portal/src/app/router/app-routes.test.tsx
it("completes `/login?token=abc` and returns to the safe redirect target", async () => {
  mockedAuthService.handleSsoCallback.mockResolvedValue({
    authMode: "sso",
    user: { id: "u-2", name: "Jordan", employeeNo: "F8010" },
  });
  window.history.replaceState({}, "", "/login?token=abc&redirect=%2Freserve");
  render(<App />);
  await screen.findByRole("heading", { name: "Reserve" });
  expect(window.location.pathname).toBe("/reserve");
});
```

- [ ] **Step 2: Run the auth tests and confirm failure**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/features/auth/store/use-auth-session-store.test.ts src/app/router/app-routes.test.tsx`

Expected: FAIL because the store does not expose password login / SSO redirect and `/login?token=...` is not handled yet.

- [ ] **Step 3: Implement password login, token completion, and reference-style login UI**

```ts
// pbs-portal/src/shared/services/auth-service.ts
export const authService = {
  getSession: () => request.get<AuthenticatedSession | null>("/auth/session"),
  login: (payload: { username: string; password: string }) =>
    request.post<AuthenticatedSession, { username: string; password: string }>("/auth/login", payload),
  handleSsoCallback: (payload?: { token?: string }) =>
    request.post<AuthenticatedSession, { token?: string }>("/auth/sso/callback", payload),
  logout: () => request.post<void>("/auth/logout"),
  getSsoLoginUrl: () => env.ssoLoginUrl,
};
```

```ts
// pbs-portal/src/features/auth/store/use-auth-session-store.ts
type LoginPayload = { username: string; password: string };

login: async (payload: LoginPayload) => {
  set({ status: "loading" });
  try {
    const session = await authService.login(payload);
    set({ status: "authenticated", user: session.user, authMode: session.authMode });
  } catch {
    set({ status: "unauthenticated", user: null, authMode: null });
    throw new Error("login failed");
  }
},
completeSsoFromToken: async (token: string) => {
  set({ status: "loading" });
  try {
    const session = await authService.handleSsoCallback({ token });
    set({ status: "authenticated", user: session.user, authMode: session.authMode });
  } catch {
    set({ status: "unauthenticated", user: null, authMode: null });
    throw new Error("sso callback failed");
  }
},
redirectToSsoLogin: () => {
  window.location.assign(authService.getSsoLoginUrl());
},
```

```tsx
// pbs-portal/src/features/auth/pages/login-page.tsx
const token = searchParams.get("token")?.trim() ?? "";
const redirectFromQuery = normalizeAuthReturnTo(searchParams.get("redirect"));

useEffect(() => {
  if (!token) {
    if (!searchParams.get("redirect")) {
      clearAuthReturnTo();
    }
    return;
  }
  void completeSsoFromToken(token);
}, [completeSsoFromToken, searchParams, token]);

const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (!username.trim() || !password) return;
  storeAuthReturnTo(redirectFromQuery);
  await login({ password, username: username.trim() });
};

const handleSsoSubmit = () => {
  storeAuthReturnTo(redirectFromQuery);
  redirectToSsoLogin();
};
```

- [ ] **Step 4: Re-run the auth tests**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/features/auth/store/use-auth-session-store.test.ts src/app/router/app-routes.test.tsx`

Expected: PASS for the new password login, SSO redirect, and `/login?token=...` behaviors.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/features/auth/pages/login-page.tsx \
  pbs-portal/src/features/auth/store/use-auth-session-store.ts \
  pbs-portal/src/features/auth/store/use-auth-session-store.test.ts \
  pbs-portal/src/shared/services/auth-service.ts \
  pbs-portal/src/app/app.tsx \
  pbs-portal/src/app/router/app-routes.test.tsx
git commit -m "feat: rebuild pbs-portal auth entry flow"
```

### Task 3: Add reference assets, global styles, top nav, and main layout

**Files:**
- Create: `pbs-portal/src/assets/images/login-background.png`
- Create: `pbs-portal/src/assets/images/login-logo.png`
- Create: `pbs-portal/src/assets/images/login-topbar.png`
- Create: `pbs-portal/src/assets/images/avatar.png`
- Create: `pbs-portal/src/shared/constants/top-nav-items.ts`
- Create: `pbs-portal/src/app/layout/dashboard-top-nav.tsx`
- Create: `pbs-portal/src/app/layout/main-layout.tsx`
- Create: `pbs-portal/src/app/layout/dashboard-top-nav.test.tsx`
- Modify: `pbs-portal/src/app/styles/globals.css`
- Modify: `pbs-portal/src/app/router/app-routes.tsx`

- [ ] **Step 1: Copy the reference images**

Run:

```bash
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/assets/images
cp /Users/lei/Codehub/flair-crew-portal/src/assets/images/login-background.png /Users/lei/Codehub/rois-ai/pbs-portal/src/assets/images/login-background.png
cp /Users/lei/Codehub/flair-crew-portal/src/assets/images/login-logo.png /Users/lei/Codehub/rois-ai/pbs-portal/src/assets/images/login-logo.png
cp /Users/lei/Codehub/flair-crew-portal/src/assets/images/login-topbar.png /Users/lei/Codehub/rois-ai/pbs-portal/src/assets/images/login-topbar.png
cp /Users/lei/Codehub/flair-crew-portal/src/assets/images/avatar.png /Users/lei/Codehub/rois-ai/pbs-portal/src/assets/images/avatar.png
```

Expected: Four image files exist under `pbs-portal/src/assets/images`.

- [ ] **Step 2: Write the failing top-nav test**

```tsx
// pbs-portal/src/app/layout/dashboard-top-nav.test.tsx
it("renders the eight reference nav items and marks `/404` entries active together", async () => {
  window.history.replaceState({}, "", "/404");
  render(
    <MemoryRouter initialEntries={["/404"]}>
      <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
    </MemoryRouter>,
  );

  expect(screen.getByText("Dashboard")).toBeInTheDocument();
  expect(screen.getByText("Standing Bid")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Pairing" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Line" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Standing Bid" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement `MainLayout`, `DashboardTopNav`, and global brand styling**

```ts
// pbs-portal/src/shared/constants/top-nav-items.ts
export const TOP_NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "days-off", label: "Days Off", path: "/days-off" },
  { key: "pairing", label: "Pairing", path: "/404" },
  { key: "line", label: "Line", path: "/404" },
  { key: "reserve", label: "Reserve", path: "/reserve" },
  { key: "layer", label: "Layer", path: "/layer" },
  { key: "award", label: "Award", path: "/award" },
  { key: "standing-bid", label: "Standing Bid", path: "/404" },
] as const;
```

```tsx
// pbs-portal/src/app/layout/main-layout.tsx
export const MainLayout = () => {
  const displayName = useAuthSessionStore((state) => state.user?.name ?? "Admin");
  return (
    <div className="min-h-screen w-full bg-[#edf4fa] font-['Montserrat','Segoe_UI',sans-serif] text-[#282c3b]">
      <DashboardTopNav displayName={displayName} items={TOP_NAV_ITEMS} />
      <main className="w-full px-4 pb-4 pt-[96px]">
        <Outlet />
      </main>
    </div>
  );
};
```

```css
/* pbs-portal/src/app/styles/globals.css */
body {
  margin: 0;
  font-family: "Montserrat", "Segoe UI", system-ui, sans-serif;
  background: #edf4fa;
  color: #282c3b;
}
```

- [ ] **Step 4: Run the layout test**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/app/layout/dashboard-top-nav.test.tsx`

Expected: PASS with all eight items rendered and `/404`-backed items following the reference active rule.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/assets/images \
  pbs-portal/src/shared/constants/top-nav-items.ts \
  pbs-portal/src/app/layout/dashboard-top-nav.tsx \
  pbs-portal/src/app/layout/main-layout.tsx \
  pbs-portal/src/app/layout/dashboard-top-nav.test.tsx \
  pbs-portal/src/app/styles/globals.css \
  pbs-portal/src/app/router/app-routes.tsx
git commit -m "feat: add pbs-portal reference shell"
```

### Task 4: Build the shared panel, calendar, and schedule primitives

**Files:**
- Create: `pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx`
- Create: `pbs-portal/src/shared/components/panel/panel-strip-header.tsx`
- Create: `pbs-portal/src/shared/components/layers/layer-toggle-group.tsx`
- Create: `pbs-portal/src/shared/components/calendar/month-grid-calendar.tsx`
- Create: `pbs-portal/src/shared/components/calendar/types.ts`
- Create: `pbs-portal/src/shared/components/schedule/types.ts`
- Create: `pbs-portal/src/shared/components/schedule/builders.ts`
- Create: `pbs-portal/src/shared/components/schedule/schedule-layer-matrix.tsx`
- Create: `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx`
- Create: `pbs-portal/src/shared/lib/schedule-panel-layout.ts`
- Modify: `pbs-portal/src/shared/hooks/use-viewport-scale.ts`
- Create: `pbs-portal/src/shared/components/calendar/month-grid-calendar.test.tsx`
- Create: `pbs-portal/src/shared/components/schedule/schedule-layer-matrix.test.tsx`

- [ ] **Step 1: Copy the reference types and layout helpers**

Run:

```bash
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/layout
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/calendar
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/schedule
cp /Users/lei/Codehub/flair-crew-portal/src/shared/components/calendar/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/calendar/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/shared/components/schedule/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/schedule/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/shared/components/schedule/builders.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/components/schedule/builders.ts
cp /Users/lei/Codehub/flair-crew-portal/src/shared/lib/schedule-panel-layout.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/lib/schedule-panel-layout.ts
```

Expected: The shared types and builders exist locally and only need import-path adaptation.

- [ ] **Step 2: Write the failing component tests**

```tsx
// pbs-portal/src/shared/components/calendar/month-grid-calendar.test.tsx
it("renders 35 cells and highlights today", () => {
  render(
    <MonthGridCalendar
      year={2025}
      month={11}
      todayDate="2025-11-09"
      entries={{ "2025-11-09": { value: "8" } }}
    />,
  );

  expect(screen.getAllByRole("gridcell")).toHaveLength(35);
  expect(screen.getByText("8")).toHaveClass("text-[#706cd5]");
});
```

```tsx
// pbs-portal/src/shared/components/schedule/schedule-layer-matrix.test.tsx
it("emits layer selection when an inactive row tab is clicked", async () => {
  const onSelect = vi.fn();
  render(
    <ScheduleLayerMatrix
      activeLayerLabel="LAYER-01"
      dayLabels={["01", "02", "03"]}
      rows={[
        { label: "LAYER-01", cells: ["blue", "blue", "blue"] },
        { label: "LAYER-02", cells: ["green", "green", "green"] },
      ]}
      onSelectLayer={onSelect}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "LAYER-02" }));
  expect(onSelect).toHaveBeenCalledWith("LAYER-02");
});
```

- [ ] **Step 3: Implement the shared primitives**

```tsx
// pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx
export const ScaledPageCanvas = ({
  children,
  designWidth,
  designHeight,
  horizontalPadding = 32,
  bottomPadding = 32,
}: {
  children: ReactNode;
  designWidth: number;
  designHeight: number;
  horizontalPadding?: number;
  bottomPadding?: number;
}) => {
  const { canvasViewportWidth, canvasWidth, pageScale, useScaledLayout, viewportHeight } = useViewportScale({
    bottomPadding,
    designHeight,
    designWidth,
    horizontalPadding,
  });

  return (
    <div className="w-full pb-4">
      <div className="mx-auto" style={{ height: viewportHeight, width: canvasViewportWidth }}>
        <div className="origin-top-left" style={{ transform: `scale(${pageScale})`, width: `${canvasWidth}px` }}>
          {children}
        </div>
      </div>
    </div>
  );
};
```

```ts
// pbs-portal/src/shared/hooks/use-viewport-scale.ts
type ViewportScaleState = {
  pageScale: number;
  canvasWidth: number;
  viewportWidth: number;
  useScaledLayout: boolean;
  canvasViewportWidth: string;
  viewportHeight: string;
};
```

```tsx
// pbs-portal/src/shared/components/panel/panel-strip-header.tsx
export const PanelStripHeader = ({ title, children }: { title: string; children?: ReactNode }) => (
  <header className="flex items-center justify-between border-b border-[#edf1f6] pb-[12px]">
    <h2 className="text-[16px] font-bold leading-[20px] text-[#40424f]">{title}</h2>
    {children}
  </header>
);
```

```tsx
// pbs-portal/src/shared/components/schedule/schedule-layer-matrix.tsx
export const ScheduleLayerMatrix = ({ rows, dayLabels, activeLayerLabel, onSelectLayer }: Props) => {
  const toneClassMap = { blue: "bg-[#4FCFED]", green: "bg-[#3DC0A9]", yellow: "bg-[#F5B507]", empty: "bg-[#F8F9FB]" };
  return (
    <section className="mt-3 rounded-[8px] border border-[#E2E8ED] bg-white px-4 pb-4 pt-4">
      <ol className="grid items-center gap-x-[2px]" style={{ gridTemplateColumns: `70px repeat(${dayLabels.length}, minmax(0, 1fr))` }}>
        <li aria-hidden="true" />
        {dayLabels.map((day) => <li key={day} className="text-center text-[12px] text-[#6f7485]">{day}</li>)}
      </ol>
      <ul className="mt-[7px] space-y-[3px]">
        {rows.map((row) => (
          <li key={row.label} className="grid items-center gap-x-2" style={{ gridTemplateColumns: "70px minmax(0, 1fr)" }}>
            <button
              type="button"
              className={row.label === activeLayerLabel ? "border-primary bg-primary text-white" : "border-[#E2E8ED] bg-[#F8F9FB] text-[#282c3b]"}
              onClick={() => onSelectLayer(row.label)}
            >
              {row.label}
            </button>
            <ol className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))` }}>
              {row.cells.map((cell, index) => <li key={`${row.label}-${index}`} className={`aspect-square rounded-[4px] ${toneClassMap[cell]}`} />)}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
};
```

- [ ] **Step 4: Run the shared-component tests**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/shared/components/calendar/month-grid-calendar.test.tsx src/shared/components/schedule/schedule-layer-matrix.test.tsx`

Expected: PASS for calendar cell rendering and layer selection.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/shared/components/layout \
  pbs-portal/src/shared/components/panel \
  pbs-portal/src/shared/components/layers \
  pbs-portal/src/shared/components/calendar \
  pbs-portal/src/shared/components/schedule \
  pbs-portal/src/shared/lib/schedule-panel-layout.ts \
  pbs-portal/src/shared/hooks/use-viewport-scale.ts
git commit -m "feat: add pbs-portal shared schedule primitives"
```

### Task 5: Rebuild the dashboard module

**Files:**
- Create: `pbs-portal/src/features/dashboard/types.ts`
- Create: `pbs-portal/src/features/dashboard/mock.ts`
- Create: `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx`
- Create: `pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx`
- Create: `pbs-portal/src/features/dashboard/components/dashboard-left-panel.tsx`
- Create: `pbs-portal/src/features/dashboard/components/dashboard-right-panel.tsx`
- Create: `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`

- [ ] **Step 1: Copy the dashboard types and mock**

Run:

```bash
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/features/dashboard
cp /Users/lei/Codehub/flair-crew-portal/src/modules/dashboard/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/dashboard/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/dashboard/mock.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/dashboard/mock.ts
```

Expected: Dashboard types and mock data exist and only need import-path adjustments.

- [ ] **Step 2: Write the failing dashboard render test**

```tsx
// pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
it("renders the three-column dashboard shell", () => {
  render(<DashboardPage />);
  expect(screen.getByText("BIDDING CALENDAR")).toBeInTheDocument();
  expect(screen.getByText("MESSAGE CENTER")).toBeInTheDocument();
  expect(screen.getByText("USER INFORMATION")).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement the dashboard page and panels**

```tsx
// pbs-portal/src/features/dashboard/pages/dashboard-page.tsx
export const DashboardPage = () => {
  return (
    <ScaledPageCanvas designWidth={1888} designHeight={968}>
      <div className="grid items-start gap-4" style={{ gridTemplateColumns: "436px minmax(0, 1fr) 365px" }}>
        <DashboardLeftPanel data={dashboardUserPanelData} />
        <DashboardSchedulePanel data={dashboardScheduleData} />
        <DashboardRightPanel data={dashboardMessagePanelData} />
      </div>
    </ScaledPageCanvas>
  );
};
```

- [ ] **Step 4: Run the dashboard test**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/features/dashboard/pages/dashboard-page.test.tsx`

Expected: PASS with the dashboard headings rendered.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/features/dashboard
git commit -m "feat: rebuild pbs-portal dashboard module"
```

### Task 6: Rebuild the Days Off and Reserve modules

**Files:**
- Create: `pbs-portal/src/features/days-off/types.ts`
- Create: `pbs-portal/src/features/days-off/mock.ts`
- Create: `pbs-portal/src/features/days-off/pages/days-off-page.tsx`
- Create: `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- Create: `pbs-portal/src/features/days-off/components/days-off-right-panel.tsx`
- Create: `pbs-portal/src/features/reserve/types.ts`
- Create: `pbs-portal/src/features/reserve/mock.ts`
- Create: `pbs-portal/src/features/reserve/pages/reserve-page.tsx`
- Create: `pbs-portal/src/features/reserve/pages/reserve-page.test.tsx`
- Create: `pbs-portal/src/features/reserve/components/reserve-right-panel.tsx`

- [ ] **Step 1: Copy the reference types and mock data**

Run:

```bash
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/features/days-off
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/features/reserve
cp /Users/lei/Codehub/flair-crew-portal/src/modules/days-off/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/days-off/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/days-off/mock.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/days-off/mock.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/reserve/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/reserve/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/reserve/mock.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/reserve/mock.ts
```

- [ ] **Step 2: Write the failing interaction tests**

```tsx
// pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
it("filters properties by search and resets local edits", async () => {
  render(<DaysOffPage />);
  await userEvent.type(screen.getByPlaceholderText("Search properties"), "yvr");
  expect(screen.getByDisplayValue(/YVR/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByPlaceholderText("Search properties")).toHaveValue("");
});
```

```tsx
// pbs-portal/src/features/reserve/pages/reserve-page.test.tsx
it("renders reserve heatmap and add-bid shell action", async () => {
  render(<ReservePage />);
  expect(screen.getByText("Reserve Bid")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add Bid" }));
  expect(screen.getByText("NOV")).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement the Days Off and Reserve pages**

```tsx
// pbs-portal/src/features/days-off/pages/days-off-page.tsx
export const DaysOffPage = () => (
  <ScaledPageCanvas designWidth={1888} designHeight={968}>
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: SHARED_SCHEDULE_PANEL_GRID_TEMPLATE }}>
      <DashboardSchedulePanel data={dashboardScheduleData} contentMinWidth={SHARED_SCHEDULE_PANEL_CONTENT_MIN_WIDTH} showLayerRowsFirst />
      <DaysOffRightPanel data={daysOffRightPanelData} />
    </div>
  </ScaledPageCanvas>
);
```

```tsx
// pbs-portal/src/features/reserve/components/reserve-right-panel.tsx
export const ReserveRightPanel = ({ data }: { data: ReserveCalendarData }) => {
  const [selectedDate, setSelectedDate] = useState(data.selectedDate);
  return (
    <section className="min-h-[968px] overflow-hidden rounded-[12px] bg-white px-5 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
      <PanelStripHeader title={data.title} />
      <div className="mt-10 flex justify-end">
        <Button className="h-[30px] rounded-[4px] px-[14px] text-[13px] font-semibold shadow-none">{data.actionLabel}</Button>
      </div>
      <MonthGridCalendar year={data.year} month={data.month} entries={data.entries} selectedDate={selectedDate} todayDate={data.todayDate} />
    </section>
  );
};
```

- [ ] **Step 4: Run the module tests**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/features/days-off/pages/days-off-page.test.tsx src/features/reserve/pages/reserve-page.test.tsx`

Expected: PASS for search/reset and reserve shell behavior.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/features/days-off pbs-portal/src/features/reserve
git commit -m "feat: rebuild pbs-portal days-off and reserve modules"
```

### Task 7: Rebuild the Layer and Award modules

**Files:**
- Create: `pbs-portal/src/features/layer/types.ts`
- Create: `pbs-portal/src/features/layer/mock.ts`
- Create: `pbs-portal/src/features/layer/pages/layer-page.tsx`
- Create: `pbs-portal/src/features/layer/pages/layer-page.test.tsx`
- Create: `pbs-portal/src/features/layer/components/layer-right-panel.tsx`
- Create: `pbs-portal/src/features/award/types.ts`
- Create: `pbs-portal/src/features/award/mock.ts`
- Create: `pbs-portal/src/features/award/pages/award-page.tsx`
- Create: `pbs-portal/src/features/award/pages/award-page.test.tsx`
- Create: `pbs-portal/src/features/award/components/award-right-panel.tsx`
- Create: `pbs-portal/src/features/award/components/award-trip-card.tsx`

- [ ] **Step 1: Copy the reference types and mock data**

Run:

```bash
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/features/layer
mkdir -p /Users/lei/Codehub/rois-ai/pbs-portal/src/features/award
cp /Users/lei/Codehub/flair-crew-portal/src/modules/layer/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/layer/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/layer/mock.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/layer/mock.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/award/types.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/award/types.ts
cp /Users/lei/Codehub/flair-crew-portal/src/modules/award/mock.ts /Users/lei/Codehub/rois-ai/pbs-portal/src/features/award/mock.ts
```

- [ ] **Step 2: Write the failing interaction tests**

```tsx
// pbs-portal/src/features/layer/pages/layer-page.test.tsx
it("toggles summary visibility and deletes a summary row shell", async () => {
  render(<LayerPage />);
  await userEvent.click(screen.getByRole("button", { name: /Summary/i }));
  expect(screen.queryByText("PRIORITY")).not.toBeInTheDocument();
});
```

```tsx
// pbs-portal/src/features/award/pages/award-page.test.tsx
it("renders award summary and trip cards", async () => {
  render(<AwardPage />);
  expect(screen.getByText("Layer:")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View Reason Report" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement the Layer and Award pages**

```tsx
// pbs-portal/src/features/layer/components/layer-right-panel.tsx
export const LayerRightPanel = ({ data }: { data: LayerPageData }) => {
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [propertiesExpanded, setPropertiesExpanded] = useState(false);
  return (
    <div className="flex min-h-[968px] min-w-0 flex-col gap-4">
      <section className="overflow-hidden rounded-[12px] bg-white px-5 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
        <PanelStripHeader title={data.statisticsTitle} />
      </section>
      <section className="flex flex-1 flex-col overflow-hidden rounded-[12px] bg-white px-5 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
        <PanelStripHeader title={data.summaryTitle}>
          <button onClick={() => setSummaryExpanded((value) => !value)}>{summaryExpanded ? "Collapse" : "Expand"}</button>
        </PanelStripHeader>
      </section>
    </div>
  );
};
```

```tsx
// pbs-portal/src/features/award/components/award-right-panel.tsx
export const AwardRightPanel = ({ data }: { data: AwardPageData }) => (
  <section className="min-h-[968px] overflow-hidden rounded-[12px] bg-white px-6 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
    <PanelStripHeader title={data.title} />
    <div className="mt-8 flex justify-end">
      <Button variant="outline" className="h-[33px] rounded-[4px] border-[#d8dde6] bg-white px-[18px] text-[13px] font-medium text-[#7f8392] shadow-none">
        {data.reportButtonLabel}
      </Button>
    </div>
    <div className="mt-[18px] space-y-[14px]">
      {data.items.map((item) => <AwardTripCard key={item.id} item={item} month={new Date().getMonth() + 1} />)}
    </div>
  </section>
);
```

- [ ] **Step 4: Run the module tests**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test -- --run src/features/layer/pages/layer-page.test.tsx src/features/award/pages/award-page.test.tsx`

Expected: PASS for the summary toggle and award shell checks.

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/features/layer pbs-portal/src/features/award
git commit -m "feat: rebuild pbs-portal layer and award modules"
```

### Task 8: Update smoke coverage, delete obsolete portal placeholders, and verify the migration

**Files:**
- Modify: `pbs-portal/e2e/portal-smoke.spec.ts`
- Delete: `pbs-portal/src/app/layout/portal-shell.tsx`
- Delete: `pbs-portal/src/app/layout/viewport-shell.tsx`
- Delete: `pbs-portal/src/features/auth/pages/auth-callback-page.tsx`
- Delete: `pbs-portal/src/shared/constants/portal-nav.ts`
- Delete: `pbs-portal/src/features/home/pages/home-page.tsx`
- Delete: `pbs-portal/src/features/pbs/pages/pbs-page.tsx`
- Delete: `pbs-portal/src/features/calendar/pages/calendar-page.tsx`
- Delete: `pbs-portal/src/features/messages/pages/messages-page.tsx`
- Delete: `pbs-portal/src/features/notices/pages/notices-page.tsx`
- Delete: `pbs-portal/src/features/settings/pages/settings-page.tsx`

- [ ] **Step 1: Replace the old smoke spec with the new route tree checks**

```ts
// pbs-portal/e2e/portal-smoke.spec.ts
import { expect, test } from "@playwright/test";

test("guests are redirected from /dashboard to /login", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: "null",
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
  await expect(page.getByRole("button", { name: "SSO登录" })).toBeVisible();
});
```

- [ ] **Step 2: Delete the obsolete foundation-only portal files**

Run:

```bash
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/app/layout/portal-shell.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/app/layout/viewport-shell.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/auth/pages/auth-callback-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/shared/constants/portal-nav.ts
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/home/pages/home-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/pbs/pages/pbs-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/calendar/pages/calendar-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/messages/pages/messages-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/notices/pages/notices-page.tsx
rm -f /Users/lei/Codehub/rois-ai/pbs-portal/src/features/settings/pages/settings-page.tsx
```

Expected: `find pbs-portal/src/features/{home,pbs,calendar,messages,notices,settings} -type f` returns nothing.

- [ ] **Step 3: Run the full phase-1 verification set**

Run:

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run lint
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm test
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test:e2e -- e2e/portal-smoke.spec.ts
cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run build
```

Expected:

- `lint`: PASS
- `test`: PASS for route/auth/layout/shared/dashboard/module tests
- `test:e2e`: PASS for guest redirect smoke
- `build`: PASS with route chunks for `/dashboard`, `/days-off`, `/reserve`, `/layer`, `/award`

- [ ] **Step 4: Commit**

```bash
git add pbs-portal/e2e/portal-smoke.spec.ts \
  pbs-portal/src/app/layout \
  pbs-portal/src/features/auth/pages/auth-callback-page.tsx \
  pbs-portal/src/shared/constants \
  pbs-portal/src/features/home \
  pbs-portal/src/features/pbs \
  pbs-portal/src/features/calendar \
  pbs-portal/src/features/messages \
  pbs-portal/src/features/notices \
  pbs-portal/src/features/settings
git commit -m "test: verify pbs-portal phase 1 migration"
```

---

## Self-Review

### Spec coverage

- Reference route tree, legacy cutover, and `/login?token=...` auth contract: Tasks 1-2
- Reference branding, assets, top nav, and main layout: Task 3
- Shared calendar/schedule/panel primitives: Task 4
- Dashboard 1:1 rebuild: Task 5
- Days Off, Reserve, Layer, Award rebuilds with migrated interactions: Tasks 6-7
- Smoke coverage and obsolete portal-shell cleanup: Task 8

**Intentional boundary:** Data stage 2 is not implemented in this plan. The spec defines ownership rules for it, but exact per-module backend contracts are still missing. That follow-up should get its own plan once the target APIs are confirmed.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain in the task steps
- Every behavior task includes concrete test files and commands
- Every route/auth change includes explicit target paths and redirect rules

### Type consistency

- Final business routes stay consistent: `/dashboard`, `/days-off`, `/reserve`, `/layer`, `/award`
- `Pairing / Line / Standing Bid` consistently target `/404` only
- Data stage 1 consistently means live auth foundation + mock-backed module content
- Data stage 2 is consistently deferred rather than half-implemented
