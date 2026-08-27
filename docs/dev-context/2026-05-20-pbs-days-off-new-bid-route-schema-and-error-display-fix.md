# 开发上下文（2026-05-20）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-20 14:01:07 CST
- Wing：`pbs`
- Topic：`days-off-new-bid-route-schema-and-error-display-fix`
- Title：days-off-new-bid-route-schema-and-error-display-fix
- Git branch：`main`

## 本轮对话上下文

本轮修复 PBS Days Off 新 bid 类型在 route schema 层被拒的问题，以及 API mutation 错误提示重复展示的问题。

用户指出 205 Days Off / Days On Pattern 新增时，请求 POST /api/days-off-bids/current/properties 返回 400：Invalid days off property payload，并质疑为什么已有测试没有发现。根因确认：pbs-server/src/routes/lineholder-route-utils.ts 的 ruleBidValueSchema 没有同步新增 stepper-date-range、days-off-on-pattern、crew-days-off-share，导致请求在 route Zod schema 阶段被拦截；此前测试主要覆盖 service 层和前端 mock，缺少真实 route payload schema 测试，所以没有抓到。

已实施：
1. pbs-server/src/routes/lineholder-route-utils.ts 增加 stepper-date-range、days-off-on-pattern、crew-days-off-share 三类 bid schema。
2. pbs-server/src/routes/days-off-bids.test.ts 增加 POST /api/days-off-bids/current/properties route 级测试，覆盖 204/205/206 结构化 bid payload，避免以后 route schema 漏同步。
3. pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx 调整 add/update/merge mutation 失败处理：API 错误只走 message.error(getRuleBidSaveErrorMessage(error))，不再写入 saveErrorMessage，因此右侧面板不再额外渲染 role="alert" 红色错误块；表单校验类错误仍保留面板提示。
4. pbs-portal/src/features/days-off/pages/days-off-page.test.tsx 增加回归测试，模拟 add API 失败，断言 message 层显示服务端错误且 screen.queryByRole("alert") 不存在。
5. docs/superpowers/specs/2026-05-20-pbs-days-off-new-bid-route-schema-and-error-display-fix.md 已更新为“已确认并实施”，包含实施记录和验证记录。

保留结论：请求中的 draftKey、bidId、periodCode、bidContext、draftVersion 是 current draft 定位和版本控制字段，不是 400 根因，本轮不移除。205 的字段语义、UI 文案、保存映射也不在本轮改。

验证结果：
- pnpm --dir pbs-server test -- routes/days-off-bids.test.ts days-off/days-off-validation.test.ts lineholder/rule-bid-value.test.ts：通过，实际执行 195 个测试。
- pnpm --dir pbs-portal test -- days-off-page.test.tsx pairing-bid-control.test.tsx：通过，实际执行 302 个测试。
- pnpm --dir pbs-portal lint -- src/features/rule-bids/components/rule-bid-right-panel.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/pairing/components/pairing-bid-control.tsx：通过。
- pnpm --dir pbs-server build：通过。
- pnpm --dir pbs-portal exec tsc --noEmit --pretty false：通过。
- pnpm --dir pbs-portal build：通过；Vite 仍有既有 chunk size warning。
- git diff --check：通过。

注意：pbs-portal build 会改动 pbs-portal/tsconfig.tsbuildinfo，这次已经只还原该构建缓存文件。工作树里仍有本轮之前 204/205/206 相关未提交改动和文档，不要误认为全部都是本次 bugfix 新增。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/services/days-off/days-off-validation.test.ts
 M pbs-server/src/services/days-off/days-off-validation.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
 M sql/seed/10-pbs-bid-property.sql
?? docs/dev-context/2026-05-20-pbs-days-off-pattern-fields.md
?? docs/dev-context/2026-05-20-pbs-days-off-pattern-ui-clarity.md
?? docs/superpowers/specs/2026-05-20-pbs-days-off-new-bid-route-schema-and-error-display-fix.md
?? docs/superpowers/specs/2026-05-20-pbs-days-off-pattern-fields-design.md
?? docs/superpowers/specs/2026-05-20-pbs-days-off-pattern-ui-clarity-design.md
?? docs/test-cases/pbs-portal/days-off-pattern-fields.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/utils.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/services/days-off/days-off-validation.test.ts
pbs-server/src/services/days-off/days-off-validation.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-20-pbs-days-off-new-bid-route-schema-and-error-display-fix.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
