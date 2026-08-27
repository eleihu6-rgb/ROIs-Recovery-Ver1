# PBS Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working `pbs-portal` foundation: Vite app scaffold, guarded routing, auth session skeleton, portal shell with viewport scaling, shared request/query/i18n infrastructure, and Playwright + Vitest testing baseline.

**Architecture:** Use the approved `app / features / shared` structure. Keep server state in TanStack Query, UI state in Zustand, and treat `useRequest` as a supplement only. The first delivery is not full business depth; it is a stable, testable employee portal skeleton that matches the approved spec and is ready for feature implementation.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS 4, shadcn/ui-style primitives, React Router, TanStack Query, Zustand, ahooks, axios, dayjs, lodash-es, Vitest, Playwright

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `pbs-portal/package.json` | Create | Scripts and dependencies |
| `pbs-portal/tsconfig.json` | Create | TypeScript project config |
| `pbs-portal/tsconfig.node.json` | Create | Vite config TS build |
| `pbs-portal/vite.config.ts` | Create | Vite + alias + Vitest config |
| `pbs-portal/eslint.config.js` | Create | ESLint flat config |
| `pbs-portal/index.html` | Create | Vite entry HTML |
| `pbs-portal/src/vite-env.d.ts` | Create | Vite typing |
| `pbs-portal/src/main.tsx` | Create | React entry |
| `pbs-portal/src/app/app.tsx` | Create / Modify | Top-level app shell and bootstrapping |
| `pbs-portal/src/app/providers/app-providers.tsx` | Create / Modify | Query + i18n providers |
| `pbs-portal/src/app/router/app-routes.tsx` | Create / Modify | Application routes |
| `pbs-portal/src/app/router/protected-route.tsx` | Create | Session guard |
| `pbs-portal/src/app/layout/portal-shell.tsx` | Create | Top bar + side nav + content shell |
| `pbs-portal/src/app/layout/viewport-shell.tsx` | Create | Scaled workspace container |
| `pbs-portal/src/app/styles/globals.css` | Create | Tailwind import and theme tokens |
| `pbs-portal/src/shared/lib/cn.ts` | Create | Utility class merger |
| `pbs-portal/src/shared/components/ui/button.tsx` | Create | shadcn-style button primitive |
| `pbs-portal/src/shared/components/ui/input.tsx` | Create | shadcn-style input primitive |
| `pbs-portal/src/shared/components/ui/card.tsx` | Create | shadcn-style card primitive |
| `pbs-portal/src/shared/types/auth.ts` | Create | Session and user types |
| `pbs-portal/src/shared/config/env.ts` | Create | Environment access |
| `pbs-portal/src/shared/query/query-client.ts` | Create | TanStack Query client |
| `pbs-portal/src/shared/i18n/locales/en.ts` | Create | English dictionary |
| `pbs-portal/src/shared/i18n/provider.tsx` | Create | I18n context provider |
| `pbs-portal/src/shared/i18n/use-i18n.ts` | Create | i18n hook |
| `pbs-portal/src/shared/i18n/index.ts` | Create | i18n exports |
| `pbs-portal/src/shared/constants/portal-nav.ts` | Create | Portal navigation metadata |
| `pbs-portal/src/shared/hooks/use-viewport-scale.ts` | Create | Scale utility and hook |
| `pbs-portal/src/shared/services/http-client.ts` | Create | Axios instance |
| `pbs-portal/src/shared/services/request.ts` | Create | Typed request wrapper |
| `pbs-portal/src/shared/services/auth-service.ts` | Create / Modify | Auth API adapter |
| `pbs-portal/src/shared/services/user-service.ts` | Create | User service |
| `pbs-portal/src/shared/services/notices-service.ts` | Create | Notices service |
| `pbs-portal/src/shared/services/messages-service.ts` | Create | Messages service |
| `pbs-portal/src/shared/services/pbs-service.ts` | Create | PBS service |
| `pbs-portal/src/features/auth/store/use-auth-session-store.ts` | Create | Session store |
| `pbs-portal/src/features/auth/pages/login-page.tsx` | Create | Login UI |
| `pbs-portal/src/features/auth/pages/auth-callback-page.tsx` | Create | SSO callback UI |
| `pbs-portal/src/features/home/pages/home-page.tsx` | Create | Portal home placeholder |
| `pbs-portal/src/features/pbs/pages/pbs-page.tsx` | Create | PBS placeholder |
| `pbs-portal/src/features/calendar/pages/calendar-page.tsx` | Create | Calendar placeholder |
| `pbs-portal/src/features/messages/pages/messages-page.tsx` | Create | Messages placeholder |
| `pbs-portal/src/features/notices/pages/notices-page.tsx` | Create | Notices placeholder |
| `pbs-portal/src/features/settings/pages/settings-page.tsx` | Create | Settings placeholder |
| `pbs-portal/src/test/setup.ts` | Create | Vitest setup |
| `pbs-portal/src/shared/i18n/i18n.test.tsx` | Create | i18n tests |
| `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts` | Create | Auth store tests |
| `pbs-portal/src/app/router/app-routes.test.tsx` | Create | Route guard tests |
| `pbs-portal/src/shared/hooks/use-viewport-scale.test.ts` | Create | Scale utility tests |
| `pbs-portal/src/shared/services/http-client.test.ts` | Create | HTTP client tests |
| `pbs-portal/playwright.config.ts` | Create | Playwright setup |
| `pbs-portal/e2e/portal-smoke.spec.ts` | Create | E2E smoke flow |

