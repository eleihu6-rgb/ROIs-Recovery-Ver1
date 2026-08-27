# PBS 左侧小日历 Days Off 单一数据源清理与连续 Prefer Off 连线修复

日期：2026-05-20  
状态：待用户确认实施  
范围：清理 PBS 中旧的独立 `calendar-days-off` 存储 / API / 前端调用链路，以 Days Off `Prefer Off` 作为左侧小日历 Off 数据的唯一来源，并修复共享左侧小日历连续 Off 断裂显示问题。

## 背景与问题

左侧 `BIDDING CALENDAR` 是 PBS Portal 的共享工作台组件，不只出现在 Days Off 页面，也出现在 Dashboard、Pairing、Tier 等页面。之前项目已经决定：用户在左侧小日历新增 / 删除 Off，本质上写入 Days Off 页面里的 `Prefer Off` bid，而不是写入一套独立 calendar day off 数据。

现在的问题是两层：

1. 数据源层面仍残留旧链路：前端还有 `calendar-days-off-service`、`use-calendar-days-off-draft`、`calendar-days-off-mappers`、Dashboard fallback、Tier 的 `Calendar:` 编辑路径；后端还有 `calendar-days-off` contract、route、service、validation、patch query、app 注册等。
2. 渲染层面出现回归：新的 `Prefer Off` 路径会把连续日期展开成逐日 `day_off_bid` event，当前小日历合并逻辑要求相邻 event 的 `id` 相同，导致连续 Off 被显示成每天一个独立块，看起来像断开了。

用户已确认本次不需要为了“保守”继续保留未上线的旧独立 calendar day off 存储链路；该清理的旧前后端代码应清理掉，避免项目里同时存在两套来源。

## 需求确认

- 目标：Days Off 的 Off 日期只有一个业务来源，即 Days Off `Prefer Off` bid。
- 左侧小日历展示、Dashboard 展示、Tier 汇总 / 编辑中涉及 Days Off 的 Off 信息，都应围绕 `Prefer Off` 或 DaysOff 模块数据工作。
- 旧 `calendar-days-off` 独立 draft / API / 前端 service 不再作为可写或可读来源保留。
- 连续 Off 日期在共享左侧小日历中应连成一条横向绿色条；跨周时按日历行自然拆分。
- 不做数据库 schema 迁移；如果旧代码只是历史未上线路径，直接移除代码和 contract。

## 推荐方案

推荐一次性收敛到新路径，而不是只补渲染：

1. `Prefer Off` 继续作为 Days Off bid property，左侧小日历新增 / 删除 Off 通过 Days Off page data 和 `daysOffService` 更新对应属性。
2. `bidding-calendar` 服务端日历继续从 `Prefer Off` bid 生成 `day_off_bid` events，作为 Dashboard / 共享小日历展示来源。
3. 前端共享小日历 mapper 修复连续 Off 合并规则：对 `day_off_bid` / `Off` 允许按同 row、同 tier、同 label、同 tone、日期相邻合并；其他 event 仍保持严格 id 合并，避免 Pairing / Leave 被误合并。
4. 移除旧 `calendar-days-off` 独立链路：
   - 删除前端 `calendar-days-off-service`、old draft hook、old mapper 和相关 fallback / mock。
   - 删除后端 `calendar-days-off` route、service、validation、patch query、contract 和 `buildServer` 注册 / 注入选项。
   - 清理 Tier 中 `Calendar:` editable source 的编辑 / 删除路径，Days Off 的 Prefer Off 走 `DaysOff` source。
   - 更新或删除只验证旧链路的测试。

## 备选方案与取舍

方案 A：只修小日历 merge，不删旧链路。  
优点是改动小；缺点是项目继续存在两套数据路径，以后 Dashboard、Tier、Days Off 仍可能分叉。这个方案不符合用户“不要无用代码”的要求。

方案 B：只删前端旧链路，后端 API 暂留。  
优点是前端数据源更清楚；缺点是后端仍暴露无业务入口的 API 和 contract，后续 agent 容易误用旧接口。

方案 C：前后端一起收敛到 `Prefer Off`，同时修复连续 Off 连线。  
这是推荐方案。改动面更大，但语义最干净：一个来源、一个展示路径、一个可测试行为。

