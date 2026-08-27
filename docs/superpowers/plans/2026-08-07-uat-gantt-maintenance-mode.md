# UAT Gantt Maintenance Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When manually importing data into UAT, switch the UAT Gantt SPA (`https://crew-f8-usva-uat.roiscloud.com/altair/`) into a maintenance mode where visitors see a standalone maintenance page instead of the app — and provide a `rois.sh maintain on|off|status` command to toggle it. Backend proxies (`/live/ /rule/ /engine/ /ai/ /pbs/api/`) keep serving during maintenance.

**Architecture:** nginx marker-file gate on the `/altair/` location only. When `/home/yuan.z/rois/uat/maintenance.flag` exists, nginx returns 503 for every `/altair/*` path and serves the self-contained `deploy/nginx/maintenance.html` via `error_page`. The page polls `/altair/` every 10s and auto-reloads once the gate is lifted (response flips 503→200). The maintenance page + flag live **outside** the gantt dist dir so `rois.sh build gantt` redeploys never wipe them. The nginx config is version-managed in the repo (`deploy/nginx/`); `rois.sh` is a per-host untracked script.

**Tech Stack:** nginx (config), static HTML (inline CSS/JS, no deps), Bash (`rois.sh`), Playwright (e2e).

## Global Constraints

- **Backend must keep serving during maintenance.** Only the `/altair/` SPA location is gated; never touch `/altair/assets/`, `/live/`, `/rule/`, `/engine/`, `/ai/`, `/pbs/`, `/pbs/api/`, `/report/`, `/fpqe/*` in `f8-uat.conf`.
- **Fixed English message** (no custom messages): heading `System Under Maintenance`, body `The system is currently undergoing scheduled maintenance. Please check back later.`
- **Auto-refresh recovery**: page polls `/altair/` with `{ cache: 'no-store' }`; on `res.status === 200` calls `window.location.reload()`. Default interval 10s; `?poll=<ms>` query param overrides it (testability + ops knob).
- **Marker & page live outside the gantt dist**: `/home/yuan.z/rois/uat/maintenance.flag` and `/home/yuan.z/rois/uat/maintenance.html` — never inside `/home/yuan.z/rois/uat/gantt/` (the deploy() function `rm -rf`s that dir).
- **Only safe nginx `if`**: `if (-f <abs-path>) { return 503; }` (contains only `return`). Never put `try_files` inside the `if`.
- The maintenance page is standalone static HTML — **not** in `gantt/src` / `packages/ui/src`, so `npm run check:ui` does not scan it; style it inline matching the app's dark high-density theme.
- `rois.sh` is per-host and **not committed** to the repo (verified: `git ls-files rois.sh` is empty). Only `deploy/nginx/*`, the e2e test, and docs are committed.
- Reference spec: `docs/superpowers/specs/2026-08-07-uat-gantt-maintenance-mode-design.md`.

---

### Task 1: Maintenance page + Playwright test (repo — commit)

**Files:**
- Create: `deploy/nginx/maintenance.html`
- Create: `e2e/tests/gantt/maintenance-page.spec.ts`

**Interfaces:**
- Produces: `deploy/nginx/maintenance.html` — served at `/home/yuan.z/rois/uat/maintenance.html`; read by `rois.sh maintain on` (scp source) and by the Playwright test (reads file from disk). Contains a `fetch('/altair/', { cache: 'no-store' })` probe; treats HTTP 200 as "gate lifted" → `location.reload()`. Reads `?poll=<ms>` (default 10000).
- Produces: `e2e/tests/gantt/maintenance-page.spec.ts` — run with the gantt-only config, no real backend needed (all requests route-intercepted).

- [ ] **Step 1: Write the Playwright test** (fail-first red)

