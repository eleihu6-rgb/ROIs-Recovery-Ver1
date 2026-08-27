# PBS Days Off 移除 `pbs_bid_day_off` 运行时依赖设计

## 背景

当前 PBS Days Off 已经确定以 `Prefer Off / pbs_bid_group` 作为业务真相源。左侧日历 Off 是 `Prefer Off` 的快捷编辑器，右侧 Existing 也从同一套 Days Off property draft 展示。

上一轮改造后，新写入路径已经不再把 `pbs_bid_day_off` 作为主表使用，但后端仍保留若干 legacy fallback：

- `calendar-days-off/current`：没有 `Prefer Off` 时回退读取 `pbs_bid_day_off`。
- `bidding-calendar/current`：没有 `Prefer Off` rows 时回退生成旧 day off event。
- `lineholder-summary`：summary 仍读取旧 day off rows。
- `pairing-specific-date`：specific-date pairing 冲突判断仍读取旧 day off rows。
- `tier-sync`：清理 tier 时仍把旧 day off rows 视为 tier 占用来源。
- `calendar-prefer-off-draft`：写入 `Prefer Off` 时会清理当前 bid 的旧 `pbs_bid_day_off` 投影。

由于 PBS 还没有上线，继续保留 legacy fallback 会让后续口径复杂化。此轮目标是彻底移除运行时对 `pbs_bid_day_off` 的依赖，把 Days Off 数据流收敛到 `Prefer Off / pbs_bid_group`。

## 目标

- 运行时不再读取 `pbs_bid_day_off` 作为 Days Off 展示、冲突判断、summary 或 fallback 数据源。
- 运行时不再写入或清理 `pbs_bid_day_off`。
- `Prefer Off / pbs_bid_group` 成为唯一 Days Off 业务数据源。
- 不修改 `sql/` 下已确认建表脚本。
- 不删除 Drizzle model 文件，除非实现中发现已无任何编译引用且删除不会扩大风险；默认保留表模型作为历史结构。
- 不开发 Submit、Award、Reserve。
- 不改变 Line 业务行为。

## 非目标

- 不做历史数据迁移。
- 不删除数据库中的 `pbs_bid_day_off` 表。
- 不调整算法/award 结果数据源。
- 不引入新依赖。
- 不重构与本任务无关的 PBS 模块。

## 设计方案

### 1. Calendar Days Off API

`GET /api/calendar-days-off/current` 只从 `Prefer Off / pbs_bid_group` 派生日历 draft。

- 若当前 bid 不存在，返回空 draft。
- 若当前 bid 存在但没有可解析的 `Prefer Off` 日期，返回空 tiers。
- 不再 fallback 到 `pbs_bid_day_off`。

`PUT /api/calendar-days-off/current` 和 `PATCH /api/calendar-days-off/current/dates` 继续写 `Prefer Off / pbs_bid_group`。

- 不再清理 `pbs_bid_day_off`。
- patch 的增删判断以当前 `Prefer Off` 派生结果为基准。

### 2. Bidding Calendar

`GET /api/bidding-calendar/current` 的 day off event 只由 `Prefer Off / pbs_bid_group` 派生。

- 没有 `Prefer Off` 日期时，不展示 day off bid events。
- `day_off_bid.source` 使用 `pbs_bid_group`。
- 移除 legacy `pbs_bid_day_off` event 构造路径。

### 3. Pairing Specific-Date 冲突判断

Specific-date pairing 与 Days Off 的冲突判断改为基于 `Prefer Off` 派生的 `DayOffDatesByTier`。

- 保持现有冲突规则不变。
- 仅替换数据来源。
- 避免 N+1：按 bid 一次性加载 `Prefer Off` rows，在内存中展开日期集合。

### 4. Lineholder Summary

Summary 中 Days Off 的日历 Off 项改为从 `Prefer Off` 派生。

- `Prefer Off` 本身仍会作为 Days Off bid property 出现在 rule/group summary 中。
- 如需额外保留 Calendar 类型 summary item，应由 `Prefer Off` 派生，而不是旧表。
- 不再读取 `pbs_bid_day_off`。

### 5. Tier Sync

`syncBidTiers` 和 `syncBidTiersByBidId` 不再把 `pbs_bid_day_off` 视为 tier 占用来源。

- tier 是否保留只看 `pbs_bid_group`。
- 因为 Days Off 真相源已经在 `pbs_bid_group`，不会丢失有效 tier。

### 6. Contract 与前端兼容

前端运行时不应再收到 `source: "pbs_bid_day_off"` 的新 day off event。

