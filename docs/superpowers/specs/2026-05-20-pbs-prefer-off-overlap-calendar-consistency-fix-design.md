# PBS Prefer Off 重叠防呆与共享小日历一致性修复

日期：2026-05-20  
状态：已确认实施  
范围：修复 PBS 左侧共享 `BIDDING CALENDAR` 在 Days Off / Pairing / Dashboard 页面展示不一致的问题，补齐 Days Off `Prefer Off` 重叠日期保存防呆，并将日历事件类型从容易误解的 `day_off_bid` 改名为 `prefer_off_bid`。

## 背景与问题

用户在 3002 账号强制刷新后发现：

- 进入 Days Off 页面时，左侧小日历显示为一条连续 Off，看起来正常。
- 进入 Pairing 页面时，左侧小日历出现上下两层 Off，4/19-4/22 被重复显示。
- 这说明共享左侧小日历在不同页面使用了不一致的数据路径或刷新策略。

只读排查发现，3002 的 Apr 2026 当前存在两条重叠 `Prefer Off`：

- 一条是具体日期列表：`2026-04-19,2026-04-20,2026-04-21,2026-04-22,2026-04-30`
- 一条是日期范围：`Between 2026-04-19 - 2026-04-22`

Days Off 页面目前会从右侧 Days Off page data 派生本地 calendar draft，并在本地使用 Set 合并日期，所以看起来正常。Pairing / Dashboard 强刷时则直接使用后端 `bidding-calendar` 返回的 `day_off_bid` events，重复日期会被当成两条事件渲染到不同 slot，造成 UI 叠层。

根因不是单一 UI 样式问题，而是两个问题叠加：

1. 保存层缺少 `Prefer Off` 重叠防呆，允许同一 tier 下多个 Prefer Off 覆盖同一日期。
2. 共享左侧小日历在不同页面的数据来源 / overlay 策略不一致，导致同一账号同一 bid period 在不同页面看到不同结果。

另一个命名问题是：当前后端 `bidding-calendar` 把由 `pbs_bid_group` / `Prefer Off` 规则生成的事件标成 `day_off_bid`。这个名字不是旧 `pbs_bid_day_off` 表，但非常容易让人误解为又启用了旧链路。因此本次一并改为 `prefer_off_bid`，让事件名和真实来源一致。

## 需求确认

- 同一 tier 下，`Prefer Off` 展开后的具体 Off 日期不能与已有 `Prefer Off` 日期重叠。
- 新增 / 编辑 `Prefer Off` 时，如果日期列表、星期、weekends、date range 展开后与同 tier 现有 Prefer Off 日期重叠，应阻止保存并提示用户。
- 后端必须做最终校验，不能只依赖前端弹窗。
- 前端应在添加 / 编辑前尽量提前提示，减少用户提交后才失败的体验。
- 对当前已经存在的重复数据，左侧小日历必须兜底去重，不能渲染出上下两层 Off。
- Days Off / Pairing / Dashboard 的左侧共享小日历必须使用一致的展示结果；进入不同页面或强制刷新后不应出现同一日期不同显示。
- Days Off 页面右侧业务数据可以按页面需要刷新，但左侧共享小日历不应因为进入 Days Off 而切换成另一套最终展示逻辑。
- `bidding-calendar` contract / 前后端运行时代码中的 Prefer Off 日历事件类型统一命名为 `prefer_off_bid`，不再使用 `day_off_bid` 作为新路径事件名。

## 推荐方案

推荐一次修复两层：

1. **保存层防呆**
   - 在 Days Off `Prefer Off` add / patch / full save 校验中展开目标日期。
   - 按 `tier + isoDate` 检查同一 draft 内不同 `Prefer Off` property 是否重叠。
   - 如果重叠，返回统一错误，例如：`Prefer Off dates overlap for T1: 2026-04-19, 2026-04-20, 2026-04-21, 2026-04-22.`
   - 前端沿用统一 message 展示，不新增 DOM 内重复错误面板。

2. **显示层兜底**
   - 后端 `buildPreferOffCalendarEvents` 按 `tier + date` 去重，避免重复 `day_off_bid` 输出。
   - 前端 mapper 再保留防御：同 tier 同 row 重叠 Off 不应进入第二层 slot。
   - 这样即使数据库存在旧脏数据，左侧小日历也不会变形。

3. **共享小日历一致性**
   - Pairing / Dashboard / Days Off 最终展示都以 `bidding-calendar` 结果为基线。
   - Days Off 页面本地 editable overlay 只用于“用户正在编辑后立即反馈”的场景，并且必须与后端展示去重规则一致。
   - 页面切换时不因为进入 Days Off 就强制改用一套不同的最终显示逻辑。

4. **事件类型命名收敛**
   - 更新 `packages/contracts/pbs-bidding-calendar.*` 中的 event type union。
   - 后端生成 Prefer Off 事件时输出 `type: "prefer_off_bid"`。
   - 前端 mapper、blocking helper、测试 fixture 都改读 `prefer_off_bid`。
   - 不新增旧 `day_off_bid` alias，避免新旧语义继续混在一起。

## 备选方案与取舍

方案 A：只在前端 calendar mapper 去重。  
优点是改动小；缺点是保存层继续允许坏数据，后端 API 仍输出重复业务事件，不符合防呆要求。

方案 B：只在后端 `bidding-calendar` 去重。  
优点是 Pairing / Dashboard 强刷问题会消失；缺点是 Days Off 保存时仍允许用户制造重叠条件，后续右侧属性仍会混乱。

