# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 11:22:47 CST
- Wing：`pbs`
- Topic：`pairing-search-v2`
- Title：PBS Search Pairings v2 与条件区按钮状态
- Git branch：`main`

## 本轮对话上下文

本轮继续完善 PBS Pairing / Search Pairings 相关页面，重点是 Search Pairings v2、多条件搜索、写入 draft、criteria 操作按钮布局和按钮状态。

一、已完成的 Search Pairings v2 关键能力

- `/pairing/search` 页面头部右侧新增 Back，返回 Pairing workbench。
- `ADD MORE SEARCH CRITERIA` 不再作为返回按钮，而是在搜索页内打开 criteria picker，向当前搜索条件列表追加条件。
- `BID THESE PROPERTIES` 在搜索页内打开 Layer 选择弹窗，确认后把当前搜索条件写入 Current Pairing draft。
- current-rules-preview 模式只用于查看已有规则搜索结果，不显示 `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA`，避免误导用户可以把已有规则再次写入 draft。
- 新增 `Pairing ID` / Specific Bid 第一版，复用 `property_code=128`，使用 tag-list bid 条件。
- ad-hoc 多条件搜索使用 `mode: "criteria"`，后端按临时规则表达式执行：默认 AND；AA/N-PBS forced OR 特例走 OR；同 Layer 完全相同条件禁止；同 Layer single-use 属性重复禁止。

二、前后端与契约改动

- `packages/contracts/pbs-pairing-bids.js`：增加 Pairing ID catalog / usage，并补齐 pairing search 会用到的 property 配置。
- `packages/contracts/pbs-search-pairings.d.ts`：增加 criteria request 与 `criteria_preview` response 类型。
- `pbs-server/src/routes/pairing-search.ts`：增加 criteria payload Zod 校验。
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`：增加 criteria preview 分支、Pairing ID SQL 条件，并补齐 133 Duty Period、137 Pairing Type、138 TAFB-Credit Ratio 等 current rules preview 会用到的条件。
- `pbs-server/src/routes/pairing-search.test.ts`：覆盖 criteria preview、Pairing ID、current rules preview 等行为。
- `sql/migration/2026-04-28-add-pbs-pairing-id-property.sql`：upsert `property_code=128`。
- `pbs-portal/src/shared/services/pairing-service.ts`：增加 `previewCriteria`。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`：维护 criteria list、criteria picker、Layer dialog、批量写入 draft 和 message 反馈。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`：渲染 Back、criteria list、criteria picker、Layer dialog、current-rules-preview、Search Criteria 标题区操作按钮。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`：实现搜索页布局、criteria picker、标题区按钮样式和按钮状态。

三、最新 UI 决策：Search Criteria 标题区按钮

用户确认两个操作按钮语义属于 `SEARCH CRITERIA` 模块，而不是 `SEARCH RESULTS`：

- `BID THESE PROPERTIES` 和 `ADD MORE SEARCH CRITERIA` 已从 `SEARCH RESULTS` 结果统计行移到 `SEARCH CRITERIA` 标题行右侧。
- `SEARCH RESULTS` 区域只保留结果标题、结果统计、刷新/错误提示和结果列表。
- 两个按钮都必须有边框，使用同一套 compact outline button 结构，避免一个像 primary outline、一个像 ghost 的割裂感。
- 最新按钮状态定义：
  - 默认态：两个按钮都使用白底、深灰文字、浅灰边框。
  - 选中态：白底、紫色文字、紫色边框。
  - `BID THESE PROPERTIES` 默认不再固定紫色；只有 hover / focus / active 时进入选中态。
  - `ADD MORE SEARCH CRITERIA` 在 criteria picker 展开时进入同样的选中态，picker 关闭后恢复默认态。
  - 这个“选中态”就是之前 `BID THESE PROPERTIES` 按钮的视觉样子；不要再使用浅紫底作为选中态。

四、相关 spec / context 文档

- `docs/superpowers/specs/2026-04-27-pbs-search-pairings-current-rules-preview-design.md`
- `docs/superpowers/specs/2026-04-28-pbs-search-pairings-v2-design.md`
- `docs/superpowers/specs/2026-04-28-pbs-search-criteria-actions-layout-design.md`
- `docs/dev-context/2026-04-28-pbs-pairing-search-v2.md`
- `docs/dev-context/LATEST.md`

五、已验证结果

- `pbs-server`：`npm run build` passed。
- `pbs-server`：`npm test -- src/routes/pairing-search.test.ts` passed；该脚本实际执行 `src/**/*.test.ts` 和指定文件，共 30 tests。
- `pbs-portal`：`npm test` passed：30 files / 123 tests。
- `pbs-portal`：`npx vitest run src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/pages/pairing-page.test.tsx` passed：2 files / 40 tests。
- `pbs-portal`：`npm run lint` passed。
- `pbs-portal`：`npm run build` passed；只有 Vite chunk size warning。

六、注意事项与后续不要重复推翻的结论

- 本轮没有实现 Day Off / Planned Absence conflict。
- `Pairing ID on Date`、`Pairing ID for Entire Month`、Layer page `View Pairing Set` 仍留后续。
- Search picker 只暴露当前后端支持的 property code 加 128，避免用户选到必然 422 的条件。
- `BID THESE PROPERTIES` / `ADD MORE SEARCH CRITERIA` 的位置和状态已经按用户最新语义确定：位于 `SEARCH CRITERIA` 标题区；默认统一中性 outline；选中态统一为白底紫色 outline。
- 工作树中存在 staged 与 unstaged 混合状态；后续继续前先运行 `git status --short`，不要回滚用户或之前已完成的改动。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
A  docs/superpowers/specs/2026-04-27-pbs-search-pairings-current-rules-preview-design.md
A  docs/superpowers/specs/2026-04-28-pbs-search-pairings-v2-design.md
M  packages/contracts/pbs-pairing-bids.js
M  packages/contracts/pbs-search-pairings.d.ts
M  pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
MM pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
MM pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
M  pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
MM pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
MM pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
M  pbs-portal/src/features/pairing/types.ts
M  pbs-portal/src/shared/i18n/locales/en.ts
M  pbs-portal/src/shared/services/pairing-service.ts
M  pbs-server/src/app.ts
M  pbs-server/src/routes/pairing-search.test.ts
M  pbs-server/src/routes/pairing-search.ts
MM pbs-server/src/services/pairing-search/pairing-search-service.ts
M  pbs-server/src/services/pairing-search/types.ts
A  sql/migration/2026-04-28-add-pbs-pairing-id-property.sql
?? docs/dev-context/2026-04-28-pbs-pairing-search-v2.md
?? docs/superpowers/specs/2026-04-28-pbs-search-criteria-actions-layout-design.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-server/src/services/pairing-search/pairing-search-service.ts
```

### staged files

```text
docs/superpowers/specs/2026-04-27-pbs-search-pairings-current-rules-preview-design.md
docs/superpowers/specs/2026-04-28-pbs-search-pairings-v2-design.md
packages/contracts/pbs-pairing-bids.js
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
sql/migration/2026-04-28-add-pbs-pairing-id-property.sql
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-28-pbs-pairing-search-v2.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
