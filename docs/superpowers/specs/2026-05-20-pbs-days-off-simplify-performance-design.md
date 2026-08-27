# PBS Days Off 简化重构与性能优化设计

日期：2026-05-20
状态：已确认并实施
范围：PBS Portal Days Off 页面、左侧共享 Bidding Calendar、Days Off mutation API 链路、相关后端服务与回归测试。

## 实施结果摘要

- 已将 `dashboard-schedule-panel.tsx` 中的 Days Off 左侧日历数据、操作、mutation 和 query invalidation 拆到独立模块，保留原组件作为页面组合层。
- 左侧日历保存成功后先 patch `daysOffPageDataQueryKey` 本地缓存，再后台刷新必要 calendar / tier query，避免保存后重复 refetch Days Off page data。
- 保持 `Prefer Off` 重叠允许保存的业务语义，不恢复旧 `/api/calendar-days-off/*` 链路。
- 已补充前端自动化测试和人工回归测试文档，覆盖轻量 mutation、缓存 patch、连续 Off、跨页面日历一致性与错误提示不重复。

## 背景

最近 Days Off 和左侧共享日历经历了多轮大改：

- 左侧小日历从旧的 calendar days off 存储路径，切换为基于 Days Off `Prefer Off` 规则生成。
- Days Off `Prefer Off` 保存改为轻量 `POST / PUT / DELETE` mutation。
- `Prefer Off` 重叠日期不再作为硬错误阻止保存。
- 左侧小日历需要在 Days Off / Pairing / Dashboard 中保持同一数据源和同一展示规则。

当前用户观察到新的风险：

- 浏览器 Network 中多个接口耗时超过 2 秒，部分 mutation 或刷新链路达到 3-4 秒。
- 单次操作后可能触发多个 `current`、`properties`、calendar 相关请求。
- 代码结构开始混乱，尤其 `dashboard-schedule-panel.tsx` 已经超过 1000 行，混合了日历展示、Days Off 可编辑 overlay、保存逻辑、query invalidation 和 Pairing 操作。
- 多个小 spec / test case 文档已经存在，但整体回归入口不够统一，后续继续迭代容易漏测。

因此本次目标不是新增业务能力，而是一次 Days Off 专项 simplify、性能优化和回归体系收敛。

## 目标

- 让 Days Off 与左侧共享日历的数据流更简单、更可读。
- 把大型混合组件拆成职责清晰的子模块，减少继续堆逻辑。
- 找出并优化 Days Off 新增 / 编辑 / 删除，以及左侧日历操作中的慢接口和不必要刷新。
- 确保常规 Days Off mutation 和左侧日历操作关键接口正常场景 `< 2s`。
- 累积并统一回归测试案例，覆盖前两轮 Days Off + calendar 改动，防止 A+B 功能互相 break。
- 让后端同学阅读前后端边界时更清晰：页面层、转换层、mutation 层、calendar 生成层各自负责什么。

## 非目标

- 不新增新的 Days Off bid 类型。
- 不改变 AA / 旧库确认过的 `Prefer Off` 重叠允许保存语义。
- 不恢复旧 `/api/calendar-days-off/*` 链路。
- 不迁移数据库 schema。
- 不把所有 PBS module 一次性重构，只聚焦 Days Off 与共享 calendar 相关链路。
- 不做视觉大改，只在必要时调整因拆分导致的结构绑定。

## 成功标准

### 性能

- Days Off 页面常规新增 property：关键 mutation 接口正常场景 `< 2s`。
- Days Off 页面编辑 property：关键 mutation 接口正常场景 `< 2s`。
- Days Off 页面删除 property：关键 mutation 接口正常场景 `< 2s`。
- 左侧小日历新增 Off / 删除 Off / 切换 tier 后保存：关键 mutation 和必要刷新正常场景 `< 2s`。
- 单次保存后不触发明显无意义的全量请求链，例如重复拉取多个 `current` 或不需要的 `properties`。

### 功能