方案 C：保存层防呆 + 后端输出去重 + 前端显示兜底。  
这是推荐方案。它同时解决“不能保存错误条件”和“历史脏数据不能弄坏 UI”。

## 设计细节

### Prefer Off 日期展开

需要复用或补齐统一 helper，确保前后端对 Prefer Off 日期理解一致：

- 单个 ISO 日期：`2026-04-19`
- 逗号分隔日期列表：`2026-04-19,2026-04-20`
- 范围：`Between 2026-04-19 - 2026-04-22`
- 如果当前业务支持 weekday / weekends 展开，则按当前 bid period 展开为具体日期后参与重叠检查。
- `Window 09:46-09:58` 这类 modifier 不是独立休息日期，不影响日期重叠判断。

### 保存校验

- 对当前 draft 中所有 `Prefer Off` property，按 property group 展开出 `{ propertyGroupKey, tiers, dates }`。
- 新增时，与现有 property 比较。
- 编辑时，排除自身 propertyGroupKey 后再比较。
- 只阻止同 tier 同 date 重叠；不同 tier 可以选择同一天。
- 错误提示应指出冲突 tier 和日期，便于用户修改。

### 小日历展示一致性

- 后端 `bidding-calendar` 输出前按 `tier + date` dedupe `prefer_off_bid`。
- 前端 `buildDashboardScheduleDataFromBiddingCalendar` 增加重叠 Off 测试：即使输入有两条相同或交叠 Off，也只输出一条视觉事件。
- Days Off 页面不应因为本地 overlay 和 `bidding-calendar` 同时存在而产生另一套最终视觉规则。
- 进入 Days Off 时可刷新右侧 Days Off data，但左侧小日历应保持共享组件行为，不出现“Days Off 正常、Pairing 不正常”的分叉。

### Contract 命名变更

- `day_off_bid` 改名为 `prefer_off_bid` 是 API contract 层面的破坏性命名收敛，但当前判断 PBS 尚未上线，且旧 `calendar-days-off` 链路已在上一轮清理，因此不保留兼容别名。
- 改名范围只限 bidding calendar event type，不恢复、不读取、不迁移旧 `pbs_bid_day_off`。
- 文档和测试中如果引用历史旧链路，可保留历史说明；运行时代码和新测试应使用 `prefer_off_bid`。

## 不做范围

- 不改数据库 schema。
- 不迁移历史数据。
- 不删除已有合法 Prefer Off 条件。
- 不改变 Pairing bid 保存流程。
- 不改左侧小日历视觉样式，只修数据一致性、防呆和重复渲染。

## 验收标准

1. 3002 账号强制刷新 `/days-off`、`/pairing`、`/dashboard` 后，左侧小日历 4/19-4/22 都只显示一条连续 Off。
2. 同 tier 下，新增一个与已有 Prefer Off 日期重叠的 Prefer Off 时保存失败，并显示统一 message。
3. 编辑 Prefer Off 导致与另一个 Prefer Off 重叠时保存失败。
4. 不同 tier 选择同一天 Prefer Off 仍允许。
5. 历史重复数据不会让小日历出现上下两层 Off。
6. 右侧 Days Off 数据刷新不导致左侧共享小日历切换为另一套不一致展示。
7. Network 中不出现旧 `/api/calendar-days-off/*`。
8. 运行时代码和新 contract 中不再使用 `day_off_bid` 作为 Prefer Off 日历事件类型，改为 `prefer_off_bid`。

## 自动化测试计划

- 后端 Days Off validation：
  - 日期列表 vs 日期范围重叠，同 tier 拒绝。
  - 编辑自身不误判；编辑后与其他 property 重叠时拒绝。
  - 不同 tier 同日期允许。
- 后端 bidding calendar：
  - 重叠 Prefer Off rows 只输出一组 `tier + date` 的 `prefer_off_bid`。
  - contract 输出事件类型为 `prefer_off_bid`。
- 前端 mapper：
  - 输入重复 / 重叠 `prefer_off_bid`，输出只保留一条连续 Off bar，不产生第二层 slot。
  - 旧 `day_off_bid` 不再作为新 fixture 或 mapper 主路径。
- 页面测试：
  - Days Off / Pairing / Dashboard 使用一致 calendar 数据结果。
  - Days Off 右侧刷新不会让左侧小日历与其他页面分叉。

## 回归验证计划

- `pnpm --dir pbs-server test`
- `pnpm --dir pbs-server build`
- `pnpm --dir pbs-portal test`
- `pnpm --dir pbs-portal lint`
- `pnpm --dir pbs-portal build`
- `git diff --check`
- 浏览器手工回归：
  - 3002 强制刷新 `/days-off`
  - 3002 强制刷新 `/pairing`
  - 3002 强制刷新 `/dashboard`
  - 检查 4/19-4/22 和 4/30 Off 展示一致、无双层 Off

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是同一条 Days Off 保存校验和共享 calendar 展示链路，前后端 contract、mapper、页面刷新策略强相关；拆分容易继续漏掉同一个边界条件。
- Suggested split: 不拆分，由主 agent 顺序完成后端校验、后端 dedupe、前端 mapper 兜底、页面测试和浏览器回归。
- Write boundaries: `pbs-server/src/services/days-off/`、`pbs-server/src/services/calendar/`、`pbs-portal/src/features/dashboard/`、`pbs-portal/src/features/days-off/` 及相关测试。
- Conflict risk: Medium。当前工作树已有上轮 Days Off / calendar 清理改动，实施时必须避免回滚已有未提交内容。
- Execution gate: 用户确认本 spec 后再开始写代码。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