---

### Task 1: Bootstrap the `pbs-portal` workspace

**Files:**
- Create: `pbs-portal/package.json`
- Create: `pbs-portal/tsconfig.json`
- Create: `pbs-portal/tsconfig.node.json`
- Create: `pbs-portal/vite.config.ts`
- Create: `pbs-portal/eslint.config.js`
- Create: `pbs-portal/index.html`
- Create: `pbs-portal/src/vite-env.d.ts`
- Create: `pbs-portal/src/main.tsx`
- Create: `pbs-portal/src/app/app.tsx`
- Create: `pbs-portal/src/app/providers/app-providers.tsx`
- Create: `pbs-portal/src/app/router/app-routes.tsx`
- Create: `pbs-portal/src/app/styles/globals.css`
- Create: `pbs-portal/src/shared/lib/cn.ts`
- Create: `pbs-portal/src/shared/components/ui/button.tsx`
- Create: `pbs-portal/src/shared/components/ui/input.tsx`
- Create: `pbs-portal/src/shared/components/ui/card.tsx`
- Create: `pbs-portal/src/test/setup.ts`

> Bootstrap/config task. Verification is install + build + lint. Later tasks switch to strict TDD for behavior.

- [ ] **Step 1: Create the project files**

`pbs-portal/package.json`

```json
{
  "name": "pbs-portal",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@heroicons/react": "^2.2.0",
    "@radix-ui/react-slot": "^1.1.1",
    "@tanstack/react-query": "^5.62.0",
    "ahooks": "^3.8.4",
    "axios": "^1.7.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "dayjs": "^1.11.13",
    "lodash-es": "^4.17.21",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "tailwind-merge": "^2.5.5",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.14.0",
    "@playwright/test": "^1.49.0",
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.1",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.14.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.15.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.5"
  }
}
```

`pbs-portal/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts", "eslint.config.js"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`pbs-portal/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

`pbs-portal/vite.config.ts`

```typescript
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    css: true,
  },
});
```

`pbs-portal/eslint.config.js`

```javascript
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "playwright-report"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
```

`pbs-portal/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PBS Portal</title>
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`pbs-portal/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

`pbs-portal/src/main.tsx`

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import "@/app/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`pbs-portal/src/app/app.tsx`

```typescript
import { AppProviders } from "@/app/providers/app-providers";
import { AppRoutes } from "@/app/router/app-routes";

export const App = () => {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
};
```

`pbs-portal/src/app/providers/app-providers.tsx`

```typescript
import type { PropsWithChildren } from "react";

export const AppProviders = ({ children }: PropsWithChildren) => {
  return children;
};
```

`pbs-portal/src/app/router/app-routes.tsx`

```typescript
export const AppRoutes = () => {
  return <div className="p-8 text-sm text-slate-700">PBS Portal bootstrap</div>;
};
```

`pbs-portal/src/app/styles/globals.css`

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 215 25% 12%;
  --card: 0 0% 100%;
  --card-foreground: 215 25% 12%;
  --primary: 213 94% 45%;
  --primary-foreground: 0 0% 100%;
  --muted: 214 32% 95%;
  --muted-foreground: 215 16% 47%;
  --border: 214 20% 90%;
  --input: 214 20% 88%;
  --ring: 213 94% 45%;
  --radius: 0.125rem;
}

@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