Create `e2e/tests/gantt/maintenance-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const maintenanceHtml = readFileSync(
  path.resolve(__dirname, '../../../deploy/nginx/maintenance.html'),
  'utf8',
)

test.describe('UAT Gantt maintenance page', () => {
  test('renders the fixed English notice', async ({ page }) => {
    await page.route('**/*', (route) =>
      route.fulfill({ status: 503, contentType: 'text/html', body: maintenanceHtml }),
    )
    await page.goto('https://maint.test/altair/')
    await expect(page.getByText('System Under Maintenance')).toBeVisible()
    await expect(page.getByText(/scheduled maintenance/i)).toBeVisible()
  })

  test('auto-reloads when the maintenance gate is lifted', async ({ page }) => {
    let probes = 0
    let gateLifted = false
    let navCount = 0
    page.on('request', (req) => {
      if (req.isNavigationRequest()) navCount += 1
    })

    // Once the gate lifts, a reload must serve the real app (which has no probe
    // JS), not the maintenance page — otherwise the probe would loop forever.
    const appHtml = '<!DOCTYPE html><html lang="en"><body><div id="app">APP LOADED</div></body></html>'

    await page.route('**/*', (route) => {
      const req = route.request()
      const url = new URL(req.url())
      // Only fetch probes (not navigation requests) count toward the gate probe.
      // First probe → 503 (still in maintenance). Second probe → 200 → auto-reload.
      if (!req.isNavigationRequest() && url.pathname.endsWith('/altair/')) {
        probes += 1
        if (probes >= 2) gateLifted = true
        return route.fulfill({
          status: probes >= 2 ? 200 : 503,
          contentType: 'text/html',
          body: maintenanceHtml,
        })
      }
      // Navigation request (initial load or the post-gate reload): serve the app
      // once the gate has been lifted, the maintenance page otherwise.
      return route.fulfill({
        status: gateLifted ? 200 : 503,
        contentType: 'text/html',
        body: gateLifted ? appHtml : maintenanceHtml,
      })
    })

    await page.goto('https://maint.test/altair/?poll=50')
    await expect(page.getByText('System Under Maintenance')).toBeVisible()
    await expect.poll(() => probes, { timeout: 5_000 }).toBeGreaterThanOrEqual(1) // initial on-load probe fired

    // ?poll=50 → interval probe after ~50ms returns 200 → page reloads into the app.
    await expect.poll(() => navCount, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    await expect(page.getByText('APP LOADED')).toBeVisible()
  })
})
```

- [ ] **Step 2: Create a placeholder maintenance page and confirm the test fails**

Create `deploy/nginx/maintenance.html` with ONLY this (no message yet):

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>placeholder</title></head>
<body><h1>placeholder</h1></body>
</html>
```

Run:

```bash
cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test --config=config/playwright.gantt-only.config.ts tests/gantt/maintenance-page.spec.ts --reporter=list
```

Expected: **RED** — the first test fails: `expect(...toBeVisible())` — "System Under Maintenance" is not found. (The e2e/results/.auth/gantt-admin.json already exists, so no auth setup is needed.)

- [ ] **Step 3: Write the real maintenance page**

Replace `deploy/nginx/maintenance.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>System Under Maintenance — ROIS Altair</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0b0d12;
    color: #e6e9ef;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 440px;
    padding: 40px 32px;
    text-align: center;
    border: 1px solid #232833;
    border-radius: 6px;
    background: #11141b;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    margin-bottom: 20px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9fb3c8;
    background: #1a2029;
    border-radius: 999px;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #f2f4f8;
  }
  p {
    font-size: 14px;
    line-height: 1.6;
    color: #9aa3b2;
  }
</style>
</head>
<body>
  <main class="card">
    <span class="badge">ROIS Altair</span>
    <h1>System Under Maintenance</h1>
    <p>The system is currently undergoing scheduled maintenance. Please check back later.</p>
  </main>
  <script>
    // Auto-recovery: once the maintenance gate is lifted (/altair/ returns 200
    // instead of 503), reload so the real app loads without a manual refresh.
    // Interval defaults to 10s; override for faster recovery with ?poll=<ms>.
    var interval = Number(new URLSearchParams(window.location.search).get('poll')) || 10000
    function probe() {
      fetch('/altair/', { cache: 'no-store' })
        .then(function (res) { if (res.status === 200) window.location.reload() })
        .catch(function () {}) // transient failure — keep polling
    }
    probe()
    window.setInterval(probe, interval)
  </script>
