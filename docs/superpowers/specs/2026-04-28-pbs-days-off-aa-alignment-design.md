# PBS Days Off AA 对齐补齐设计

日期：2026-04-28
作者：Codex
状态：已确认，待实现

## 背景

当前 `pbs-portal` 的 `/days-off` 已经具备真实主链路：

- 左侧共享 `BIDDING CALENDAR` 可以按当前 layer 点选具体休息日，并保存到 `pbs_bid_day_off`。
- 右侧 `EXISTING DAYS OFF PROPERTIES` 可以读取、添加、删除、修改通用 Days Off properties，并保存到 `pbs_bid_group`。
- 后端已经通过 `GET/PUT /api/days-off-bids/current` 和 `GET/PUT /api/calendar-days-off/current` 串到同一份 Lineholder Current draft。

但和 AA《Flight Attendant PBS Guide》里的 Days Off Tab 相比，目前仍是 MVP 骨架，不是完整语义：

- 右侧属性目录不是 AA Days Off Tab 的完整目录。
- 月历点选是直接 toggle，不是 AA 的 `ADD BID / DELETE BID` 交互。
- 缺少同层互斥、单次使用、persistent、restrictive 等规则校验。
- `all_or_nothing` / `minimum_n` 等 modifier 尚未读写。

## 本轮确认范围

本轮只补齐 `/days-off` 页面本身，聚焦 Lineholder Current Bid。

包含：

- Days Off 属性目录对齐 AA Days Off Tab。
- 左侧月历具体 Days Off 点选交互对齐 AA 主体验。
- Days Off 页面相关规则校验。
- 相关前后端数据结构和测试。

暂不包含：

- `Layer` 页面展示优化。
- `Reserve Days Off`。它属于 AA Reserve Tab，不属于本轮 `/days-off`。
- `Standing Bid Days Off`。它属于 AA Standing Bid Tab，不属于本轮 `/days-off`。
- 最终 PBS award 计算。
- `Default` bid。
- `Submit` / 锁定 / award result。

## AA 目标语义

### 1. Days Off Tab 的职责

AA 文档中 Days Off Tab 是 Lineholder 的休息日偏好页面。它有两个层面的能力：

- 月历上点具体日期，表达“这一天我想休”。
- 右侧 Days Off properties，表达“我希望系统怎样安排休息日结构”。

重要区别：

- 具体日期点选会影响用户希望休哪几天。
- 通用 Days Off properties 不改变 pairing pool，而是影响 pairings 如何被放进月度 schedule。

### 2. AA Days Off 属性目录

本轮应将 `/days-off` 右侧属性目录对齐到 AA Days Off Tab 主目录：

| AA 属性 | 类型 | 主要输入 | 备注 |
| --- | --- | --- | --- |
| `Minimum Days Off Between Work Blocks` | 数值 | 1-12 天 | 后续 layer 不能比前面更严格，除非 Clear Bids |
| `Maximize Weekend Days Off` | 开关 | 无 | 同层不能和其他 maximize/string 类混用 |
| `Maximize Total Days Off` | 开关 | 无 | 同层不能和其他 maximize/string 类混用 |
| `Maximize Block of Days Off` | 开关 | 无 | 同层不能和其他 maximize/string 类混用 |
| `String of Days Off Starting on Date` | 日期 | start date | 单层只能用一次，不能和 ending 同层混用 |
| `String of Days Off Ending on Date` | 日期 | end date | 单层只能用一次，不能和 starting 同层混用 |
| `Waive Minimum Days Off` | 开关 | 无 | persistent，后续 layer 生效直到 Clear Bids |

当前代码中的 `Prefer Off On Day of Week`、`Prefer Off Weekends`、`Prefer Consecutive Days Off`、`Prefer Off Period`、`Maximum Working Days Before Off` 需要按 AA 目录重新评估：

- 与 AA 正文一致的，迁移成 AA 名称和输入模型。
- 不属于 AA Days Off Tab 正文主目录的，先不展示在 `/days-off` 主目录。
- 与 `Reserve` 或 `Standing Bid` 更贴近的，暂缓到对应页面。

### 3. 月历点选 Days Off

AA 交互要求：

- 用户点击某个日期后，不应直接静默 toggle。
- 页面应出现轻量操作面板或 popover。
- 如果该日期当前 layer 尚未 bid off，显示 `ADD BID`。
- 如果该日期当前 layer 已 bid off，显示 `DELETE BID`。
- 用户点击确认后再保存。
- 用户可以点击 weekday header，例如 `SAT`，批量为当前 layer 添加当月所有 Saturday。

本轮可以沿用当前左侧共享 calendar 的布局，不重做视觉框架，只补交互语义。

## 分阶段实施方案

采用用户确认的方案 B：两步补齐。

### 第一步：主体验补齐

第一步目标是让 `/days-off` 页面看起来、用起来接近 AA 主流程，并防止最明显的冲突。

包含：