- Days Off / Pairing / Dashboard 强制刷新后，左侧共享小日历展示一致。
- 连续 `Prefer Off` 日期仍渲染为一条连续 Off 横条。
- `date + tier` 重复 Prefer Off 仍在日历展示层去重。
- Days Off mutation payload 保持轻量，不回退到整份 UI property 或整份 draft 保存。
- API 错误继续通过统一 message / toast 反馈，不出现右侧面板重复红色错误块。

### 代码结构

- `dashboard-schedule-panel.tsx` 不再承载所有日历和 Days Off mutation 细节。
- Days Off calendar action、query invalidation、Prefer Off draft 转换、calendar mapper 分散到清晰模块。
- 后端 `days-off-bid-service.ts` 保留 service 门面，但重逻辑尽量落到命名明确的 helper / write 模块。
- 测试文件与测试用例文档能反映新的模块边界。

## 推荐实施方案

采用“先量化，再拆分，再优化”的方案。

### 阶段 1：性能与请求链路基线

先不改行为，建立基线：

- 记录 Days Off 页面初次加载触发的接口。
- 记录新增 / 编辑 / 删除 Days Off property 触发的接口、顺序和耗时。
- 记录左侧小日历操作触发的接口、顺序和耗时。
- 标记哪些请求是必要的，哪些是重复刷新或可以延后 / 合并的。
- 对后端关键接口补充轻量 timing 日志或本地 measurement，避免只凭浏览器截图判断。

输出：

- 一份简短的 baseline 记录，写入测试用例或 implementation notes。
- 明确优先优化的 2-3 个慢点。

### 阶段 2：前端模块拆分

重点拆 `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`。

建议新边界：

- `dashboard-schedule-panel.tsx`
  - 保留壳层、布局组合、props wiring。
  - 不直接承载大段 Days Off 保存逻辑。

- `use-dashboard-calendar-data.ts`
  - 负责 server bidding calendar、editable days off draft、本地 draft overlay 的选择和 memo。
  - 明确何时使用 server calendar，何时使用 editable overlay。

- `use-days-off-calendar-actions.ts`
  - 负责左侧小日历上的 Off add / remove / weekday action。
  - 暴露稳定 action handlers 和 pending/error 状态。

- `days-off-calendar-mutation.ts`
  - 负责把 calendar action 转换为 Days Off service mutation。
  - 处理新增 Prefer Off、更新 Prefer Off、删除多余 Prefer Off 的具体策略。

- `calendar-query-invalidations.ts`
  - 集中定义 Days Off / Pairing / calendar mutation 后需要 invalidate 的 query。
  - 避免多个页面散落 `queryClient.invalidateQueries`，减少重复刷新。

- `days-off-calendar-prefer-off.ts`
  - 只负责 Days Off page data 与 calendar draft / Prefer Off date set 的转换。
  - 不承载 React state 或请求逻辑。

拆分原则：

- 每个新文件只承担一个清楚职责。
- 先移动已有逻辑，保持行为不变，再做性能优化。
- 每次拆分后跑聚焦测试，避免大批量移动后难以定位问题。

### 阶段 3：前端请求与缓存优化

优化点以基线结果为准，预计包括：

- mutation 成功后只更新必要 query cache，不盲目全量 invalidate。
- 对可由 mutation response 更新的 draft meta / property 列表，优先 `setQueryData`，再按需后台刷新。
- 左侧日历操作完成后只刷新 `biddingCalendarQueryKey` 和必要的 Days Off page data，避免重复触发多个 current draft 请求。
- Days Off 页面右侧数据刷新与左侧共享日历展示基线分离，避免进入 Days Off 后左侧日历走另一套最终展示逻辑。

### 阶段 4：后端服务边界与性能优化

后端优先做清晰边界和关键慢点优化，不盲目重写：

- `days-off-bid-service.ts`
  - 保留对外 service interface。
  - 将 add / update / delete 中重复的 draft reference、validation、write response 拼装抽成命名 helper。

- `days-off-property-write.ts`
  - 保持单 property mutation。
  - 确认更新和删除只影响目标 `propertyGroupKey`，不整份 draft 重写。

- `prefer-off-calendar-events.ts`
  - 专职生成 `Prefer Off` calendar events。
  - 继续按 `date + tier` 去重。
  - 检查 SQL 是否存在 N+1、全量扫描或重复 parse。

