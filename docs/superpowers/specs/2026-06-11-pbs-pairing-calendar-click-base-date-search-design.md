# PBS Pairing Calendar 点击日期按登录人 Base 时区搜索设计

日期：2026-06-11  
范围：PBS Portal 左侧 `BIDDING CALENDAR` 点击日期添加 Pairing 的搜索链路

## 背景

在 `/fpqe/pbs/pairing/search` 结果卡片中，已确认一个重要口径：

- live 库中的 `*_utc` 时间字段按 UTC 业务语义读取。
- 前端卡片展示统一按 pairing `base` 时区转换。
- duty `DATE` 和右侧 mini calendar 按 duty 在 base 时区下的覆盖日期展示。

继续检查左侧 `BIDDING CALENDAR` 点击某一天搜索 pairing 的链路后，发现当前还有一处口径不一致：

- 前端在 `dashboard-schedule-panel` 中把用户点击的 `isoDate` 传给 `pairingService.searchPairingOccurrencesByDate(originDate, periodCode)`。
- 后端 `/pairing-search/pairing-occurrences/by-date` 当前用 `(start_utc at time zone 'UTC')::date = clicked_date` 筛 pairing。
- 这意味着用户点击的是日历上的本地业务日期，但后端按 UTC 日期查 pairing。

如果当前登录人 base 是 `YYC`，某个 pairing report 为：

| 时间口径 | 时间 |
| --- | --- |
| UTC | `2025-12-28 05:05` |
| YYC base | `2025-12-27 22:05` |

用户在 base 日历上点 `0627` 时，业务含义应是“查 YYC base 日期为 6 月 27 日开始/覆盖的 pairing”。但当前后端按 UTC 日期会把它归到 `0628`，导致点击 `0627` 搜不到该 pairing。

## 目标

- 左侧 `BIDDING CALENDAR` 点击某天搜索 pairing 时，按当前登录人的 base 时区解释点击日期。
- 后端使用当前登录人的 `pbs_user.base` 查 `airport.zone_id`，再把 pairing start UTC 转成该 zone 下的日期进行筛选。
- 前端继续传 `originDate` 和 `periodCode`，不让前端承担时区换算。
- 返回的 occurrence `originDate / startDate / endDate` 与点击日历口径一致，使用当前登录人 base 时区下的 ISO date。
- 避免 UTC 日期、本机时区、pairing base 时区和登录人 base 时区混用。

## 非目标

- 不修改左侧日历 UI 结构。
- 不修改 Pairing Search 结果卡片的展示口径；结果卡片仍按 pairing `base` 展示。
- 不修改数据库 schema。
- 不引入旧 UTC 日期筛选兼容层；如果调用方仍依赖 UTC 日期，应通过测试暴露并修正。
- 不改变 Pairing Number 手动搜索/自动补全的基本交互。

## 当前链路

### 前端

文件：`pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`

当前点击日期后调用：

```ts
pairingService.searchPairingOccurrencesByDate(
  pendingPairingCalendarAction!.isoDate,
  pairingCalendarPeriodCode,
)
```

这里的 `isoDate` 来自左侧日历格子，本质是当前用户看到的 bidding calendar 日期。

### 后端

文件：`pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`

当前筛选逻辑：

```sql
where (start_utc at time zone 'UTC')::date between $1::date and $2::date
  and (start_utc at time zone 'UTC')::date = $3::date
```

问题是：`$3` 是用户点击的日历日期，不应该拿来和 UTC date 直接比较。

## 方案比较

### 方案 A：前端传当前用户 base 或 zone id

前端在调用 `searchPairingOccurrencesByDate` 时附带 base 或 zone id。

优点：

- 后端改动较小。

缺点：

- 前端承担业务时区来源，容易被篡改或与后端登录态不一致。
- 需要把当前用户 base/zone 暴露到更多前端状态里。
- 不符合“后端负责时间换算，前端只负责渲染/交互”的既定方向。

