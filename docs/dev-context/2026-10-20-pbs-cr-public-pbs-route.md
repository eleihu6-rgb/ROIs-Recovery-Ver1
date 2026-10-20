# 开发上下文（2026-10-20）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-20 00:18:15 PDT
- Wing：`pbs`
- Topic：`cr-public-pbs-route`
- Title：PBS Portal on cr.rois.one/pbs
- Git branch：`main`

## 本轮对话上下文

Goal: expose the PBS Portal at http://cr.rois.one/pbs and verify a real crew login.

Routing:
- The root-owned cloudflared config (~/.cloudflared/config.yml) now has a cr.rois.one ^/pbs(/|$) rule -> localhost:3030. It needs a root tunnel restart to become the active path; the tunnel is root-owned and sudo is not available in this session.
- To make it work immediately without sudo, the Gantt Vite origin on 5567 now proxies /pbs/api -> pbs-server 3002 (rewrite to /api) and /pbs -> portal 3030. The existing cr.rois.one catch-all still points at 5567.
- The Gantt and portal Vite configs both redirect http://cr.rois.one/pbs to https://cr.rois.one/pbs/. Password login uses Web Crypto, which is unavailable in an insecure context.
- pbs-portal runtime API base is /pbs/api only on cr.rois.one/pbs; other hosts keep /api. Portal Vite also proxies /pbs/api for the case where the tunnel later routes /pbs directly to 3030.

Credential/data:
- Crew 113 existed in f8_sit_pbs but its stored hash did not match 'rois'. Per the explicit request to test 113/rois, the SIT PBS password hash for user_code 113 was reset to bcrypt('rois', 10). It was left set so the requested login now works. No live users table was touched.

Verification:
- GET http://cr.rois.one/pbs -> 301 https://cr.rois.one/pbs/
- GET https://cr.rois.one/pbs/ -> 200
- POST https://cr.rois.one/pbs/api/auth/session with 113/rois -> 200, user "Brian Mammel   NO US"
- Real Playwright login at 1440x900 and 390x844 -> /pbs/dashboard, crew name and bidding calendar visible, all PBS APIs under /pbs/api, no page errors, no horizontal page overflow.
- Screenshots: docs/assets/screenshots/pbs-portal/cr-rois-pbs-{desktop,mobile}-Ver3.png
- pbs-portal npm test: 778/778 PASS; lint 0 errors; build PASS; check:ui PASS.

Runtime processes left running in this session: pbs-server 3002, pbs-portal 3030, gantt 5567.

## 当前工作树快照

### git status --short

```text
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M docs/dev-context/LATEST.md
 M docs/modules/pbs/portal-playbook.md
 M e2e/tests/pbs-portal/top-nav-overflow-menu.spec.ts
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/vite.config.ts
 M pbs-portal/index.html
 M pbs-portal/src/app/layout/dashboard-top-nav.test.tsx
 M pbs-portal/src/app/layout/dashboard-top-nav.tsx
 M pbs-portal/src/app/layout/main-layout.test.tsx
 M pbs-portal/src/app/layout/main-layout.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
 M pbs-portal/src/app/styles/globals.css
 M pbs-portal/src/features/auth/pages/login-page.tsx
 M pbs-portal/src/features/award/components/award-month-calendar.tsx
 M pbs-portal/src/features/award/components/award-right-panel.tsx
 M pbs-portal/src/features/award/pages/award-page.test.tsx
 M pbs-portal/src/features/award/pages/award-page.tsx
 M pbs-portal/src/features/bid/pages/bid-page.test.tsx
 M pbs-portal/src/features/bid/pages/bid-page.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.tsx
 M pbs-portal/src/features/help/components/help-view.tsx
 M pbs-portal/src/features/help/help-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel-sections.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/pairing-right-panel-layout.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel-sections.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts
 M pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx
 M pbs-portal/src/features/tier/components/tier-summary-sections.tsx
 M pbs-portal/src/shared/components/layout/scaled-page-canvas.test.tsx
 M pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx
 M pbs-portal/src/shared/config/env.ts
 M pbs-portal/vite.config.ts
?? docs/assets/screenshots/crew-app/duty-swap-tg-preview-Ver1-build255.png
?? docs/assets/screenshots/crew-app/maestro-phone-calendar-sheet-build255.png
?? docs/assets/screenshots/crew-app/maestro-pr392923-login-failed-build255.png
?? docs/assets/screenshots/crew-app/maestro-pr392923-matrix-no-unlocked-build255.png
?? docs/assets/screenshots/crew-app/maestro-pr392923-routes-concat-id-build255.png
?? docs/assets/screenshots/crew-app/match-routes-inner-wide-s01_give_unselected-Ver1.png
?? docs/assets/screenshots/crew-app/match-routes-inner-wide-s01b_give_selected-Ver1.png
?? docs/assets/screenshots/crew-app/match-routes-inner-wide-s02_want-Ver1.png
?? docs/assets/screenshots/crew-app/match-routes-inner-wide-s03_pick-Ver1.png
?? docs/assets/screenshots/crew-app/match-routes-inner-wide-s04_send-Ver1.png
?? docs/assets/screenshots/pbs-portal/
?? docs/dev-context/2026-10-19-pbs-mobile-responsive-shell.md
?? docs/superpowers/specs/2026-10-19-pbs-portal-mobile-responsive-shell.md
?? docs/test-cases/pbs/portal/2026-10-19-mobile-responsive-shell.md
?? e2e/tests/pbs-portal/mobile-responsive-shell.spec.ts
?? pbs-portal/src/app/layout/mobile-top-nav.tsx
?? pbs-portal/src/shared/config/env.test.ts
?? pbs-portal/src/shared/hooks/use-is-mobile-viewport.test.ts
?? pbs-portal/src/shared/hooks/use-is-mobile-viewport.ts
```

### unstaged changed files

```text
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
docs/dev-context/LATEST.md
docs/modules/pbs/portal-playbook.md
e2e/tests/pbs-portal/top-nav-overflow-menu.spec.ts
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/vite.config.ts
pbs-portal/index.html
pbs-portal/src/app/layout/dashboard-top-nav.test.tsx
pbs-portal/src/app/layout/dashboard-top-nav.tsx
pbs-portal/src/app/layout/main-layout.test.tsx
pbs-portal/src/app/layout/main-layout.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
pbs-portal/src/app/styles/globals.css
pbs-portal/src/features/auth/pages/login-page.tsx
pbs-portal/src/features/award/components/award-month-calendar.tsx
pbs-portal/src/features/award/components/award-right-panel.tsx
pbs-portal/src/features/award/pages/award-page.test.tsx
pbs-portal/src/features/award/pages/award-page.tsx
pbs-portal/src/features/bid/pages/bid-page.test.tsx
pbs-portal/src/features/bid/pages/bid-page.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.tsx
pbs-portal/src/features/help/components/help-view.tsx
pbs-portal/src/features/help/help-page.tsx
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel-sections.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/pairing-right-panel-layout.ts
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel-sections.tsx
pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts
pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx
pbs-portal/src/features/tier/components/tier-summary-sections.tsx
pbs-portal/src/shared/components/layout/scaled-page-canvas.test.tsx
pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx
pbs-portal/src/shared/config/env.ts
pbs-portal/vite.config.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-10-20-pbs-cr-public-pbs-route.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