- `bidding-calendar-service.ts`
  - 只做 calendar 数据组合，不承载 Days Off bid 规则细节。
  - Pairing event、Prefer Off event 的生成边界保持清晰。

如果发现慢点来自 SQL：

- 先确认已有索引和查询条件。
- 优先通过 where 条件、select 字段收敛、减少重复查询优化。
- 不在本次直接改 schema，除非证据明确且用户单独确认。

### 阶段 5：回归测试体系收敛

新增统一回归清单：

`docs/test-cases/pbs/days-off/2026-05-20-days-off-simplify-performance-regression.md`

覆盖：

- Days Off add / edit / delete。
- Prefer Off values、date range、weekday / weekends、连续 Off。
- Tx 语义：不同 Tx 同日期允许，同 Tx 重复不硬拦。
- 204 / 205 / 206 结构化条件。
- API payload 轻量化。
- API 错误统一 message，无重复红色 alert。
- 左侧小日历在 Days Off / Pairing / Dashboard 强刷一致。
- 左侧小日历操作 `< 2s` 手工记录项。
- Network 中不出现旧 `/api/calendar-days-off/*`。

自动化测试需要覆盖：

- 前端 service payload。
- Days Off page mutation cache 更新。
- Dashboard calendar mapper 连续 / 去重 Off。
- 新拆出的 calendar action hook / mutation helper。
- 后端 Days Off validation、routes、property write helper。
- 后端 bidding calendar Prefer Off event generation。

## 风险与控制

- 风险：大文件拆分过程中改变行为。
  - 控制：先移动逻辑，保持测试通过，再做优化。

- 风险：为了 `<2s` 目标过度缓存，导致页面数据不一致。
  - 控制：mutation 后保留必要 query invalidation，区分立即 cache patch 和后台 refresh。

- 风险：已有多个 spec / test case 语义冲突。
  - 控制：新增总回归文档，并在旧文档中保留历史说明，不继续扩散互相矛盾的新规则。

- 风险：本地数据库耗时不稳定，性能结论不可靠。
  - 控制：同时记录代码路径、请求数量、浏览器 Network timing；不把单次本地波动当最终结论。

## 验证计划

实施后至少运行：

- `pnpm --dir pbs-server test`
- `pnpm --dir pbs-server build`
- `pnpm --dir pbs-portal test`
- `pnpm --dir pbs-portal lint`
- `pnpm --dir pbs-portal build`
- `git diff --check`

手工验证：

- 打开 Days Off 页面，新增 / 编辑 / 删除 Prefer Off，记录 Network timing。
- 在左侧小日历新增 / 删除 Off，记录 Network timing。
- 强制刷新 `/days-off`、`/pairing`、`/dashboard`，确认左侧小日历一致。
- 检查连续 Off 横条、重复 Prefer Off 去重、API payload 轻量化。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前任务跨 Days Off、Dashboard shared calendar、后端 calendar service 和 query cache。虽然文件多，但核心是同一条数据链路；并行写代码容易继续产生边界不一致。
- Suggested split: 不并行实现。先由主 agent 完成基线、拆分、优化和集成验证。
- Write boundaries: 前端 `pbs-portal/src/features/dashboard/`、`pbs-portal/src/features/days-off/`、`pbs-portal/src/shared/services/days-off-service.ts`；后端 `pbs-server/src/services/days-off/`、`pbs-server/src/services/calendar/`；测试文档 `docs/test-cases/pbs/days-off/`。
- Conflict risk: Medium。当前工作树已干净并有最新提交作为起点，但本次会触碰多个刚改过的 Days Off / calendar 文件。
- Execution gate: 用户 review 并确认本 spec 后再进入 implementation plan 和代码修改。

## 待确认

请用户确认：

1. 是否接受先做性能基线，再拆分，再优化的顺序。
2. 是否接受将 `dashboard-schedule-panel.tsx` 拆成多个子模块。
3. 是否接受本次不改变 `Prefer Off` 重叠允许保存的业务语义，只优化展示、性能、结构和测试体系。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