### 方案 B：后端用 actor 查登录人 base zone（推荐）

后端在 `searchPairingOccurrencesByDate(actor, request)` 中使用 actor 的 `crewId/userCode` 查当前登录人的 base，再 join live `airport` 表拿 `zone_id`。

优点：

- 时区来源可信，和登录态绑定。
- 前端 contract 不需要新增字段。
- 与 Days Off / algorithm export 中按 crew base zone 解释日历日期的方向一致。
- 点击日历这个行为天然属于“当前登录人的 bidding calendar”，用当前登录人 base 最符合业务语义。

缺点：

- 后端 service 需要多查一次 base/zone，或把 actor base zone 加入 service context。
- 需要明确 base 缺失时的 fallback 行为。

### 方案 C：按 pairing base 搜索

后端把每个 pairing 的 start UTC 转成该 pairing 自己的 base date，再和点击日期比较。

优点：

- 和 Search Pairings 结果卡片的展示口径一致。

缺点：

- 用户点击的是当前登录人的日历，不是每个 pairing 自己的日历。
- 如果未来允许跨 base pairing，点击同一个日期会混入不同 base 口径，用户难以理解。
- 不适合“从我的 bidding calendar 添加 pairing”的场景。

推荐采用方案 B。

## 后端设计

### Actor base zone 解析

`PbsPairingSearchService.searchPairingOccurrencesByDate` 当前已经接收 actor：

```ts
searchPairingOccurrencesByDate(actor, request)
```

实施时应把 actor 传入 `pairing-occurrence-query`，用于解析当前登录人的 base zone。

推荐解析顺序：

1. 根据 `actor.crewId` 查 PBS 用户表 `pbs_user.base`。
2. 使用 base 到 live schema 的 `airport.zone_id` 查 IANA 时区。
3. 如果 `pbs_user.base` 缺失，再尝试用 live `crew.base` 或同等 crew 主数据兜底。
4. 如果仍缺失或 zone id 无效，fallback 到 `UTC`，并在测试中覆盖。

> 说明：fallback 到 UTC 是为了避免接口直接不可用，但应保留测试和日志/可观测性空间，后续数据治理应修正缺失 base。

### 日期筛选口径

当前 `start_utc` 仍可定义为 pairing occurrence 的 report/start：

```sql
coalesce(
  (
    select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
    from pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
  ),
  p.sch_str_dt_utc
)
```

但日期比较应从：

```sql
(start_utc at time zone 'UTC')::date = clicked_date
```

改为：

```sql
(start_utc at time zone actor_base_zone_id)::date = clicked_date
```

`periodCode` 的 start/end 过滤也应使用同一个 actor base zone：

```sql
(start_utc at time zone actor_base_zone_id)::date between period_start and period_end
```

这样用户点 `0627` 时，后端查的是“登录人 base 时区下 start date = 0627”的 pairing occurrence。

### 返回字段

`PbsPairingOccurrence` 当前字段保持不变：

```ts
originDate: string;
startDate: string;
endDate: string;
```

但字段语义更新为：

| 字段 | 新语义 |
| --- | --- |
| `originDate` | 当前登录人 base 时区下的 occurrence start date |
| `startDate` | 当前登录人 base 时区下的 occurrence start date |
| `endDate` | 当前登录人 base 时区下的 occurrence end date |

如果后续需要同时展示 pairing base date，应新增明确字段，不能复用这三个字段造成语义混乱。

### 与 Pairing Details 的关系

点击日历后搜索 occurrence 的筛选口径使用“当前登录人 base”。

用户选择 occurrence 后打开详情卡片时，详情卡片仍按上一份 spec 确认的规则展示：

- 卡片 `REPORT / DATE / DEP / ARR` 按 pairing `base` 展示。
- 卡片 mini calendar 按 duty 在 pairing `base` 下的覆盖日期点亮。