## 设计细节

### 前端数据流

- Days Off 页面：左侧小日历编辑动作读取当前 Days Off page data，生成 / 更新 calendar-managed `Prefer Off` property，再调用现有 Days Off draft property 保存接口。
- Dashboard / 共享小日历：优先使用后端 `bidding-calendar` 返回的 `day_off_bid` events；在 Days Off 可编辑页面中，使用本地 Days Off page data 派生 override，保证编辑后立即反映。
- 删除旧 `buildDashboardScheduleDataFromCalendarDraft` fallback，不再从独立 calendar draft 生成 schedule data。

### 连续 Off 渲染

- 在 `bidding-calendar-mappers.ts` 中把 event 分段合并规则抽成清晰函数。
- `day_off_bid` 且 label 为 `Off` 的相邻段，在同一周 row 内合并为一个 `ScheduleCalendarEvent`，产生正确的 `colSpan`。
- 跨周不合并，因为小日历网格天然分行；视觉上应是上一周末一条、下一周初一条。
- Pairing bid 等非 Off event 仍要求同一个 source event id 才能合并，避免误把不同 bid 拼在一起。

### Tier 影响

- Tier 汇总中 Days Off 的 `Prefer Off` 应作为 `DaysOff` bid item 出现，并用 Days Off property 的稳定 `propertyGroupKey` 编辑 tiers。
- 不再生成或支持 `editableSource.module === "Calendar"` 的旧 calendar day off 编辑路径。
- 前端 `TierBidType` 和 badge / summary mapper 中如果没有其他有效 Calendar 业务，应移除 `Calendar` 类型；如果后端 contract 仍因历史兼容保留该 union，则前端也不再把它作为可编辑来源。

### 后端影响

- `bidding-calendar` 继续保留，并继续从 Days Off `Prefer Off` bid 构造 `day_off_bid` events。
- 删除独立 `calendar-days-off` route 和 service 注册，不再提供 `/api/calendar-days-off/current` 和 `/api/calendar-days-off/current/dates`。
- 删除 `packages/contracts/pbs-calendar-days-off.*`，或在确认仍被新路径类型引用时先把新路径类型迁移到 Days Off / bidding calendar 自己的 contract，避免继续依赖旧 API contract。
- 清理 performance baseline、route test、service validation test 里对旧 API 的引用。

## 不做范围

- 不修改数据库 schema。
- 不改 Days Off 右侧 property catalog 的业务规则。
- 不改 Pairing / Line / Reserve 的 bid 保存流程。
- 不改左侧小日历整体视觉样式，只修复连续 Off 连接显示和数据来源。
- 不做历史线上数据迁移，因为当前判断该功能尚未上线；若实施中发现真实已用数据入口，会暂停并报告。

## 验收标准

1. 用户在 Days Off 左侧小日历选择连续 Off 日期后，右侧 Days Off `Prefer Off` 数据是唯一被更新的来源。
2. Dashboard / Days Off / 共享工作台左侧小日历中，同 tier 连续 Off 在同一周内显示为一条连续绿色条。
3. 连续 3 天 Off 在 mapper 输出中表现为单个 event，`colSpan: 3`。
4. 跨周连续 Off 按周拆成多条，不能越过 calendar row。
5. Pairing bid 或其他非 Off event 不会因为 label / tone 相同被错误合并。
6. 前端不再调用 `/api/calendar-days-off/*`。
7. 后端不再注册 `/api/calendar-days-off/*`，相关 contract / service / tests 被删除或迁移。
8. Tier 不再通过 `Calendar:` source 编辑 Off；Prefer Off 通过 DaysOff property 编辑 tiers。

## 自动化测试计划

- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts`
  - 增加连续逐日 `day_off_bid` 合并为一个 `colSpan` event 的测试。
  - 增加跨周 Off 拆分测试。
  - 增加非 Off event 不误合并测试。
- Days Off / shared workbench 测试
  - 验证 Days Off 可编辑小日历保存路径调用 Days Off service，不调用旧 `calendarDaysOffService`。
  - 验证连续 Prefer Off 在共享左侧日历渲染为连续 event。
- Tier 测试
  - 移除旧 `Calendar:` 编辑 / 删除测试。
  - 增加或保留 `DaysOff` editable source 修改 Prefer Off tiers 的测试。
- PBS Server 测试
  - 删除旧 `calendar-days-off` route / validation 测试。
  - 保留并加强 `prefer-off-calendar-events` / `bidding-calendar` 测试，确认 `Prefer Off` 生成 `day_off_bid`。
  - 更新 app route 注册相关测试，确认旧 endpoint 不存在。

## 回归与验证计划

- 前端：
  - `pnpm --dir pbs-portal test -- bidding-calendar-mappers.test.ts`
  - 覆盖 Days Off / shared workbench / Tier 相关测试文件。
  - `pnpm --dir pbs-portal lint`
  - `pnpm --dir pbs-portal exec tsc --noEmit --pretty false`
  - `pnpm --dir pbs-portal build`
- 后端：
  - 覆盖 `bidding-calendar`、`prefer-off-calendar-events`、app route 注册和 lineholder summary 相关测试。
  - `pnpm --dir pbs-server build`
- 全局：
  - 优先运行 `npm run verify:pbs`；如果耗时或环境阻塞，需要明确说明阻塞原因和已替代执行的命令。
  - `git diff --check`
- 浏览器人工检查：
  - `http://localhost:3030/fpqe/pbs/dashboard`
  - `http://localhost:3030/fpqe/pbs/days-off`
  - 如 Tier 汇总可进入，也检查 Prefer Off tiers 编辑不再走 Calendar 旧路径。

## QA 人工测试案例文档

实施时新增：

`docs/test-cases/pbs/days-off/2026-05-20-prefer-off-calendar-single-source.md`

内容覆盖：

- 前置条件：当前 bid period、有 T1-T7、Days Off 页面可保存 draft。
- 正向场景：连续选择 3 天 Off，左侧连线、右侧 Prefer Off 数据同步、刷新后仍一致。
- 删除场景：取消中间一天，连线正确断开，右侧 Prefer Off 同步变化。
- 跨周场景：周末到下周初连续 Off 按两行显示。
- Dashboard 场景：Dashboard 左侧小日历读取同一 Prefer Off 来源并显示连续条。
- Tier 场景：Prefer Off 的 tiers 编辑走 DaysOff，不出现 Calendar 旧来源。
- 接口回归：浏览器网络请求中不出现 `/api/calendar-days-off/*`。

## 风险与处理

- 风险：旧 contract 类型当前被 `days-off-calendar-prefer-off.ts` 和 `bidding-calendar-mappers.ts` 当作本地 draft shape 使用。处理方式：实施时先抽出新本地类型或迁移到合适 contract，再删除旧 API contract。
- 风险：Tier summary 后端仍可能把历史 `bidType === "Calendar"` 标成可编辑。处理方式：清理 editable source 生成逻辑，确保旧 Calendar 不再作为新编辑入口。
- 风险：删除 route 后测试工具或 mock 仍引用旧 service。处理方式：用 `rg` 全仓清理，typecheck 和 build 作为硬门禁。
- 风险：连续 Off 合并条件过宽。处理方式：只对 `day_off_bid` / `Off` 特例放宽，非 Off 类型保持严格 id 合并，并用测试锁住。

## 关键假设

- 当前功能尚未上线，不需要保留 `/api/calendar-days-off/*` 兼容旧客户端。
- Days Off `Prefer Off` 已经是用户期望的唯一 Off 数据来源。
- 旧 Calendar 独立 day off draft 没有必须迁移的生产数据。
- 如果实施中发现上述假设不成立，应暂停并回到需求确认。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次虽然跨前端、后端、测试和文档，但核心是同一条数据链路收敛，文件之间契约强耦合；并行拆分容易出现一边删 contract、另一边仍依赖旧类型的冲突。
- Suggested split: 不建议拆分；由主 agent 顺序完成“类型迁移 → 前端旧链路清理 → 后端旧 API 清理 → 测试与 QA 文档”。
- Write boundaries: 主 agent 负责所有相关改动，避免多 agent 修改同一批 contract / mapper / service 文件。
- Conflict risk: 中等偏高；当前工作树已有上一个 Days Off 布局任务的未提交改动，实施时必须只增量修改本任务相关文件，不回滚已有改动。
- Execution gate: 用户确认本 spec 后才开始实施。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
