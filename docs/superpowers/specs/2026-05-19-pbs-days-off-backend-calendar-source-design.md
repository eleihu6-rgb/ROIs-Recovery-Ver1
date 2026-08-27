# PBS Days Off 后端日历来源统一设计

日期：2026-05-19  
状态：已实施  
范围：后端 `GET /api/bidding-calendar/current` 的 Days Off 日历事件来源统一；不涉及 Submit、Award、Reserve、不删除旧表、不做生产数据迁移

## 背景

上一轮前端已经完成 `/days-off` 左侧日历快捷编辑到 `Prefer Off(propertyCode=201)` 的切换：左侧日历 Off 不再主写 `pbs_bid_day_off`，而是通过 Days Off property API 写入 `pbs_bid_group`。

但后端日历接口仍有旧口径：

- `GET /api/bidding-calendar/current` 里的 `day_off_bid` event 目前主要来自 `pbs_bid_day_off`。
- Pairing conflict、Dashboard/Tier 日历显示仍可能间接受旧表影响。
- 这会让前端写入 `Prefer Off` 后，后端日历接口与 Days Off draft 继续存在口径分裂。

本轮目标是把后端日历读取口径也统一到 `Prefer Off / pbs_bid_group`。

## 目标

1. `GET /api/bidding-calendar/current` 的 Days Off `day_off_bid` 事件优先从 `pbs_bid_group` 中的 Days Off `Prefer Off(propertyCode=201)` 派生。
2. `pbs_bid_day_off` 降级为 legacy / projection，不再作为产品主数据来源。
3. 后端转换逻辑模块化，避免把解析、展开、事件生成逻辑堆进一个大 service。
4. 接口响应保持 2 秒内，避免 N+1 查询和重复全量扫描。
5. 保持现有 calendar response contract，不破坏前端消费结构。

## 不做范围

- 不开发 Submit 闭环。
- 不开发 Award / Reserve。
- 不删除 `pbs_bid_day_off` 表。
- 不做生产历史数据迁移。
- 不新增 `prefer-off-dates` 快捷 API。
- 不改 Days Off 右侧交互。
- 不重构无关 Pairing / Line 逻辑。

## 推荐方案

采用“后端日历事件从 Prefer Off 派生，旧表兼容降级”的方案。

核心做法：

1. 在 calendar service 内新增独立 helper / mapper，例如：
   - `prefer-off-calendar-events.ts`
   - 或 `days-off-calendar-events.ts`
2. helper 只负责纯转换：
   - 识别 `propertyCode=201` / `legacy_property_code=201`
   - 解析 `param_a` 中的日期、日期列表、日期范围
   - 读取同一 `property_group_key` 下的 active tiers
   - 生成 `PbsBiddingCalendarEvent[]`
3. `bidding-calendar-service.ts` 只负责组织查询与合并事件，不承载复杂解析逻辑。
4. 旧 `pbs_bid_day_off` 数据可以作为 fallback，但不能覆盖或优先于 `Prefer Off`。

## 数据来源规则

### 主来源

从 `pbs_bid_group` 读取：

```text
bid_type = DaysOff
legacy_property_code = 201
is_deleted = 0
```

并根据 group/tier 信息生成：

```text
type = day_off_bid
label = Off
source = pbs_bid_group
readonly = false
```

### 兼容来源

`pbs_bid_day_off` 保留为 legacy / projection：

- 如果同一个 bid 没有可用 `Prefer Off`，可以继续读取旧表生成兼容事件。
- 如果同一日期/tier 同时存在 `Prefer Off` 和旧表数据，应以 `Prefer Off` 为准，避免重复 event。

## 日期解析规则

第一版只支持稳定、明确的 `Prefer Off` 日期表达：

1. 单日期：`2026-05-21`
2. 多日期列表：`2026-05-21,2026-05-22`
3. 前端 tag-list 形态映射出来的多个值
4. 日期范围：如现有 mapper 已支持 `Between`，可展开为逐日事件

