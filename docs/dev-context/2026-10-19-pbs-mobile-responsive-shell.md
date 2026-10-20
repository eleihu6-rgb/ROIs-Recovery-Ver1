# 开发上下文（2026-10-19）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-19 21:56:15 PDT
- Wing：`pbs`
- Topic：`mobile-responsive-shell`
- Title：PBS Portal phone responsive shell
- Git branch：`main`

## 本轮对话上下文

Scope: PBS Portal phone responsive layout (below Tailwind md / 768px).

Key decisions:
- The desktop 1888x968 ScaledPageCanvas stays authoritative at >=768px.
- Added useIsMobileViewport and a natural-flow mobile branch in ScaledPageCanvas with --portal-page-shell-height:auto.
- Replaced the scaled desktop header with MobileTopNav (compact header + right-side nav drawer) on phones.
- MainLayout on phones uses a flex column with a scrolling main area and safe-area bottom padding.
- Dashboard stacks calendar -> profile -> pre-assigned duties.
- Shared bidding workbench stacks the body under a collapsed-by-default phone calendar toggle; the shared query/store state is unchanged.
- Award and Help stack; Award summary cards use two columns and roster tables scroll inside their card.
- Dense RuleBid/Pairing row layouts switch to a one-column stacked card (rowGap 10) below 768px; headers hide on phones.
- Login form becomes fluid (max 560px) with reduced padding on phones.

Verification:
- pbs-portal npm test: 775/775 PASS.
- pbs-portal npm run lint: 0 errors (27 pre-existing warnings).
- pbs-portal npm run build: PASS.
- root npm run check:ui: PASS, 0 hard violations.
- Playwright e2e/tests/pbs-portal/mobile-responsive-shell.spec.ts: 4/4 PASS at 390x844 (login, award+drawer+logout cancel, bid workbench toggle, dashboard stacking).
- Screenshots: docs/assets/screenshots/pbs-portal/mobile-responsive-{login,award,help,bid,dashboard}-Ver1.png.
- Existing mocked Playwright suites portal-smoke + award-adaptive-layout: 10/10 PASS.
- Real-backend portal-navigation/top-nav e2e could not authenticate with available demo accounts (401 from SIT), so those remain environment-blocked.

## 当前工作树快照

### git status --short

```text
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M e2e/tests/pbs-portal/top-nav-overflow-menu.spec.ts
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
?? docs/superpowers/specs/2026-10-19-pbs-portal-mobile-responsive-shell.md
?? docs/test-cases/pbs/portal/2026-10-19-mobile-responsive-shell.md
?? e2e/tests/pbs-portal/mobile-responsive-shell.spec.ts
?? pbs-portal/src/app/layout/mobile-top-nav.tsx
?? pbs-portal/src/shared/hooks/use-is-mobile-viewport.test.ts
?? pbs-portal/src/shared/hooks/use-is-mobile-viewport.ts
```

### unstaged changed files

```text
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
e2e/tests/pbs-portal/top-nav-overflow-menu.spec.ts
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
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-10-19-pbs-mobile-responsive-shell.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