`pbs-portal/src/shared/lib/cn.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

`pbs-portal/src/shared/components/ui/button.tsx`

```typescript
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary px-4 py-2 text-primary-foreground hover:opacity-95",
        secondary: "bg-slate-100 px-4 py-2 text-slate-900 hover:bg-slate-200",
        ghost: "px-4 py-2 text-slate-700 hover:bg-slate-100",
      },
      size: {
        sm: "h-9",
        md: "h-10",
        lg: "h-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = ({ className, variant, size, asChild, ...props }: ButtonProps) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
};
```

`pbs-portal/src/shared/components/ui/input.tsx`

```typescript
import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
};
```

`pbs-portal/src/shared/components/ui/card.tsx`

```typescript
import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
};

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
};

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => {
  return <h2 className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
};

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
};
```

`pbs-portal/src/test/setup.ts`

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm install`
Expected: install completes without vulnerability or peer dependency errors that block development

- [ ] **Step 3: Verify build and lint**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run build && npm run lint`
Expected: both commands pass; build outputs `dist/`, lint prints no errors

- [ ] **Step 4: Commit**

```bash
git add pbs-portal/package.json pbs-portal/tsconfig.json pbs-portal/tsconfig.node.json pbs-portal/vite.config.ts pbs-portal/eslint.config.js pbs-portal/index.html pbs-portal/src
git commit -m "feat: bootstrap pbs-portal workspace"
```

---

### Task 2: Add i18n and auth session foundation

**Files:**
- Create: `pbs-portal/src/shared/i18n/locales/en.ts`
- Create: `pbs-portal/src/shared/i18n/provider.tsx`
- Create: `pbs-portal/src/shared/i18n/use-i18n.ts`
- Create: `pbs-portal/src/shared/i18n/index.ts`
- Create: `pbs-portal/src/shared/types/auth.ts`
- Create: `pbs-portal/src/shared/services/auth-service.ts`
- Create: `pbs-portal/src/features/auth/store/use-auth-session-store.ts`
- Create: `pbs-portal/src/shared/i18n/i18n.test.tsx`
- Create: `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts`
- Modify: `pbs-portal/src/app/providers/app-providers.tsx`

- [ ] **Step 1: Write the failing i18n and auth store tests**

`pbs-portal/src/shared/i18n/i18n.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/shared/i18n/provider";
import { useI18n } from "@/shared/i18n/use-i18n";

const Probe = () => {
  const { t } = useI18n();
  return (
    <>
      <span>{t("nav.home")}</span>
      <span>{t("unknown.key")}</span>
    </>
  );
};

describe("I18nProvider", () => {
  it("returns English copy for known keys and the raw key for missing copy", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("unknown.key")).toBeInTheDocument();
  });
});
```

`pbs-portal/src/features/auth/store/use-auth-session-store.test.ts`

```tsx
import { act } from "@testing-library/react";
import { authService } from "@/shared/services/auth-service";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