正常情况下当前登录人只会看到自己 base 的 pairing，这两个 base 一致；如果未来支持跨 base pairing，需要另开需求确认是否统一改为登录人 base 展示。

## 前端设计

- `dashboard-schedule-panel` 保持传入点击的 `isoDate`。
- `pairingService.searchPairingOccurrencesByDate(originDate, periodCode)` contract 不新增 zone 参数。
- React Query key 仍包含 `originDate` 和 `periodCode`。
- Popover 展示的 occurrence 列表直接使用后端返回结果。
- 前端不做 UTC/base 换算，不从浏览器时区推导任何业务日期。

## 测试设计

### 后端自动化测试

更新 `pbs-server/src/services/pairing-search/pairing-search-service.test.ts` 或新增专门测试，覆盖：

- 当前登录人 base 为 `YYC`，zone 为 `America/Edmonton`。
- pairing start UTC 为 `2025-12-28 05:05`。
- 点击 period 映射后的 `2026-06-27` 能查到该 occurrence。
- 点击 `2026-06-28` 不应因 UTC date 命中同一 occurrence。
- 返回 `originDate/startDate` 为 base-local 日期。
- `endDate` 使用同一 actor base zone。
- base/zone 缺失时 fallback 到 UTC。

### 前端自动化测试

更新共享工作台或 Dashboard 相关测试：

- 点击左侧日历某天时，仍以该日历 `isoDate` 调用 `searchPairingOccurrencesByDate`。
- 前端不传 base/zone 参数。
- occurrence 列表展示后端返回的 `originDate`，不在前端重算。

### 人工 QA 用例

后续实施时应新增或更新 `docs/test-cases/pbs/pairing-calendar/`：

- YYC 用户点击 `0627`，能搜到 UTC start 为 `0628 05:05`、YYC local start 为 `0627 22:05` 的 pairing。
- 同一个 pairing 不应只因为 UTC date 是 `0628` 而只能在 `0628` 搜到。
- 搜索结果加入 bid 后，左侧 calendar 展示和 pairing detail 展示均符合各自 base 口径。

## 验收标准

- 左侧日历点击日期搜索 pairing 时，筛选口径为当前登录人的 base-local 日期。
- 用户点击 `0627` 能命中 report/start 在当前登录人 base 下落到 `0627` 的 pairing，即使 UTC date 是 `0628`。
- UTC、本机时区、浏览器时区不影响搜索结果。
- 前端请求 contract 不新增可被用户篡改的 zone 参数。
- Pairing Search 结果卡片展示口径不被本需求回退。
- 后端测试覆盖 actor base zone 查询、base-local 日期筛选、period 过滤和 fallback。

## 风险与注意事项

- 如果当前登录人的 `pbs_user.base` 数据缺失，接口会 fallback 到 UTC；这会保住可用性，但可能仍出现搜索日期不符合用户预期的问题。
- 如果同一用户未来可以搜索跨 base pairing，点击日历筛选和详情卡片展示可能出现 base 不一致；届时需要产品确认是否把详情也改为登录人 base。
- 当前 Pairing Number occurrence 选择、calendar add、calendar detail 都使用 `originDate` 作为稳定 occurrence key 的一部分；实施时要保证新 `originDate` 语义前后一致，避免同一 pairing 在不同日期 key 下重复或找不到。
- 不应使用服务器本机时区或浏览器本地时区作为业务时区。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是同一条日历点击搜索链路的口径修正，核心集中在 pairing occurrence query、service actor 传递和少量前端测试，拆分会增加合同同步成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`、`pbs-server/src/services/pairing-search/pairing-search-service.ts`、相关 route/service 测试、`pbs-portal` calendar 点击相关测试、QA 文档。
- Conflict risk: 中。当前工作区已有 Pairing Search base 时区修复的未提交改动，实施时必须在其基础上继续，不能回退。
- Execution gate: 用户确认本 spec 后再实施。