暂不把 `Weekends`、`MONDAY` 这类抽象表达强行映射成日历事件，除非现有 Days Off mapper 已经有明确稳定口径。原因是它们依赖 period calendar 语义，容易超出本轮范围。

## 性能要求

接口响应必须满足：

- 常规数据量下 `GET /api/bidding-calendar/current` < 2s。
- 不允许对每个 property / tier / date 做单独 DB 查询。
- Days Off Prefer Off 查询应一次性取出当前 bid 下需要的 rows。
- 日期展开在内存纯函数中完成。
- 转换函数应避免重复 parse；同一 property 的日期集合只解析一次。

本轮测试至少保留现有 performance baseline，不引入明显慢查询。

## 模块边界

推荐文件职责：

| 文件 | 职责 |
|------|------|
| `bidding-calendar-service.ts` | 查询当前 bid、组织 pairing/day off/weekend events、排序合并 |
| `prefer-off-calendar-events.ts` | 从 Days Off Prefer Off rows 生成 day_off_bid events |
| `bidding-calendar-date-utils.ts` | 日期 normalization、range 展开 |
| 相关 tests | 覆盖 Prefer Off 事件派生、legacy fallback、重复去重 |

## 测试计划

### Service 单测

需要覆盖：

1. 单日期 `Prefer Off` 生成一个 `day_off_bid`。
2. 多日期 `Prefer Off` 生成多个 `day_off_bid`。
3. 同一 property 多个 active tiers 时，每个 tier/date 都生成事件。
4. 不同 `property_group_key` 的不同 tier 集合能正确展开。
5. `Prefer Off` 与 `pbs_bid_day_off` 同日期/tier 重复时，只保留 `Prefer Off` 派生事件。
6. 没有 `Prefer Off` 时，旧 `pbs_bid_day_off` fallback 仍可显示。
7. 非日期型 Prefer Off 值不生成错误事件。

### Route 测试

需要覆盖：

1. `GET /api/bidding-calendar/current` 返回 `source = pbs_bid_group` 的 Days Off 事件。
2. 响应结构保持 `PbsBiddingCalendarCurrentResponse` 兼容。

### 回归测试

需要确保：

1. Pairing event 仍正常返回。
2. Weekend / computed event 不受影响。
3. Line / Tier 现有测试不因 event source 改动失败。

## 验收标准

1. 后端日历 Days Off 主来源为 `Prefer Off / pbs_bid_group`。
2. 旧 `pbs_bid_day_off` 不再优先于 `Prefer Off`。
3. 代码结构清晰，Prefer Off 解析和事件生成独立成模块。
4. 无 N+1 查询倾向。
5. 相关 lint / test / build 通过。
6. 接口性能不超过 2s 的约束被记录并在实现中主动规避。

## 本轮实施记录

本轮已完成：

- 新增 `pbs-server/src/services/calendar/prefer-off-calendar-events.ts`，集中处理 Prefer Off 日期解析、tier/date 聚合、`day_off_bid` event 生成。
- `GET /api/bidding-calendar/current` 在存在 Days Off `Prefer Off(propertyCode=201)` 时，使用 `pbs_bid_group` 派生的 day off events 和 Pairing day off conflict 数据。
- 仅当当前 bid 没有 Prefer Off rows 时，才 fallback 旧 `pbs_bid_day_off`。
- 新增 `prefer-off-calendar-events.test.ts` 覆盖单日期、多日期、日期范围、tier 聚合、事件去重与 `source=pbs_bid_group`。
- 保持 service 查询为批量读取，不引入按日期 / 按 tier 的 N+1 查询。

验证：

- `pnpm --dir pbs-server test -- prefer-off-calendar-events.test.ts bidding-calendar-service.test.ts bidding-calendar.test.ts`
- `pnpm --dir pbs-server build`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮改动集中在后端 calendar service、mapper 和测试，文件边界紧密，单 agent 顺序推进更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/calendar/`、相关 route/service tests，必要时只读 contracts。
- Conflict risk: Medium。主要风险是 Pairing calendar 的 day off conflict 判断仍依赖 day off event，必须小步改并跑回归。
- Execution gate: 用户 review 本 spec 后，再进入实现。