- 如果 `packages/contracts` 的 source union 中仍保留 `"pbs_bid_day_off"`，它只作为历史兼容类型存在。
- 测试数据和 mapper 测试应改成 `source: "pbs_bid_group"`，避免继续暗示旧表可用。
- 若删除该 union 会导致改动范围过大，可先保留类型但移除运行时路径。

## 性能要求

- 接口响应目标仍为 2s 内。
- 禁止为每个 tier/date 单独查询。
- `Prefer Off` rows 通过一次查询批量加载，再用纯函数展开日期范围和 tier/date map。
- 当前实现已有 `prefer-off-calendar-events.ts` 可复用，不新增重复解析逻辑。

## 验收标准

- `rg "pbsBidDayOff|pbs_bid_day_off" pbs-server pbs-portal packages -n` 中不再出现运行时业务读写路径。
- `calendar-days-off/current` 没有 `Prefer Off` 时返回空 Days Off draft，而不是旧表数据。
- `bidding-calendar/current` 没有 `Prefer Off` 时不展示旧表 Off event。
- Pairing specific-date 冲突判断仍能识别与 `Prefer Off` 日期冲突。
- Summary 不再从旧表构建 Days Off calendar summary。
- Line 页面回归测试通过。
- Days Off 页面和共享日历回归测试通过。
- 后端 calendar / pairing / summary 相关测试通过。
- 前后端 build 通过。

## 测试计划

后端：

```bash
pnpm --dir pbs-server test -- calendar-prefer-off-draft.test.ts prefer-off-calendar-events.test.ts calendar-days-off.test.ts bidding-calendar.test.ts pairing-specific-date.test.ts lineholder-summary-service.test.ts
pnpm --dir pbs-server build
```

前端：

```bash
pnpm --dir pbs-portal test -- shared-bidding-workbench-layout.test.tsx days-off-page.test.tsx line-page.test.tsx
pnpm --dir pbs-portal build
```

## 实施记录

状态：已实施。

- `calendar-days-off/current` 已移除旧表 fallback，没有 `Prefer Off` 时返回空 draft。
- `bidding-calendar/current` 已移除旧表 day off event 构造，只从 `Prefer Off / pbs_bid_group` 派生 Off event。
- Pairing specific-date Days Off 冲突判断已改为读取 `Prefer Off` 派生日期集合。
- Lineholder summary 不再读取 `pbs_bid_day_off`。
- Tier sync 不再把 `pbs_bid_day_off` 作为 tier 占用来源。
- `packages/contracts/pbs-bidding-calendar.d.ts` 已移除 `"pbs_bid_day_off"` event source。
- `rg "pbs_bid_day_off" pbs-server/src pbs-portal/src packages/contracts -n` 当前只剩 Drizzle model 文件中的历史表定义。

已验证：

```bash
pnpm --dir pbs-server test -- calendar-prefer-off-draft.test.ts prefer-off-calendar-events.test.ts calendar-days-off.test.ts bidding-calendar.test.ts lineholder-summary-service.test.ts lineholder-summary.test.ts
pnpm --dir pbs-server build
pnpm --dir pbs-portal test -- shared-bidding-workbench-layout.test.tsx days-off-page.test.tsx line-page.test.tsx dashboard-calendar-state.test.ts bidding-calendar-mappers.test.ts dashboard-page.test.tsx
pnpm --dir pbs-portal lint -- src/features/dashboard/bidding-calendar-mappers.ts src/features/dashboard/bidding-calendar-mappers.test.ts src/features/dashboard/dashboard-calendar-state.test.ts src/features/dashboard/pages/dashboard-page.test.tsx src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pnpm --dir pbs-portal build
```

## 风险与处理

- 风险：旧测试数据仍使用 `source: "pbs_bid_day_off"`，导致测试意图和新口径不一致。
  - 处理：测试数据统一改为 `pbs_bid_group`，必要时保留 contract 类型但不使用。
- 风险：summary 同时展示 `Prefer Off` property 和派生 Calendar Off item，造成重复理解。
  - 处理：实现时检查现有 summary 展示逻辑，避免重复生成同义 item。
- 风险：Pairing conflict 如果只看旧表会漏拦。
  - 处理：冲突数据源统一切到 `Prefer Off` 派生 map，并增加/调整测试。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是同一条 Days Off 数据流的收口，虽然涉及多处引用，但核心 contract 和数据来源耦合紧，单 agent 顺引用链改更稳。
- Suggested split: 不拆。
- Write boundaries: `pbs-server` calendar / pairing / summary / tier-sync，必要时同步 `pbs-portal` 测试与 `packages/contracts` 类型。
- Conflict risk: 中等，主要风险在 Pairing conflict 与 summary 语义。
- Execution gate: 用户确认本文档后再进入实现。
