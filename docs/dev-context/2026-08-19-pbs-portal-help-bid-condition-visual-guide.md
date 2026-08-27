# 开发上下文（2026-08-19）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-08-19 10:21:50 CST
- Wing：`pbs`
- Topic：`portal-help-bid-condition-visual-guide`
- Title：portal-help-bid-condition-visual-guide
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Portal Help bid condition visual guide 的实现收尾：
- 已按 spec 将 Help Bid Conditions 拆成 All / Days Off / Pairing / Roster & Line / Reserve / Standing Bid 相关主题。
- 新增 bid-conditions Help topic 数据与渲染组件，当前覆盖 19 个可见 bid condition，映射 37 个 visible catalog contexts。
- 每个条件都有独立真实弹窗截图、Where to open it / How to configure it / Example / After saving / Watch out 说明。
- Pairing 与 Days Off 左侧日历入口也有独立入口截图。
- 更新截图采集脚本和 mock 数据，截图脚本当前生成 28 张，0 skipped。
- 已清理旧的未引用浅层截图，只保留当前 Help 实际引用的入口图和 bid-condition-* dialog 图。
- 更新 Help E2E 覆盖：新增 help-content-bid-conditions.spec.ts，并修正 help-image-preview 缩放测试不再绑定具体图片尺寸。
- 验证结果：截图采集 28/0；Help Playwright 18/18 PASS；npm run check:ui PASS（0 hard violations）；pnpm --dir pbs-portal build PASS；git diff --check PASS；GitNexus detect-changes risk low。

## 当前工作树快照

### git status --short

```text
 M docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md
 M e2e/scripts/capture-pbs-portal-help-screenshots.ts
 M e2e/scripts/pbs-portal-help-screenshot-mocks.ts
 M e2e/tests/pbs-portal/help/help-content-safety.spec.ts
 M e2e/tests/pbs-portal/help/help-image-preview.spec.ts
 M e2e/tests/pbs-portal/help/help-navigation.spec.ts
 M e2e/tests/pbs-portal/help/help-test-utils.ts
 M pbs-portal/public/help/screenshots/award-overview.png
 M pbs-portal/public/help/screenshots/reserve-overview.png
 M pbs-portal/public/help/screenshots/standing-bid-overview.png
 M pbs-portal/src/features/help/components/help-home.tsx
 M pbs-portal/src/features/help/components/help-nav.tsx
 M pbs-portal/src/features/help/components/help-view.tsx
 M pbs-portal/src/features/help/help-data.ts
 M pbs-portal/src/features/help/topics/pairing/pairing-configure.tsx
?? docs/superpowers/specs/2026-08-18-pbs-portal-help-bid-condition-reference-design.md
?? docs/superpowers/specs/2026-08-19-pbs-portal-help-bid-condition-visual-guide-design.md
?? e2e/tests/pbs-portal/help/help-content-bid-conditions.spec.ts
?? pbs-portal/public/help/screenshots/bid-condition-airport-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-check-in-check-out-time-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-commuter-pattern-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-credit-window-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-deadhead-flying-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-efficient-flying-first-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-flight-legs-per-duty-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-flight-number-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-long-stretch-off-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-minimum-base-layover-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-mixed-line-bid-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-month-end-carryover-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-pairing-length-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-pairing-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-prefer-off-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-redeye-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-reserve-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-time-between-flights-dialog.png
?? pbs-portal/public/help/screenshots/bid-condition-work-day-preference-dialog.png
?? pbs-portal/public/help/screenshots/bid-conditions-days-off-calendar-entry.png
?? pbs-portal/public/help/screenshots/bid-conditions-entry.png
?? pbs-portal/public/help/screenshots/bid-conditions-pairing-calendar-entry.png
?? pbs-portal/src/features/help/topics/bid-conditions/
```

### unstaged changed files

```text
docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md
e2e/scripts/capture-pbs-portal-help-screenshots.ts
e2e/scripts/pbs-portal-help-screenshot-mocks.ts
e2e/tests/pbs-portal/help/help-content-safety.spec.ts
e2e/tests/pbs-portal/help/help-image-preview.spec.ts
e2e/tests/pbs-portal/help/help-navigation.spec.ts
e2e/tests/pbs-portal/help/help-test-utils.ts
pbs-portal/public/help/screenshots/award-overview.png
pbs-portal/public/help/screenshots/reserve-overview.png
pbs-portal/public/help/screenshots/standing-bid-overview.png
pbs-portal/src/features/help/components/help-home.tsx
pbs-portal/src/features/help/components/help-nav.tsx
pbs-portal/src/features/help/components/help-view.tsx
pbs-portal/src/features/help/help-data.ts
pbs-portal/src/features/help/topics/pairing/pairing-configure.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-08-19-pbs-portal-help-bid-condition-visual-guide.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
