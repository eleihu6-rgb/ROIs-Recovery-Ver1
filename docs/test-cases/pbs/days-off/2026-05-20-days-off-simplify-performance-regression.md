# PBS Days Off 简化重构与性能回归测试

日期：2026-05-20
范围：PBS Portal Days Off 页面、左侧共享 `BIDDING CALENDAR`、Days Off `Prefer Off` 轻量 mutation、Pairing/Dashboard 共享日历展示。

## 目标

- 验证 Days Off 新增 / 编辑 / 删除，以及左侧小日历新增 / 删除 Off 的关键接口正常场景 `< 2s`。
- 验证左侧共享日历仍只基于 Days Off `Prefer Off` 规则生成 Off，不回到旧 `calendar-days-off` 数据源。
- 验证保存后通过本地 cache patch 更新 Days Off page data，不再无意义 refetch `GET /api/days-off-bids/current`。
- 验证连续 Off 在共享小日历中仍合并为一条横条。
- 验证错误提示仍走统一 message / toast，不在右侧 panel 额外渲染重复红色错误块。

## 自动化覆盖

### 前端

- `pbs-portal/src/features/days-off/days-off-calendar-mutation.test.ts`
  - unchanged calendar-managed `Prefer Off` 不调用 mutation。
  - 已有 `Prefer Off` 只通过轻量 patch 更新 tier/date。
  - target grouping 缩小时删除多余 calendar-managed `Prefer Off` property。

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
  - Days Off route 才允许左侧小日历编辑。
  - 左侧小日历保存后立即 patch query cache。
  - 保存后不 refetch Days Off page data，避免重复 `current` 请求链。
  - 右侧 Existing Days Off property 编辑产生更新版本后，左侧小日历必须丢弃旧本地 overlay，立刻使用新的 Days Off page data。
  - Pairing 占用的 tier/date 被跳过或禁用。
  - weekday 批量添加仍跳过 blocked tier/date。
  - 保存失败只显示 message，不出现 panel 内 `role="alert"` 重复错误块。

- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts`
  - 连续逐日 `prefer_off_bid` 合并成一条 Off bar。
  - 重叠 `prefer_off_bid` 在视觉层去重。
  - 周边界处正确拆分横条。

- `pbs-portal/src/shared/services/days-off-service.test.ts`
  - `POST / PUT / DELETE` payload 保持轻量。
  - mutation 必须携带稳定 draft identity：`draftKey`、`bidId`、`periodCode`、`draftVersion`。
  - 不发送 `name`、`suggestions`、`property` 整对象和整份 draft。

### 后端

- `pbs-server/src/services/calendar/prefer-off-calendar-events.test.ts`
  - `Prefer Off` 单日、逗号日期、date range 能生成 `prefer_off_bid`。
  - 按 `tier + date` 去重，避免不同页面日历展示不一致。

- `pbs-server/src/services/days-off/days-off-validation.test.ts`
  - 同 Tx / 跨 Tx 的 `Prefer Off` 重叠不硬拦截。
  - 反向日期区间仍作为硬校验失败。

## 手工回归用例

### 1. Days Off 页面新增 Prefer Off

1. 打开 `/fpqe/pbs/days-off`。
2. 点击 `ADD DAYS OFF PROPERTIES` 中 `Prefer Off`。
3. 选择日期和 Tx，保存。
4. 预期：
   - Network 只出现轻量 `POST /api/days-off-bids/current/properties`。
   - payload 包含 `draftKey`、`bidId`、`periodCode`、`draftVersion`。
   - payload 不包含 `name`、`suggestions`、`property` 整对象、`bidContext` 等 UI-only 字段。
   - 正常本地环境关键 mutation `< 2s`。
   - 页面不出现重复红色错误 panel。

### 2. Days Off 页面编辑 / 删除 Prefer Off

1. 编辑已有 `Prefer Off` 日期或 Tx。
2. 删除已有 `Prefer Off`。
3. 预期：
   - 编辑使用 `PUT /api/days-off-bids/current/properties/:propertyGroupKey`。
   - 编辑 payload 包含 `draftKey`、`bidId`、`periodCode`、`draftVersion`，不发送整份 property。
   - 删除使用 `DELETE /api/days-off-bids/current/properties/:propertyGroupKey?draftKey=...&bidId=...&periodCode=...&draftVersion=...`。
   - 正常本地环境关键 mutation `< 2s`。
   - 保存后不额外 refetch `GET /api/days-off-bids/current`。

### 3. 左侧共享小日历新增 / 删除 Off

1. 在 `/fpqe/pbs/days-off` 左侧小日历点击一个日期。
2. 调整 Tx 勾选并保存。
3. 再点击已有 Off 日期，取消目标 Tx 并保存。
4. 预期：
   - 保存走 Days Off `Prefer Off` 轻量 mutation，不调用旧 `/api/calendar-days-off/*`。
   - 保存后左侧小日历立即更新。
   - `GET /api/bidding-calendar/current` 可后台刷新，但不触发重复 Days Off page data refetch。
   - 正常本地环境关键 mutation 和必要刷新 `< 2s`。

### 4. Days Off / Pairing / Dashboard 强刷一致性

1. 在 Days Off 页面保存连续日期，例如 `2026-04-19` 至 `2026-04-22`。
2. 强制刷新 `/fpqe/pbs/days-off`。
3. 强制刷新 `/fpqe/pbs/pairing`。
4. 强制刷新 `/fpqe/pbs/dashboard`。
5. 预期：
   - 三个页面左侧小日历 Off 来源一致。
   - 连续 Off 在同一周内显示为一条横条，中间不分裂。
   - Network 中不出现 `/api/calendar-days-off/current` 或 `/api/calendar-days-off/current/dates`。

### 5. Pairing 与 Days Off 冲突保护

1. 在已有 Pairing bid 覆盖的日期上尝试新增 Off。
2. 预期：
   - 单日操作中被 Pairing 覆盖的 tier 禁用。
   - weekday 批量操作时，只跳过 blocked tier/date，未 blocked 的日期仍可保存。
   - 提示使用 message / warning，不出现重复 panel 错误。

## 本次执行命令

实施后至少执行：

```bash
pnpm --dir pbs-portal exec vitest run src/features/days-off/days-off-calendar-mutation.test.ts
pnpm --dir pbs-portal exec vitest run src/app/layout/shared-bidding-workbench-layout.test.tsx
pnpm --dir pbs-portal exec vitest run src/features/dashboard/bidding-calendar-mappers.test.ts src/features/dashboard/dashboard-calendar-state.test.ts
pnpm --dir pbs-portal exec vitest run src/shared/services/days-off-service.test.ts src/features/days-off/days-off-validation.test.ts src/features/days-off/pages/days-off-page.test.tsx
pnpm --dir pbs-server test -- prefer-off-calendar-events.test.ts days-off-validation.test.ts bidding-calendar-service.test.ts
pnpm --dir pbs-portal lint
pnpm --dir pbs-portal build
pnpm --dir pbs-server build
git diff --check
```

本次实际已执行并通过：

```bash
pnpm --dir pbs-portal exec vitest run
pnpm --dir pbs-portal lint
pnpm --dir pbs-portal build
pnpm --dir pbs-server test
pnpm --dir pbs-server build
git diff --check
```

执行结果：

- `pbs-portal` Vitest：50 files / 318 tests passed。
- `pbs-portal` lint：passed。
- `pbs-portal` build：passed；仅保留既有 `index` chunk size warning。
- `pbs-server` test：190 tests passed。
- `pbs-server` build：passed。
- `git diff --check`：passed。

## 性能记录模板

| 场景 | 接口 | 耗时 | 预期 | 结果 |
|------|------|------|------|------|
| Days Off 新增 property | `POST /api/days-off-bids/current/properties` | 待记录 | `< 2s` | 待记录 |
| Days Off 编辑 property | `PUT /api/days-off-bids/current/properties/:key` | 待记录 | `< 2s` | 待记录 |
| Days Off 删除 property | `DELETE /api/days-off-bids/current/properties/:key` | 待记录 | `< 2s` | 待记录 |
| 左侧日历新增 Off | Days Off lightweight mutation + necessary calendar refresh | 待记录 | `< 2s` | 待记录 |
| 左侧日历删除 Off | Days Off lightweight mutation + necessary calendar refresh | 待记录 | `< 2s` | 待记录 |
