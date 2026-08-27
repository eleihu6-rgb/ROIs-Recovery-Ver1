# PBS Calendar Days Off API 兼容降级设计

日期：2026-05-19  
状态：已实施  
范围：旧 `calendar-days-off` API 的读写路径兼容降级；不涉及 Submit、Award、Reserve、不删除旧表、不做生产迁移

## 背景

当前 Days Off 单一真相源已经推进到两个关键位置：

1. 前端 `/days-off` 左侧日历快捷编辑已改为写 `Prefer Off(propertyCode=201)`。
2. 后端 `GET /api/bidding-calendar/current` 已优先从 `pbs_bid_group / Prefer Off` 派生 `day_off_bid` events。

但旧 `calendar-days-off` API 仍存在：

- `GET /api/calendar-days-off/current`
- `PUT /api/calendar-days-off/current`
- `PATCH /api/calendar-days-off/current/dates`

这些接口目前仍然读写 `pbs_bid_day_off`。如果继续保留这种写路径，后续任何旧调用方都可能重新制造第二真相源。

## 目标

1. 旧 `calendar-days-off` API 保持可用，避免破坏现有调用方。
2. 旧 API 的主读写路径改为 `Prefer Off / pbs_bid_group`。
3. `pbs_bid_day_off` 只作为 legacy fallback / projection，不再作为主写表。
4. 接口响应结构保持 `PbsCalendarDaysOffCurrentResponse` / patch response 兼容。
5. 接口响应保持 2 秒内，避免 N+1 查询。

## 不做范围

- 不删除 `pbs_bid_day_off` 表。
- 不做生产历史数据迁移。
- 不新增前端功能。
- 不改 Submit / Award / Reserve。
- 不改 Days Off 右侧 Existing UI。
- 不引入新的复杂 API。

## 推荐方案

旧 `calendar-days-off` API 内部转写 `Prefer Off`。

### GET

`GET /api/calendar-days-off/current`：

1. 读取当前 bid。
2. 优先从 `pbs_bid_group` 中 Days Off `Prefer Off(propertyCode=201)` 派生 calendar draft。
3. 如果没有 Prefer Off，再 fallback 旧 `pbs_bid_day_off`。
4. 返回原结构：

```text
draft.tiers = [{ tier: "T1", dates: [...] }]
```

### PATCH

`PATCH /api/calendar-days-off/current/dates`：

1. 接收旧 changes payload。
2. 读取当前 `Prefer Off` 派生的 calendar draft。
3. 应用 selected true/false changes。
4. 将结果转换为 `Prefer Off` property rows：
   - 相同 tier 集合合并一条 Prefer Off。
   - 不同 tier 集合拆分多条 Prefer Off。
5. 在事务内替换当前 calendar-managed Prefer Off rows。
6. 返回原 patch response 格式。

### PUT

`PUT /api/calendar-days-off/current`：

1. 接收完整 calendar draft。
2. 转换为 `Prefer Off` property rows。
3. 替换当前 calendar-managed Prefer Off rows。
4. 返回原 current draft response。

## 模块边界

建议复用/扩展已有后端 helper：

| 文件 | 职责 |
|------|------|
| `prefer-off-calendar-events.ts` | Prefer Off rows -> dates/events |
| 新增 `calendar-prefer-off-draft.ts` 或类似文件 | calendar draft tiers <-> Prefer Off group rows |
| `calendar-days-off-service.ts` | 组织事务、版本校验、调用 helper，不承载复杂转换 |
| `calendar-days-off-patch-queries.ts` | 仅保留冲突检查 SQL，必要时改为 Prefer Off date source |

## 性能要求

- 不允许对每个日期或每个 tier 单独查询数据库。
- 当前 bid 的 Prefer Off rows 一次查出。
- 保存时按 property group 批量 delete/insert。
- Pairing 冲突检查继续使用现有批量 SQL 或批量 pairing event 逻辑。
- 常规数据量下接口响应 < 2s。

## 测试计划

### GET

1. 有 Prefer Off 时，`GET /calendar-days-off/current` 返回 Prefer Off 派生 dates。
2. 没有 Prefer Off 但有旧 `pbs_bid_day_off` 时，仍 fallback 返回旧 dates。
3. Prefer Off 与旧表同时存在时，以 Prefer Off 为准。

### PATCH

1. 新增日期写入 `pbs_bid_group / Prefer Off`。
2. 移除日期后更新 Prefer Off values。
3. 移除最后一个日期后删除 calendar-managed Prefer Off。
4. 相同 tier 集合合并，不同 tier 集合拆分。
5. 不再写入 `pbs_bid_day_off`。
6. Pairing conflict 仍能阻止非法 day off 添加。

### PUT

1. 完整保存 calendar draft 后落到 Prefer Off。
2. 空 draft 会清空 calendar-managed Prefer Off。
3. draftVersion 冲突仍返回 409。

## 验收标准

1. 旧 `calendar-days-off` API 不再主写 `pbs_bid_day_off`。
2. 所有 Days Off 主链路统一到 `Prefer Off / pbs_bid_group`。
3. 代码模块清晰，无大段转换逻辑堆在 service。
4. 相关后端测试通过。
5. `pbs-server build` 通过。
6. 接口实现无 N+1 查询倾向，符合 2s 响应要求。

## 本轮实施记录

本轮已完成：

- 新增 `pbs-server/src/services/calendar/calendar-prefer-off-draft.ts`，集中处理 calendar draft 与 Prefer Off rows 的转换。
- `GET /api/calendar-days-off/current` 优先从 `Prefer Off / pbs_bid_group` 派生 draft，只有没有可用 Prefer Off 日期时 fallback 旧 `pbs_bid_day_off`。
- `PUT /api/calendar-days-off/current` 改为替换 calendar-managed Prefer Off，不再写入 `pbs_bid_day_off`。
- `PATCH /api/calendar-days-off/current/dates` 改为在当前 Prefer Off 派生 draft 上应用 changes，再替换 Prefer Off。
- 兼容 API 写入时会清理当前 bid 下旧 `pbs_bid_day_off` 投影，避免清空 Prefer Off 后旧表 fallback 导致 Off “删了又回来”。
- 新增 `calendar-prefer-off-draft.test.ts` 覆盖 draft/tier map 转换与相同 tier 集合合并、不同 tier 集合拆分规则。

验证：

- `pnpm --dir pbs-server test -- calendar-prefer-off-draft.test.ts prefer-off-calendar-events.test.ts calendar-days-off.test.ts bidding-calendar.test.ts`
- `pnpm --dir pbs-server build`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮涉及同一个 service 的事务、版本校验和 helper 集成，拆分会增加冲突风险。
- Suggested split: 不拆。
- Write boundaries: `pbs-server/src/services/calendar/`、`pbs-server/src/routes/calendar-days-off.test.ts`，必要时少量调整相关测试。
- Conflict risk: Medium。风险集中在旧 API 兼容、draftVersion、Pairing conflict。
- Execution gate: 用户确认本 spec 后再实现。