vi.mock("@/shared/services/auth-service", () => ({
  authService: {
    getSession: vi.fn(),
    login: vi.fn(),
    handleSsoCallback: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

describe("useAuthSessionStore", () => {
  beforeEach(() => {
    useAuthSessionStore.setState({
      status: "idle",
      user: null,
      authMode: null,
      initialize: useAuthSessionStore.getState().initialize,
      completeSso: useAuthSessionStore.getState().completeSso,
      setSession: useAuthSessionStore.getState().setSession,
      clearSession: useAuthSessionStore.getState().clearSession,
    });
    vi.resetAllMocks();
  });

  it("initializes to authenticated when the session API returns a user", async () => {
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      authMode: "password",
    });

    await act(async () => {
      await useAuthSessionStore.getState().initialize();
    });

    expect(useAuthSessionStore.getState().status).toBe("authenticated");
    expect(useAuthSessionStore.getState().user?.employeeNo).toBe("F8001");
  });

  it("clears session data back to unauthenticated", () => {
    useAuthSessionStore.getState().setSession(
      { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      "sso",
    );

    useAuthSessionStore.getState().clearSession();

    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/i18n/i18n.test.tsx src/features/auth/store/use-auth-session-store.test.ts`
Expected: FAIL because `shared/i18n/*`, `shared/types/auth.ts`, `auth-service.ts`, and `use-auth-session-store.ts` do not exist yet

- [ ] **Step 3: Write the minimal implementation**

`pbs-portal/src/shared/i18n/locales/en.ts`

```typescript
export const en = {
  "auth.loginTitle": "Sign in to PBS Portal",
  "auth.loginDescription": "Use your employee account or enterprise sign-in.",
  "auth.username": "Username",
  "auth.password": "Password",
  "auth.submit": "Sign in",
  "auth.sso": "Enterprise sign in",
  "auth.callback": "Completing sign-in…",
  "nav.home": "Home",
  "nav.pbs": "My PBS",
  "nav.calendar": "Calendar",
  "nav.messages": "Messages",
  "nav.notices": "Notices",
  "nav.settings": "Settings",
} as const;

export type TranslationKey = keyof typeof en;
```

`pbs-portal/src/shared/i18n/provider.tsx`

```tsx
import { createContext, useContext, type PropsWithChildren } from "react";
import { en, type TranslationKey } from "@/shared/i18n/locales/en";

type I18nContextValue = {
  t: (key: TranslationKey | string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: PropsWithChildren) => {
  const value: I18nContextValue = {
    t: (key) => en[key as TranslationKey] ?? key,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18nContext = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
};
```

`pbs-portal/src/shared/i18n/use-i18n.ts`

```tsx
import { useI18nContext } from "@/shared/i18n/provider";

export const useI18n = () => useI18nContext();
```

`pbs-portal/src/shared/i18n/index.ts`

```typescript
export { I18nProvider } from "@/shared/i18n/provider";
export { useI18n } from "@/shared/i18n/use-i18n";
export { en, type TranslationKey } from "@/shared/i18n/locales/en";
```

`pbs-portal/src/shared/types/auth.ts`

```typescript
export type AuthMode = "password" | "sso";
export type SessionStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export type AuthenticatedUser = {
  id: string;
  name: string;
  employeeNo: string;
};

export type AuthenticatedSession = {
  user: AuthenticatedUser;
  authMode: AuthMode;
};
```

`pbs-portal/src/shared/services/auth-service.ts`

```typescript
import type { AuthenticatedSession } from "@/shared/types/auth";

export const authService = {
  async getSession(): Promise<AuthenticatedSession | null> {
    return null;
  },
  async login(): Promise<AuthenticatedSession> {
    throw new Error("login() not implemented yet");
  },
  async handleSsoCallback(): Promise<AuthenticatedSession> {
    throw new Error("handleSsoCallback() not implemented yet");
  },
  async logout(): Promise<void> {
    return;
  },
};
```

`pbs-portal/src/features/auth/store/use-auth-session-store.ts`

```typescript
import { create } from "zustand";
import { authService } from "@/shared/services/auth-service";
import type { AuthMode, AuthenticatedUser, SessionStatus } from "@/shared/types/auth";

type AuthSessionState = {
  status: SessionStatus;
  user: AuthenticatedUser | null;
  authMode: AuthMode | null;
  initialize: () => Promise<void>;
  completeSso: () => Promise<void>;
  setSession: (user: AuthenticatedUser, authMode: AuthMode) => void;
  clearSession: () => void;
};

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  status: "idle",
  user: null,
  authMode: null,
  initialize: async () => {
    set({ status: "loading" });
    const session = await authService.getSession();
    if (session) {
      set({ status: "authenticated", user: session.user, authMode: session.authMode });
      return;
    }
    set({ status: "unauthenticated", user: null, authMode: null });
  },
  completeSso: async () => {
    set({ status: "loading" });
    const session = await authService.handleSsoCallback();
    set({ status: "authenticated", user: session.user, authMode: session.authMode });
  },
  setSession: (user, authMode) => set({ status: "authenticated", user, authMode }),
  clearSession: () => set({ status: "unauthenticated", user: null, authMode: null }),
}));
```

`pbs-portal/src/app/providers/app-providers.tsx`

```tsx
import type { PropsWithChildren } from "react";
import { I18nProvider } from "@/shared/i18n";

export const AppProviders = ({ children }: PropsWithChildren) => {
  return <I18nProvider>{children}</I18nProvider>;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/i18n/i18n.test.tsx src/features/auth/store/use-auth-session-store.test.ts`
Expected: PASS with 3 tests green

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/shared/i18n pbs-portal/src/shared/types/auth.ts pbs-portal/src/shared/services/auth-service.ts pbs-portal/src/features/auth/store/use-auth-session-store.ts pbs-portal/src/app/providers/app-providers.tsx pbs-portal/src/shared/i18n/i18n.test.tsx pbs-portal/src/features/auth/store/use-auth-session-store.test.ts
git commit -m "feat: add pbs-portal i18n and auth session foundation"
```

---

### Task 3: Add guarded routing and auth pages

**Files:**
- Create: `pbs-portal/src/app/router/protected-route.tsx`
- Modify: `pbs-portal/src/app/router/app-routes.tsx`
- Modify: `pbs-portal/src/app/app.tsx`
- Create: `pbs-portal/src/app/router/app-routes.test.tsx`
- Create: `pbs-portal/src/features/auth/pages/login-page.tsx`
- Create: `pbs-portal/src/features/auth/pages/auth-callback-page.tsx`
- Create: `pbs-portal/src/features/home/pages/home-page.tsx`
- Create: `pbs-portal/src/features/pbs/pages/pbs-page.tsx`
- Create: `pbs-portal/src/features/calendar/pages/calendar-page.tsx`
- Create: `pbs-portal/src/features/messages/pages/messages-page.tsx`
- Create: `pbs-portal/src/features/notices/pages/notices-page.tsx`
- Create: `pbs-portal/src/features/settings/pages/settings-page.tsx`

- [ ] **Step 1: Write the failing route tests**

`pbs-portal/src/app/router/app-routes.test.tsx`

```tsx
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { AppProviders } from "@/app/providers/app-providers";
import { AppRoutes } from "@/app/router/app-routes";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

const renderRoutes = (entry: string) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
};

describe("AppRoutes", () => {
  beforeEach(() => {
    useAuthSessionStore.setState({
      status: "unauthenticated",
      user: null,
      authMode: null,
      initialize: useAuthSessionStore.getState().initialize,
      completeSso: useAuthSessionStore.getState().completeSso,
      setSession: useAuthSessionStore.getState().setSession,
      clearSession: useAuthSessionStore.getState().clearSession,
    });
  });

  it("redirects guests from /portal to /login", () => {
    renderRoutes("/portal");
    expect(screen.getByRole("heading", { name: "Sign in to PBS Portal" })).toBeInTheDocument();
  });

  it("renders protected pages when the session is authenticated", () => {
    useAuthSessionStore.getState().setSession(
      { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      "password",
    );

    renderRoutes("/portal/messages");

    expect(screen.getByRole("heading", { name: "Messages" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/app/router/app-routes.test.tsx`
Expected: FAIL because protected routing and route page modules do not exist yet

- [ ] **Step 3: Implement protected routing and page placeholders**

`pbs-portal/src/app/router/protected-route.tsx`

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

export const ProtectedRoute = () => {
  const status = useAuthSessionStore((state) => state.status);

  if (status === "loading" || status === "idle") {
    return <div className="p-8 text-sm text-slate-600">Checking session…</div>;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
```

`pbs-portal/src/app/router/app-routes.tsx`

```tsx
import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/app/router/protected-route";

const LoginPage = lazy(() => import("@/features/auth/pages/login-page"));
const AuthCallbackPage = lazy(() => import("@/features/auth/pages/auth-callback-page"));
const HomePage = lazy(() => import("@/features/home/pages/home-page"));
const PbsPage = lazy(() => import("@/features/pbs/pages/pbs-page"));
const CalendarPage = lazy(() => import("@/features/calendar/pages/calendar-page"));
const MessagesPage = lazy(() => import("@/features/messages/pages/messages-page"));
const NoticesPage = lazy(() => import("@/features/notices/pages/notices-page"));
const SettingsPage = lazy(() => import("@/features/settings/pages/settings-page"));

export const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-600">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/portal" element={<HomePage />} />
          <Route path="/portal/pbs" element={<PbsPage />} />
          <Route path="/portal/calendar" element={<CalendarPage />} />
          <Route path="/portal/messages" element={<MessagesPage />} />
          <Route path="/portal/notices" element={<NoticesPage />} />
          <Route path="/portal/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </Suspense>
  );
};
```

`pbs-portal/src/app/app.tsx`

```tsx
import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "@/app/providers/app-providers";
import { AppRoutes } from "@/app/router/app-routes";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

export const App = () => {
  const initialize = useAuthSessionStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
};
```

`pbs-portal/src/features/auth/pages/login-page.tsx`

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useI18n } from "@/shared/i18n";

const LoginPage = () => {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.loginTitle")}</CardTitle>
          <p className="text-sm text-slate-500">{t("auth.loginDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder={t("auth.username")} />
          <Input type="password" placeholder={t("auth.password")} />
          <div className="flex gap-3">
            <Button className="flex-1">{t("auth.submit")}</Button>
            <Button variant="secondary" className="flex-1">{t("auth.sso")}</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default LoginPage;
```

`pbs-portal/src/features/auth/pages/auth-callback-page.tsx`

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/shared/i18n";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const completeSso = useAuthSessionStore((state) => state.completeSso);

  useEffect(() => {
    void completeSso().then(() => navigate("/portal", { replace: true }));
  }, [completeSso, navigate]);

  return <div className="p-8 text-sm text-slate-600">{t("auth.callback")}</div>;
};

export default AuthCallbackPage;
```

Use the same pattern for placeholder feature pages:

```tsx
// Example: pbs-portal/src/features/messages/pages/messages-page.tsx
const MessagesPage = () => {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Messages</h1>
    </main>
  );
};

export default MessagesPage;
```

Create files for `home-page.tsx`, `pbs-page.tsx`, `calendar-page.tsx`, `messages-page.tsx`, `notices-page.tsx`, and `settings-page.tsx` with the same structure and matching headings: `Home`, `My PBS`, `Calendar`, `Messages`, `Notices`, `Settings`.

- [ ] **Step 4: Run the route tests to verify they pass**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/app/router/app-routes.test.tsx`
Expected: PASS with both route guard tests green

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/app/app.tsx pbs-portal/src/app/router pbs-portal/src/features/auth/pages pbs-portal/src/features/home/pages pbs-portal/src/features/pbs/pages pbs-portal/src/features/calendar/pages pbs-portal/src/features/messages/pages pbs-portal/src/features/notices/pages pbs-portal/src/features/settings/pages
git commit -m "feat: add guarded portal routes and auth pages"
```

---

### Task 4: Add the portal shell and viewport scaling

**Files:**
- Create: `pbs-portal/src/shared/constants/portal-nav.ts`
- Create: `pbs-portal/src/shared/hooks/use-viewport-scale.ts`
- Create: `pbs-portal/src/shared/hooks/use-viewport-scale.test.ts`
- Create: `pbs-portal/src/app/layout/viewport-shell.tsx`
- Create: `pbs-portal/src/app/layout/portal-shell.tsx`
- Modify: `pbs-portal/src/app/router/app-routes.tsx`

- [ ] **Step 1: Write the failing viewport scale test**

`pbs-portal/src/shared/hooks/use-viewport-scale.test.ts`

```tsx
import { calculateViewportScale } from "@/shared/hooks/use-viewport-scale";

describe("calculateViewportScale", () => {
  it("returns 1 when the viewport is wider than the minimum width", () => {
    expect(calculateViewportScale(1440, 1280)).toBe(1);
  });

  it("returns a fractional scale when the viewport is narrower than the minimum width", () => {
    expect(calculateViewportScale(960, 1280)).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/hooks/use-viewport-scale.test.ts`
Expected: FAIL because `use-viewport-scale.ts` does not exist yet

- [ ] **Step 3: Implement viewport scaling and the portal shell**

`pbs-portal/src/shared/constants/portal-nav.ts`

```typescript
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HomeIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";

export const portalNav = [
  { label: "Home", href: "/portal", icon: HomeIcon },
  { label: "My PBS", href: "/portal/pbs", icon: ClipboardDocumentListIcon },
  { label: "Calendar", href: "/portal/calendar", icon: CalendarDaysIcon },
  { label: "Messages", href: "/portal/messages", icon: ChatBubbleLeftRightIcon },
  { label: "Notices", href: "/portal/notices", icon: NewspaperIcon },
  { label: "Settings", href: "/portal/settings", icon: Cog6ToothIcon },
] as const;
```

`pbs-portal/src/shared/hooks/use-viewport-scale.ts`

```tsx
import { useEffect, useState } from "react";

export const calculateViewportScale = (viewportWidth: number, minWidth: number) => {
  if (viewportWidth >= minWidth) {
    return 1;
  }
  return Number((viewportWidth / minWidth).toFixed(4));
};

export const useViewportScale = (minWidth: number) => {
  const [scale, setScale] = useState(() => calculateViewportScale(window.innerWidth, minWidth));

  useEffect(() => {
    const handleResize = () => {
      setScale(calculateViewportScale(window.innerWidth, minWidth));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [minWidth]);

  return scale;
};
```

`pbs-portal/src/app/layout/viewport-shell.tsx`

```tsx
import type { PropsWithChildren } from "react";
import { useViewportScale } from "@/shared/hooks/use-viewport-scale";

type ViewportShellProps = PropsWithChildren<{
  minWidth?: number;
}>;

export const ViewportShell = ({ children, minWidth = 1280 }: ViewportShellProps) => {
  const scale = useViewportScale(minWidth);

  return (
    <div className="min-h-screen overflow-auto bg-slate-100">
      <div
        className="origin-top-left"
        style={{
          minWidth,
          transform: `scale(${scale})`,
          width: scale < 1 ? `${100 / scale}%` : "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
};
```

`pbs-portal/src/app/layout/portal-shell.tsx`

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { portalNav } from "@/shared/constants/portal-nav";
import { ViewportShell } from "@/app/layout/viewport-shell";
import { cn } from "@/shared/lib/cn";

export const PortalShell = () => {
  return (
    <ViewportShell>
      <div data-testid="portal-shell" className="grid min-h-screen grid-cols-[240px_1fr] bg-slate-100">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-5 text-sm font-semibold text-slate-900">
            PBS Portal
          </div>
          <nav className="space-y-1 p-4">
            {portalNav.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === "/portal"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 transition-colors",
                    isActive && "bg-slate-100 font-medium text-slate-900",
                  )
                }
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="text-sm text-slate-500">Employee portal</div>
          </header>
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </ViewportShell>
  );
};
```

Update `pbs-portal/src/app/router/app-routes.tsx` so the protected section uses the shell:

```tsx
import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/app/router/protected-route";
import { PortalShell } from "@/app/layout/portal-shell";

// ...existing lazy imports...

export const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-600">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/portal" element={<PortalShell />}>
            <Route index element={<HomePage />} />
            <Route path="pbs" element={<PbsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="notices" element={<NoticesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </Suspense>
  );
};
```

- [ ] **Step 4: Run the scale test and re-run route tests**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/hooks/use-viewport-scale.test.ts src/app/router/app-routes.test.tsx`
Expected: PASS; route tests remain green after shell nesting

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/shared/constants/portal-nav.ts pbs-portal/src/shared/hooks/use-viewport-scale.ts pbs-portal/src/shared/hooks/use-viewport-scale.test.ts pbs-portal/src/app/layout pbs-portal/src/app/router/app-routes.tsx
git commit -m "feat: add portal shell and viewport scaling"
```

---

### Task 5: Add env, request, and query infrastructure

**Files:**
- Create: `pbs-portal/src/shared/config/env.ts`
- Create: `pbs-portal/src/shared/query/query-client.ts`
- Create: `pbs-portal/src/shared/services/http-client.ts`
- Create: `pbs-portal/src/shared/services/request.ts`
- Modify: `pbs-portal/src/shared/services/auth-service.ts`
- Create: `pbs-portal/src/shared/services/user-service.ts`
- Create: `pbs-portal/src/shared/services/notices-service.ts`
- Create: `pbs-portal/src/shared/services/messages-service.ts`
- Create: `pbs-portal/src/shared/services/pbs-service.ts`
- Create: `pbs-portal/src/shared/services/http-client.test.ts`
- Modify: `pbs-portal/src/app/providers/app-providers.tsx`

- [ ] **Step 1: Write the failing HTTP client test**

`pbs-portal/src/shared/services/http-client.test.ts`

```tsx
import { createHttpClient, resolveApiBaseUrl } from "@/shared/services/http-client";

describe("http-client", () => {
  it("uses /api as the default base URL", () => {
    expect(resolveApiBaseUrl()).toBe("/api");
  });

  it("creates an axios instance with credentials enabled", () => {
    const client = createHttpClient("https://api.example.com");
    expect(client.defaults.baseURL).toBe("https://api.example.com");
    expect(client.defaults.withCredentials).toBe(true);
    expect(client.defaults.timeout).toBe(10000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/services/http-client.test.ts`
Expected: FAIL because the HTTP client module does not exist yet

- [ ] **Step 3: Implement env access, request wrappers, and the Query client**

`pbs-portal/src/shared/config/env.ts`

```typescript
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "/api",
  ssoLoginUrl: import.meta.env.VITE_SSO_LOGIN_URL || "/api/auth/sso/login",
};
```

`pbs-portal/src/shared/query/query-client.ts`

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
```

`pbs-portal/src/shared/services/http-client.ts`

```typescript
import axios from "axios";

export const resolveApiBaseUrl = (rawBaseUrl?: string) => rawBaseUrl || "/api";

export const createHttpClient = (baseURL = resolveApiBaseUrl()) => {
  return axios.create({
    baseURL,
    withCredentials: true,
    timeout: 10_000,
  });
};
```

`pbs-portal/src/shared/services/request.ts`

```typescript
import { env } from "@/shared/config/env";
import { createHttpClient } from "@/shared/services/http-client";

const client = createHttpClient(env.apiBaseUrl);

export const request = {
  get: async <T>(url: string, params?: Record<string, unknown>) => {
    const response = await client.get<T>(url, { params });
    return response.data;
  },
  post: async <T>(url: string, data?: unknown) => {
    const response = await client.post<T>(url, data);
    return response.data;
  },
};
```

`pbs-portal/src/shared/services/auth-service.ts`

```typescript
import { request } from "@/shared/services/request";
import type { AuthenticatedSession } from "@/shared/types/auth";

export const authService = {
  async getSession(): Promise<AuthenticatedSession | null> {
    return request.get<AuthenticatedSession | null>("/auth/session");
  },
  async login(payload?: { username: string; password: string }): Promise<AuthenticatedSession> {
    return request.post<AuthenticatedSession>("/auth/login", payload);
  },
  async handleSsoCallback(payload?: { code?: string }): Promise<AuthenticatedSession> {
    return request.post<AuthenticatedSession>("/auth/sso/callback", payload);
  },
  async logout(): Promise<void> {
    await request.post("/auth/logout");
  },
};
```

`pbs-portal/src/shared/services/user-service.ts`

```typescript
import { request } from "@/shared/services/request";

export const userService = {
  getProfile: () => request.get("/portal/profile"),
};
```

`pbs-portal/src/shared/services/notices-service.ts`

```typescript
import { request } from "@/shared/services/request";

export const noticesService = {
  list: () => request.get("/portal/notices"),
};
```

`pbs-portal/src/shared/services/messages-service.ts`

```typescript
import { request } from "@/shared/services/request";

export const messagesService = {
  list: () => request.get("/portal/messages"),
};
```

`pbs-portal/src/shared/services/pbs-service.ts`

```typescript
import { request } from "@/shared/services/request";

export const pbsService = {
  listBids: () => request.get("/portal/pbs"),
};
```

Update `pbs-portal/src/app/providers/app-providers.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/shared/i18n";
import { queryClient } from "@/shared/query/query-client";

export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
};
```

- [ ] **Step 4: Run the HTTP client test and a full build**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test -- src/shared/services/http-client.test.ts && npm run build`
Expected: PASS; the client test is green and the app still builds

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/src/shared/config/env.ts pbs-portal/src/shared/query/query-client.ts pbs-portal/src/shared/services pbs-portal/src/app/providers/app-providers.tsx
git commit -m "feat: add query and request infrastructure for pbs-portal"
```

---

### Task 6: Add Playwright smoke coverage and final verification

**Files:**
- Create: `pbs-portal/playwright.config.ts`
- Create: `pbs-portal/e2e/portal-smoke.spec.ts`

- [ ] **Step 1: Write the failing Playwright smoke test**

`pbs-portal/e2e/portal-smoke.spec.ts`

```typescript
import { expect, test } from "@playwright/test";

test("guests are redirected from /portal to /login", async ({ page }) => {
  await page.goto("/portal");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to PBS Portal" })).toBeVisible();
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npx playwright test e2e/portal-smoke.spec.ts`
Expected: FAIL because `playwright.config.ts` is missing and `page.goto("/portal")` has no configured `baseURL`

- [ ] **Step 3: Implement Playwright config**

`pbs-portal/playwright.config.ts`

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Run the smoke test and then the full verification set**

Run: `cd /Users/lei/Codehub/rois-ai/pbs-portal && npm run test:e2e -- e2e/portal-smoke.spec.ts && npm run lint && npm run test && npm run build`
Expected: PASS; smoke spec is green and the whole foundation is buildable and testable

- [ ] **Step 5: Commit**

```bash
git add pbs-portal/playwright.config.ts pbs-portal/e2e/portal-smoke.spec.ts
git commit -m "test: add pbs-portal Playwright smoke coverage"
```

---

## Self-Review

### Spec coverage

- Architecture and `app / features / shared` boundaries: Tasks 1–4
- Auth and guarded routes: Tasks 2–3
- English-first i18n scaffolding: Task 2
- Performance-oriented viewport scaling and shell structure: Task 4
- Request/query foundation: Task 5
- Playwright + Vitest testing baseline: Tasks 2–6

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain in the task steps
- Every new behavior task includes either failing Vitest or failing Playwright coverage before implementation
- Config/bootstrap work is isolated to Task 1 and verified by build/lint rather than hidden inside later behavior tasks

### Type consistency

- Session shape is consistently `AuthenticatedSession -> { user, authMode }`
- Route split is consistently `/login`, `/auth/callback`, `/portal/*`
- State ownership stays consistent: Query for server data, Zustand for session/UI