1. 替换 Days Off 属性目录为 AA 主目录。
2. 为每个 AA 属性定义前端 `defaultBid` 与后端序列化模型。
3. 支持无参数 property，例如 `Maximize Weekend Days Off`。
4. 支持单日期 property，例如 `String of Days Off Starting on Date`。
5. 支持 `Minimum Days Off Between Work Blocks` 的 1-12 数值输入。
6. 月历日期点击改为 `ADD BID / DELETE BID` 确认交互。
7. 支持点击 weekday header 批量添加当前 layer 的所有同星期日期。
8. 添加基础规则校验：
   - 同层 maximize/string 类互斥。
   - `Minimum Days Off Between Work Blocks` 每层最多一次。
   - `String of Days Off Starting on Date` 每层最多一次。
   - `String of Days Off Ending on Date` 每层最多一次。
   - `String of Days Off Starting on Date` 和 `String of Days Off Ending on Date` 不能同层共存。

第一步暂不做：

- `Waive Minimum Days Off` persistent 的跨 layer 生效展示。
- `Minimum Days Off Between Work Blocks` 跨 layer restrictive 校验。
- `Clear Bids` 对上述规则的重置影响。
- `all_or_nothing` / `minimum_n` modifier。

### 第二步：深层规则补齐

第二步目标是补 AA 里跨 layer、持久化和 modifier 语义。

包含：

1. `Waive Minimum Days Off` persistent：
   - 某 layer 启用后，对后续 layer 持续生效。
   - 页面需要能提示该 waiver 来自哪个 layer。
2. `Minimum Days Off Between Work Blocks` restrictive：
   - 如果前面 layer 已设置更低/更宽松的值，后续 layer 不能设置更严格值。
   - 除非后续实现 `Clear Bids` 并在该 layer 之前清除。
3. `Clear Bids` 关联：
   - 如果当前系统已有或后续补 `Clear Bids` property，需要让它重置 persistent/restrictive 继承链。
4. `all_or_nothing` / `minimum_n`：
   - 读写 `pbs_bid_group.all_or_nothing`。
   - 读写 `pbs_bid_group.minimum_n`。
   - 为需要 modifier 的 property 提供 UI 控件。

## 推荐数据设计

### 1. 属性定义

继续使用 `pbs_bid_property` 作为稳定属性定义来源，但需要补齐/调整 Days Off property code。

确认采用“AA 新目录 + Legacy 旧数据并存”策略：

- AA 新 Days Off 属性使用新编号，不覆盖旧 `201-206`。
- 旧 `201-206` 保留 legacy 含义，用于后续导入和回显真实历史 bid 数据。
- `/days-off` 新增属性列表默认展示 AA 新目录。
- 如果后续导入旧数据，旧 `201-206` 需要能被读取和回显，不能被错误解释成 AA 新目录。
- 后续如需把 legacy Days Off 规则转换为 AA 新规则，应单独设计迁移/转换工具，不在本轮硬覆盖。

建议新增一组 AA 对齐 code，并在代码 contract 中显式维护支持目录：

| 建议 code | 名称 |
| --- | --- |
| 211 | `Minimum Days Off Between Work Blocks` |
| 212 | `Maximize Weekend Days Off` |
| 213 | `Maximize Total Days Off` |
| 214 | `Maximize Block of Days Off` |
| 215 | `String of Days Off Starting on Date` |
| 216 | `String of Days Off Ending on Date` |
| 217 | `Waive Minimum Days Off` |

说明：

- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 中 `crew_bids` 已包含大量 DaysOff legacy 数据，且 `201-206` 都被真实使用。
- 因此不能将旧 `201-206` 直接覆盖成 AA 新含义。
- 新 AA code 默认展示在 `/days-off` 可添加目录中。
- 旧 legacy code 默认不出现在新增目录里，但当 draft/import 数据包含旧 code 时，应能回显。

### 2. Bid 值模型

当前通用 `RuleBidValue` 已支持大多数输入，但缺少无参数开关类型。

建议扩展：

- `none` 或 `flag`：用于无输入 property，例如 maximize 和 waive。
- `date`：用于单日期 property。
- 继续保留 `stepper`：用于 `Minimum Days Off Between Work Blocks`。

序列化建议：

| 类型 | operator | param_a | param_b | param_c |
| --- | --- | --- | --- | --- |
| `stepper` | `=` 或 null | 数字 | null | null |
| `date` | `=` 或 null | `YYYY-MM-DD` | null | null |
| `flag` | null | null | null | null |

### 3. 月历具体 Days Off

继续使用 `pbs_bid_day_off`：

- `bid_id`
- `layer_id`
- `layer`
- `bid_date`
- `request_type = DAY_OFF`

第一步不需要改表结构。

但保存前需要校验：

- 日期必须在当前 period 内。
- layer 必须为 `L1-L7`。
- 批量 weekday 添加时不能重复插入相同日期。

## 前端设计

### 1. `/days-off` 右侧属性区

继续复用 `RuleBidRightPanel`，但需要补控件能力：

- 支持无参数 `flag` bid 显示为只读短标签或开关。
- 支持单日期 `date` bid。
- 对 AA 属性展示更清晰的名称。
- 添加/删除/修改后继续使用现有 debounce 保存。