</body>
</html>
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test --config=config/playwright.gantt-only.config.ts tests/gantt/maintenance-page.spec.ts --reporter=list
```

Expected: **GREEN** — both tests pass. Paste the PASS summary in your final report (§No-Illusion).

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add deploy/nginx/maintenance.html e2e/tests/gantt/maintenance-page.spec.ts
git commit -m "feat(maintenance): standalone UAT maintenance page + Playwright test

Self-contained maintenance.html (fixed EN notice, auto-refresh probe with
?poll= override); e2e test proves render + auto-reload via route mocks.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: nginx gate on `/altair/` only (repo — commit)

**Files:**
- Modify: `deploy/nginx/conf.d/f8-uat.conf` — the "Gantt SPA" block (~line 228) and append the error_page + named location after it.

**Interfaces:**
- Produces: `/etc/nginx/conf.d/f8-uat.conf` (after Task 5 deploy) — `/altair/*` returns 503 + maintenance page when `/home/yuan.z/rois/uat/maintenance.flag` exists; backend locations untouched.
- Consumes: `deploy/nginx/maintenance.html` file at `/home/yuan.z/rois/uat/maintenance.html` (deployed by `rois.sh maintain on` in Task 3).

- [ ] **Step 1: Apply the config edit**

Current block (do not touch `/altair/assets/`):

```nginx
    location = /altair { return 301 /altair/; }
    location ^~ /altair/assets/ {
        alias /home/yuan.z/rois/uat/gantt/assets/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }
    location ^~ /altair/ {
        alias /home/yuan.z/rois/uat/gantt/;
        index index.html;
        # NB: no "$uri/" here — the built dist has real help/ and release/ dirs
        # (screenshots) that shadow the SPA routes /altair/help and /altair/release;
        # serving the dir as-is returns 403. Unknown paths must fall to the SPA.
        try_files $uri /altair/index.html;
    }
```

Replace with (note the `if` gate added INSIDE `/altair/`, plus the `error_page`/`@altair_maintenance` block after):

```nginx
    location = /altair { return 301 /altair/; }
    location ^~ /altair/assets/ {
        alias /home/yuan.z/rois/uat/gantt/assets/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }
    location ^~ /altair/ {
        alias /home/yuan.z/rois/uat/gantt/;
        index index.html;
        # NB: no "$uri/" here — the built dist has real help/ and release/ dirs
        # (screenshots) that shadow the SPA routes /altair/help and /altair/release;
        # serving the dir as-is returns 403. Unknown paths must fall to the SPA.
        try_files $uri /altair/index.html;
        # UAT 维护模式：maintenance.flag 存在时，整个 /altair/ SPA 返回 503 并渲染
        # 维护页（deploy/nginx/maintenance.html，经 rois.sh maintain on 部署到
        # /home/yuan.z/rois/uat/maintenance.html）。只挡前端；/live /rule /engine /ai
        # /pbs/api 后端代理不受影响，维护期间可继续手工导数据。
        if (-f /home/yuan.z/rois/uat/maintenance.flag) { return 503; }
    }
    error_page 503 @altair_maintenance;
    location @altair_maintenance {
        internal;
        default_type text/html;
        # alias 禁止用于具名 location —— 用 root + try_files 解析到维护页文件
        root /home/yuan.z/rois/uat;
        try_files /maintenance.html =404;
        add_header Cache-Control "no-store";
    }
```

- [ ] **Step 2: Sanity-check the edit**

- Confirm the `if` block contains **only** `return 503;` (no `rewrite`, no `try_files`, no `proxy_pass` inside it).
- Confirm the gate path `/home/yuan.z/rois/uat/maintenance.flag` is absolute and **outside** the gantt dist dir.
- Confirm no other location in the file was modified (backend proxies `/live/` `/rule/` `/engine/` `/ai/` `/pbs/api/` untouched).

Note: the dev box has no `nginx` binary, so `nginx -t` cannot run locally. Syntax validation happens on the webserver during Task 5 (`deploy-nginx.sh` runs `nginx -t` and auto-rolls back on failure).

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add deploy/nginx/conf.d/f8-uat.conf
git commit -m "chore(nginx): UAT /altair maintenance gate + maintenance page location

Marker-file gate (if (-f ...) return 503) on /altair/ SPA only; backend
proxies untouched. error_page 503 serves the standalone maintenance page
with Cache-Control no-store.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `rois.sh maintain on|off|status` command (per-host — NO commit)

**Files:**
- Modify: `/home/yuan.z/rois/rois.sh`

**Interfaces:**
- Consumes: `deploy/nginx/maintenance.html` (local scp source at `$ROIS_AI/deploy/nginx/maintenance.html`), remote paths on `yuan.z@10.15.12.2`.
- Produces: marker file `/home/yuan.z/rois/uat/maintenance.flag` and page `/home/yuan.z/rois/uat/maintenance.html` on the webserver; stdout verification of HTTP status.

- [ ] **Step 1: Add config vars** in the 配置区 block of `rois.sh` (after the `REMOTE_GANTT`/`REMOTE_PBS`/`REMOTE_REPORT` lines, ~line 46):

```bash
# UAT 维护模式（deploy/nginx/conf.d/f8-uat.conf 的 /altair/ gate 配合使用）
UAT_MAINT_SRC="${UAT_MAINT_SRC:-$ROIS_AI/deploy/nginx/maintenance.html}"
UAT_MAINT_PAGE="${UAT_MAINT_PAGE:-/home/yuan.z/rois/uat/maintenance.html}"
UAT_MAINT_FLAG="${UAT_MAINT_FLAG:-/home/yuan.z/rois/uat/maintenance.flag}"
UAT_MAINT_URL="${UAT_MAINT_URL:-https://crew-f8-usva-uat.roiscloud.com/altair/}"
```

- [ ] **Step 2: Add the maintain functions** — insert before the `# === 用法说明 ===` section (before `usage()`):

```bash
# === UAT 维护模式 ===

maintain_on() {
    log_action "进入 UAT 维护模式..."
    [ -f "$UAT_MAINT_SRC" ] || log_fail "[maintain] 维护页源码不存在: $UAT_MAINT_SRC"
    check_ssh
    log_ts "[maintain] 部署维护页 → $REMOTE:$UAT_MAINT_PAGE"
    scp -q "$UAT_MAINT_SRC" "$REMOTE:$UAT_MAINT_PAGE"
    ssh "$REMOTE" "touch '$UAT_MAINT_FLAG'"
    local code body
    code=$(curl -s -o /dev/null -w '%{http_code}' "$UAT_MAINT_URL" || true)
    body=$(curl -s "$UAT_MAINT_URL" || true)
    if [ "$code" != "503" ] || ! printf '%s' "$body" | grep -q 'System Under Maintenance'; then
        log_fail "[maintain] 验证失败：HTTP=$code（期望 503 且含维护提示）。请人工检查 $UAT_MAINT_URL"
    fi
    log_ok "[maintain] 维护模式已开启 → $UAT_MAINT_URL 返回 503 维护页"
}

maintain_off() {
    log_action "退出 UAT 维护模式..."
    check_ssh
    ssh "$REMOTE" "rm -f '$UAT_MAINT_FLAG'"
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' "$UAT_MAINT_URL" || true)
    if [ "$code" != "200" ]; then
        log_fail "[maintain] 验证失败：HTTP=$code（期望 200）。请人工检查 $UAT_MAINT_URL"
    fi
    log_ok "[maintain] 维护模式已关闭 → $UAT_MAINT_URL 返回 200"
}

maintain_status() {
    check_ssh
    local flag_exists code
    flag_exists=$(ssh "$REMOTE" "test -f '$UAT_MAINT_FLAG' && echo yes || echo no")
    code=$(curl -s -o /dev/null -w '%{http_code}' "$UAT_MAINT_URL" 2>/dev/null || echo "?")
    echo "维护模式: $([ "$flag_exists" = "yes" ] && echo 'ON' || echo 'OFF')"
    echo "UAT URL:  $UAT_MAINT_URL → HTTP $code"
}
```

- [ ] **Step 3: Wire the `maintain` case branch** — in the main `case "${1:-}"` dispatch (add a new arm, e.g. right before the `*)` usage arm):

```bash
    maintain)
        case "${2:-status}" in
            on)     maintain_on ;;
            off)    maintain_off ;;
            status) maintain_status ;;
            *)      echo "用法: $0 maintain [on|off|status]"; exit 1 ;;
        esac
        ;;
```

- [ ] **Step 4: Update `usage()`** — add a line under the existing build/redeploy lines:

```bash
    echo "  $0 maintain [on|off|status]         - UAT 维护模式开关 (on=503维护页, off=恢复, status=状态+HTTP code)"
```

- [ ] **Step 5: Syntax check**

```bash
bash -n /home/yuan.z/rois/rois.sh && echo "rois.sh syntax OK"
```

Expected: `rois.sh syntax OK`.

- [ ] **Step 6: Read-only smoke test** (safe — just reports state; does NOT toggle anything)

```bash
/home/yuan.z/rois/rois.sh maintain status
```

Expected: `维护模式: OFF` and `UAT URL: … → HTTP 200` (gate not yet deployed / no flag; 200 is correct). If this fails, the SSH key or the marker-path assumption is wrong — fix before proceeding.

- [ ] **Step 7: No commit** — `rois.sh` is per-host/untracked by design; do not commit it.

---

### Task 4: Document the maintenance mode (repo — commit)

**Files:**
- Modify: `deploy/nginx/README.md`

**Interfaces:**
- Documents the runtime contract: marker/page paths, toggle command, verification commands.

- [ ] **Step 1: Add a maintenance-mode section** at the end of `deploy/nginx/README.md`:

```markdown
## UAT Gantt 维护模式（maintenance mode）

导数据期间把 UAT Gantt (`/altair/`) 切到维护页，后端代理（/live /rule /engine /ai /pbs/api）
**继续服务**，手工导数据不受影响。

- **gate 位置**: `conf.d/f8-uat.conf` 的 `/altair/` location 内 `if (-f /home/yuan.z/rois/uat/maintenance.flag) { return 503; }`，
  只挡 SPA；`/altair/assets/` 与后端代理不动。
- **维护页**: `maintenance.html`（自包含静态页，固定英文提示 + 每 10s 探测 `/altair/`，gate 解除
  （503→200）自动 reload；可用 `?poll=<ms>` 加快探测）。
- **开关**: `~/rois/rois.sh maintain on|off|status`（`on` 会把 `maintenance.html` scp 到
  `/home/yuan.z/rois/uat/maintenance.html` 并 `touch maintenance.flag`；`off` 删除 flag）。
- **路径约定**: flag 与维护页在 `/home/yuan.z/rois/uat/`（gantt dist 的兄弟目录），
  `rois.sh build gantt` 的 `rm -rf` 不会波及——维护中重部署 gantt 不会静默退出维护。
- **验证**:
  - `curl -s -o /dev/null -w '%{http_code}' https://crew-f8-usva-uat.roiscloud.com/altair/` → `503`
  - `curl -s -o /dev/null -w '%{http_code}' https://crew-f8-usva-uat.roiscloud.com/live/api/health` → `200`（后端不受影响）
```

- [ ] **Step 2: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add deploy/nginx/README.md
git commit -m "docs(nginx): UAT maintenance mode usage

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Deploy to UAT + live verification (runtime — no commit)

**Files:** none (runtime operations only).

**Interfaces:**
- Consumes: Task 1 (maintenance.html), Task 2 (f8-uat.conf gate), Task 3 (rois.sh maintain).
- Produces: verified maintenance mode on real UAT; paste-able curl proof.

- [ ] **Step 1: Push repo commits**

```bash
cd /home/yuan.z/rois/rois-ai
git push origin main
```

- [ ] **Step 2: Apply nginx config on the webserver**

```bash
ssh yuan.z@10.15.12.2 'cd ~/rois/rois-ai && git pull && sudo ./deploy/nginx/deploy-nginx.sh'
```

Expected: `OK — applied + reloaded. Backup: /etc/nginx/.backup/<ts>` (deploy-nginx.sh runs `nginx -t`; on failure it auto-rolls back and exits 1 — do not proceed on failure).

- [ ] **Step 3: Baseline check (no flag yet → normal app)**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://crew-f8-usva-uat.roiscloud.com/altair/
```

Expected: `200`.

- [ ] **Step 4: Turn maintenance ON and prove it**

```bash
/home/yuan.z/rois/rois.sh maintain on
curl -s -o /dev/null -w 'altair HTTP=%{http_code}\n' https://crew-f8-usva-uat.roiscloud.com/altair/
curl -s https://crew-f8-usva-uat.roiscloud.com/altair/ | grep -o 'System Under Maintenance'
```

Expected: `maintain on` prints `维护模式已开启`; `altair HTTP=503`; grep prints `System Under Maintenance`.

- [ ] **Step 5: Prove the backend still serves** (the user needs it for manual data import)

```bash
curl -s -o /dev/null -w 'live/api/health HTTP=%{http_code}\n' https://crew-f8-usva-uat.roiscloud.com/live/api/health
ASSET=$(ssh yuan.z@10.15.12.2 'ls /home/yuan.z/rois/uat/gantt/assets/ | grep -E "\.js$" | head -1')
curl -s -o /dev/null -w "altair/assets HTTP=%{http_code}\n" "https://crew-f8-usva-uat.roiscloud.com/altair/assets/$ASSET"
```

Expected: both `200` (NOT 503). `/live/api/health` proves the backend proxy is unaffected; a real file under `/altair/assets/` proves that location (separate from `/altair/`) still serves.
Note: do **not** use `/altair/favicon.svg` as the asset check — it lives at the dist root inside the gated `/altair/` prefix and correctly returns 503 during maintenance.

- [ ] **Step 6: `maintain status` shows ON**

```bash
/home/yuan.z/rois/rois.sh maintain status
```

Expected: `维护模式: ON` + `→ HTTP 503`.

- [ ] **Step 7: Turn maintenance OFF and prove recovery**

```bash
/home/yuan.z/rois/rois.sh maintain off
curl -s -o /dev/null -w 'altair HTTP=%{http_code}\n' https://crew-f8-usva-uat.roiscloud.com/altair/
```

Expected: `maintain off` prints `维护模式已关闭`; `altair HTTP=200`.

- [ ] **Step 8: Paste all outputs in the completion report** (§No-Illusion: prove it with the real curl results, both on and off).

---

## Self-Review

**Spec coverage:**
- Fixed English message + auto-refresh → Task 1.
- nginx gate on `/altair/` only, backend untouched → Task 2.
- `rois.sh maintain on|off|status` + verification → Task 3.
- Record in local repo (maintenance.html + config + test + README) → Tasks 1, 2, 4.
- Marker/page outside gantt dist → Tasks 2 & 3 path constants.
- Playwright test → Task 1; live curl proof → Task 5.
- Error handling (`check_ssh`, `log_fail` on verify mismatch, nginx -t auto-rollback) → Tasks 3 & 5.

**Placeholders:** none — every step carries full code/commands.

**Type consistency:** `maintenance.html` / `maintenance.flag` paths are identical across the nginx config (Task 2), rois.sh vars (Task 3), README (Task 4), and verification (Task 5). The Playwright test's `?poll=50` matches the page's `?poll=` parsing.