校验错误展示：

- 如果用户做出同层冲突选择，不应静默保存。
- 可以在右侧 panel 顶部显示错误摘要。
- 对具体冲突 property 行显示轻量错误文本。

### 2. 左侧月历

当前 `DashboardSchedulePanel` 是跨 `/days-off`、`/pairing`、`/line` 共享的 workbench 左侧区域。本轮不重做布局，但要补 Days Off 操作：

- 点击日期打开 popover。
- popover 内容根据当前 layer 和该日期状态显示：
  - `ADD BID`
  - `DELETE BID`
  - `Cancel`
- 点击 weekday header 时打开确认 popover：
  - `ADD ALL SATURDAY BIDS`
  - `Cancel`
- 成功操作后沿用当前 autosave 到 `calendar-days-off/current`。

为了避免影响 Pairing/Line 页面，本轮需要控制交互生效范围：

- 如果当前 route 是 `/days-off`，启用 AA popover。
- 其他共享 workbench 页面先只读展示，不允许编辑 Days Off。
- 这样避免用户在 `/pairing` 或 `/line` 页面误以为自己正在编辑 Pairing/Line，却实际改了 Days Off。

## 后端设计

### 1. `days-off-bids` 保存校验

后端必须补与前端一致的基础校验，不能只靠 UI：

- Unsupported property code 返回 400。
- 同层 maximize/string 类互斥返回 400。
- 单层只能使用一次的 property 重复返回 400。
- Starting 和 Ending 同层共存返回 400。
- `Minimum Days Off Between Work Blocks` 范围限制为 1-12。
- 日期型 property 必须是有效日期。

第二步再补：

- persistent 校验。
- restrictive 校验。
- `Clear Bids` 继承链。
- modifier 字段读写。

### 2. `calendar-days-off` 保存校验

后端需要补：

- layer 范围限制为 L1-L7。
- 日期必须在当前 period 内。
- 每个 layer 日期去重。
- 本轮不对 Lineholder `/days-off` 月历点选套用“每层最多 12 天”限制。
- “每层最多 12 天”属于 Reserve Days Off 语境，后续在 `/reserve` 中单独处理。

## 错误处理

- 前端本地校验失败：不发请求，显示可读错误。
- 后端校验失败：显示后端 message，不丢失用户当前编辑内容。
- 保存并发冲突 409：沿用现有 `Current draft has changed. Please refresh before saving again.`，后续可做更友好的刷新提示。
- 月历保存失败：保留当前 UI 状态并显示错误，避免用户误以为保存成功。

## 测试计划

### 前端测试

更新或新增：

- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.test.tsx`
- `pbs-portal/src/features/dashboard/calendar-days-off-mappers.test.ts`

覆盖：

- AA 属性目录展示。
- 添加 `Minimum Days Off Between Work Blocks` 并保存。
- 添加 `Maximize Weekend Days Off` 无参数属性并保存。
- 添加 `String of Days Off Starting on Date` 日期属性并保存。
- 同层互斥时显示错误且不保存。
- 日期点击出现 `ADD BID / DELETE BID`。
- weekday header 批量添加当前 layer 的所有同星期日期。
- 非 `/days-off` 页面不误触发 Days Off popover。

### 后端测试

更新或新增：

- `pbs-server/src/routes/days-off-bids.test.ts`
- `pbs-server/src/routes/calendar-days-off.test.ts`
- 如有服务层测试，补 `days-off-bid-service` 和 `calendar-days-off-service`。

覆盖：

- 新 AA property code 保存和回显。
- 无参数 flag property 序列化/反序列化。
- 日期 property 序列化/反序列化。
- 同层互斥校验。
- 单层唯一校验。
- invalid layer/date 拒绝。

## 验收标准

第一步完成后：

1. `/days-off` 右侧属性目录显示 AA Days Off Tab 主目录。
2. 用户可以添加、删除、修改 Days Off properties，并保存回显。
3. 无参数属性和单日期属性都有合适控件。
4. 点击月历日期不会直接静默 toggle，而是通过 `ADD BID / DELETE BID` 确认。
5. 点击 weekday header 可以批量添加当前 layer 的所有同星期日期。
6. 明显同层冲突会被拦截，前后端都不能保存非法组合。
7. 不影响 `/pairing`、`/line`、`/reserve` 页面现有基础加载。

第二步完成后：

1. `Waive Minimum Days Off` 具备 persistent 语义。
2. `Minimum Days Off Between Work Blocks` 具备跨 layer restrictive 校验。
3. `Clear Bids` 能正确重置 persistent/restrictive 继承。
4. `all_or_nothing` / `minimum_n` 能读写并回显。

## 已确认决策

1. AA 新目录使用新 code，建议 `211-217`；旧 `201-206` 保留 legacy 含义，用于后续真实历史 bid 导入和回显。
2. Lineholder `/days-off` 月历点选不限制每层最多 12 天；该限制留给后续 Reserve Days Off。
3. 月历 Days Off 编辑只在 `/days-off` 页面开放；`/pairing`、`/line` 等共享 workbench 页面先只读展示。
