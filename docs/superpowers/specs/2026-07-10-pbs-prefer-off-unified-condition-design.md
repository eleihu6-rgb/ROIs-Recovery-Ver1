# PBS Days Off — Prefer Off 统一条件接入设计

日期：2026-07-10  
状态：待用户确认  
设计稿：`.superpowers/brainstorm/97925-1783664400/prefer-off-interactive-v15-tier-empty-state.html`  
替代设计：`docs/superpowers/specs/2026-07-08-pbs-days-off-prefer-off-entry-simplification-design.md`

## 1. 背景与需求来源

客户在 `init-docs/Bidding Options V1(2).xlsx` 中对 `Prefer Off` 的原始要求为：

- Purpose：`Crew bids to avoid working specific days or periods.`
- Required Fields：`Date, date range, day of week, weekends, time window, all-or-nothing, minimum required, maximum required`
- Rules：`Weekend definition needs confirmation: Friday 0000 through Sunday 2400. If no time window is entered, default needs to be defined.`
- Notes：`Combines current prefer off, days off pattern, min consecutive days off in window where possible.`

2026-07-08 的实现曾把 `201 Prefer Off` 拆成 `Dates / Days of Week / Date Range` 三个外部入口，并隐藏 Weekends、Time Window 和 fulfilment modifiers。经过本轮逐项设计确认，产品方向改为：

- 恢复一个清晰的 `Prefer Off` 入口；
- 在同一弹窗内选择四种 Prefer Off 类型；
- 通过条件显示、合法选项范围和按钮禁用实现“防呆”；
- 保留 Tier、Time Window 和 Fulfilment，但减少层级、小字和卡片嵌套。

本设计正式替代 2026-07-08 的入口简化方案。V15 用于确认布局、条件显示和 Tier 空状态；如果原型脚本的瞬时初始状态与本文冲突，业务默认值以本 spec 为准：Fulfilment 的唯一默认值是 `All selected periods`。该默认值也符合用户在原型讨论中的明确确认。

## 2. 现状核查

### 2.1 前端

- 当前入口和编辑弹窗位于 `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`。
- 当前弹窗已经复用 Portal 的白色轻量弹层 `PbsDialogFrame`。
- `PbsDialogFrame` 被 12 个业务弹窗直接复用；GitNexus 影响分析为 **CRITICAL**。本功能只调用它，不修改它。
- 当前 201 仅支持：
  - 具体日期；
  - 星期；
  - 日期范围；
  - Tier 至少保留一个的旧保护逻辑。
- 当前前端会强制把 201 的 `allOrNothing` 重置为 `false`、`minimumN` 重置为 `null`。
- 当前 `PortalDatePicker` 是单日期选择器，已有 `document.body` portal 和上下方自适应定位能力，但不支持多选或 RangePicker 行为。

### 2.2 后端与数据库

- `propertyCode=201` 已经是正式的 `Prefer Off` 后端属性，无需新增 property code。
- 当前 Days Off contract 只有：
  - `bid`
  - `tiers`
  - `allOrNothing`
  - `minimumN`
- `pbs_bid_group` 已有：
  - `all_or_nothing`
  - `minimum_n`
  - `limit_n`（现有注释是“最多 N 个”）
- `pbs_bid_days_off_favorite` 只有 `all_or_nothing` 和 `minimum_n`，没有最大数量字段。
- 现有序列化已经能保存 `Window HH:MM-HH:MM` tag，但当前 UI 会在重新保存 201 时丢弃它。
- 远端 F8 `dictionary` 当前只有 `DOW` 的 Monday-Sunday 七条数据，没有 Weekend 定义。

### 2.3 算法边界

当前 `pbs-server/src/services/algorithm-export/days-off-export.ts`：

- 会把具体日期、日期范围、星期和 `Weekends` 展开为日期；
- 把 `Weekends` 硬编码为 Saturday + Sunday；
- 明确跳过 `Window HH:MM-HH:MM`；
- 不导出 `all_or_nothing`、`minimum_n` 或最大数量；
- 当前本地 `pbs-engine/` 子模块未初始化，无法在本仓库直接验证求解器对 fulfilment 的消费契约。

因此，不能只把 Time Window / Flexible quantity 显示出来就宣称它们会影响求解结果。

## 3. 目标

1. Days Off 中用一个 `Prefer Off` 入口承载四种选择模式。
2. 复用现有 `PbsDialogFrame`，落地 V15 的扁平布局与交互。
3. 让日期、Tier、数量关系在输入时自动保持合法，避免依赖保存后的错误提示。
4. 后端完整保存并回显 Time Window、All/Flexible、Minimum、Maximum，覆盖 Add、Edit 和 Favorite。
5. Weekend 定义从 F8 `dictionary` 读取，Portal 与服务端使用同一来源。
6. 保持既有 201 草稿、收藏和导入数据可读取、可编辑。
7. 明确区分“已保存的申请语义”和“已被当前求解器执行的语义”。

## 4. 非目标

- 不新增新的 Prefer Off property code。
- 不修改共享 `PbsDialogFrame` 的行为或样式。
- 不重构 Pairing、Reserve、Line、Standing Bid 的弹窗。
- 不在本轮改变所有 Portal 日期选择器；新增行为只服务于 Prefer Off。
- 不把零 Tier 解释成“全部 Tier”。
- 不在缺少 active `pbs-engine` 契约和验证基线时声称 Time Window / Fulfilment 已被求解器执行。
- 不在本轮合并或删除 202/203/204/205 等其他 Days Off property；本轮只处理 201 的用户入口与契约。

## 5. 用户入口与弹窗容器

### 5.1 Add Properties

- Catalog 中只显示一个用户入口：`Prefer Off`。
- 移除当前前端生成的 `Dates / Days of Week / Date Range` 三个 alias。
- 仍保存为 `propertyCode=201`。
- Existing 和 Favorite 统一显示为 `Prefer Off`，具体模式放在 bid 摘要中表达。

### 5.2 弹窗容器

- 继续使用 `PbsDialogFrame`。
- 标题：`Configure Prefer Off`。
- 副标题：`Choose when you prefer not to work.`。
- 底部按钮：`CANCEL`、`SAVE FAVORITE`、`ADD BID`；编辑场景沿用现有 confirm label。
- 内容使用扁平分区，不出现“卡片套卡片”。
- 不修改 `PbsDialogFrame`，避免扩大 CRITICAL 共享组件影响面。

## 6. 详细交互

### 6.1 Tiers

- 新增 Prefer Off 时默认选中 T1。
- 用户可以取消最后一个已选 Tier。
- 选中 0 个 Tier 时：
  - 标签显示 `TIERS · REQUIRED`；
  - `SAVE FAVORITE` 和 `ADD BID` 禁用；
  - 不弹出提示，不自动重新选中 T1；
  - 重新选择任意 Tier 后按钮自动恢复。
- 编辑既有 bid 时按已保存 Tier 回显，不擅自补 T1。
- 服务端仍执行“至少一个 Tier”的最终校验，防止绕过前端提交。

### 6.2 Prefer Off Type

弹窗内提供四个互斥模式：

1. `Specific Dates`
2. `Date Range`
3. `Days of Week`
4. `Weekends`

新增 bid 默认进入 `Specific Dates`。切换模式时，各模式的临时输入在当前弹窗会话中保留；最终只提交当前模式的数据，避免多个模式混合成难以解释的 tag-list。

### 6.3 Specific Dates

- 使用 Ant Design multiple DatePicker 类似行为，但不引入 Ant Design 依赖。
- 点击日期后立即加入，不显示 `ADD DATE` 按钮。
- 已选日期作为 field 内的 tags 展示。
- 可逐个移除，也可 Clear All。
- 再次点击已选日期即取消选择。
- 同一日期不会重复。
- 日历通过 `document.body` portal 渲染，按视口空间自动显示在输入框上方或下方，不被 dialog 的 overflow 裁剪。
- 提交形式继续兼容现有 tag-list：`["2026-06-16", "2026-06-17"]`。

### 6.4 Date Range

- 使用 Ant Design RangePicker 类似的一个组合输入框，不显示两个分离输入框。
- 第一次点击设置起点，第二次点击设置终点。
- 选择反向终点时自动排序为较早日期到较晚日期。
- 日历高亮完整的包含式范围。
- 已完成范围可清除并重选。
- 提交形式保持兼容：`["Between YYYY-MM-DD - YYYY-MM-DD"]`。

### 6.5 Days of Week

- Monday-Sunday 以可多选按钮展示。
- 至少选择一个星期后才能提交。
- 星期名称和顺序使用现有 `DOW` dictionary 数据，不在新代码中另写一套业务枚举。
- 服务端随 `preferOffConfig.weekdays` 返回规范化的 `{ code, name, order }[]`；Portal 不直接连接 live schema。
- 提交形式保持兼容：`["Monday", "Friday"]`。

### 6.6 Weekends

- UI 提交稳定标记：`["Weekends"]`。
- Weekend 的实际定义不由前端硬编码。
- F8 `dictionary` 新增以下幂等配置：

| parent_code | code | code_value | 初始值 |
|---|---|---|---|
| `null` | `PBS_PREFER_OFF` | 配置分组 | `null` |
| `PBS_PREFER_OFF` | `WEEKEND_START_DOW` | 星期代码 | `FRI` |
| `PBS_PREFER_OFF` | `WEEKEND_START_TIME` | 本地时间 | `00:00` |
| `PBS_PREFER_OFF` | `WEEKEND_END_DOW` | 星期代码 | `SUN` |
| `PBS_PREFER_OFF` | `WEEKEND_END_TIME` | 本地时间 | `24:00` |

- 初始语义为 Friday 00:00 through Sunday 24:00。
- 服务端读取并校验配置，通过 Days Off current draft response 返回规范化的 `preferOffConfig.weekend`。
- 配置缺失或非法时，不回退到代码硬编码的 Sat/Sun：Weekends 模式显示为不可用，其他三种模式仍可使用；服务端拒绝新的 Weekends 保存并返回明确配置错误。

### 6.7 Time Window

- Time Window 是可选 switch，默认关闭。
- 关闭时表示整个选中日期/星期周期；不提交 `Window` tag。
- 开启后显示 `From` / `To` 时间输入，并提交 `Window HH:MM-HH:MM`。
- 防呆规则：
  - 两个时间都必须存在；
  - 本轮只支持同一自然日内的窗口，`From < To`；
  - 不接受跨夜窗口；
  - 无效时保存按钮禁用，服务端同时拒绝。
- 对 `Specific Dates`、`Date Range`、`Days of Week`：窗口应用到展开后的每个自然日。
- 对 `Weekends`：
  - Time Window 关闭时，使用 dictionary 定义的完整 Weekend block；
  - Time Window 开启时，窗口应用到 Weekend block 覆盖的每个自然日；
  - period count 仍按 Weekend block 数量计算，不按自然日数量计算。

### 6.8 Fulfilment

- Fulfilment 是必有语义，因此不做折叠卡片。
- 当实际可选 period count 为 0 或 1 时，整个 Fulfilment 区域隐藏；此时 All/Flexible 没有实质差异。
- 当 count 从 >=2 降为 0/1 时，最终 payload 统一归一化为 All：`allOrNothing=true, minimumN=null, maximumN=null`。当前弹窗会话仍可暂存原 Flexible 数字；count 再升回 >=2 时恢复，但只要提交时 count <=1 就不得写出 Flexible。
- 当 period count >= 2 时始终显示：
  - 默认 `All selected periods`；
  - 可切换 `Flexible quantity`。
- All/Flexible 使用一个扁平 Segmented selector，不使用两个卡片。
- `All selected periods`：
  - 保存为 `allOrNothing=true`；
  - `minimumN=null`；
  - `maximumN=null`。
- `Flexible quantity`：
  - 保存为 `allOrNothing=false`；
  - 显示 `Minimum required` 和 `Maximum required`；
  - 使用 Ant Design InputNumber 类似的标准数字输入框和 stepper 行为；
  - 两个输入框相邻排列，保持为一组，不做过宽分散布局。
- 切回 All 时隐藏数字输入，但保留本次编辑会话中的数字；再次切回 Flexible 可恢复。最终提交 All 时仍清空 min/max。
- 防呆边界：`1 <= minimumN <= maximumN <= availablePeriodCount`。
- 当选择内容变化导致 period count 变小时：
  - 自动 clamp maximumN 到新的 count；
  - 自动 clamp minimumN 不超过 maximumN；
  - 下拉/stepper 不提供非法值。

## 7. Period count 定义

Time Window 不改变 period count。

| 模式 | availablePeriodCount |
|---|---|
| Specific Dates | 去重后的已选日期数 |
| Date Range | From 到 To 的包含式自然日数量 |
| Days of Week | 当前 bid `periodCode` 对应月份中，所选星期实际出现的总次数 |
| Weekends | 当前 bid period 中，按 dictionary 定义识别出的 Weekend block 数量 |

Specific Dates 和 Date Range 的新选择必须完整落在当前 bid period 内；日历禁用 period 外日期，服务端也拒绝新写入的 period 外日期。旧数据如果包含 period 外日期，可以打开和删除，但保存按钮保持禁用，直到用户修正，禁止静默裁剪。

Weekend 只统计完整落在 bid period 内的 block。月初/月末被 period 边界截断的半个 Weekend 不计数、也不导出到相邻月份。Portal count、服务端 validation 和 algorithm export 必须共用同一个纯 period/block 展开函数，固定相同的边界语义。

如果 `periodCode` 不能解析成有效月份，Days of Week / Weekends 的 count 视为不可计算，保存按钮禁用；不使用系统当前月份代替。

## 8. Contract 与持久化

### 8.1 Contract 扩展

Days Off property、mutation 和 favorite contract 增加：

```ts
maximumN?: number | null
```

Current draft response 增加只读配置：

```ts
preferOffConfig?: {
  weekdays: Array<{
    code: string
    name: string
    order: number
  }>
  weekend: {
    available: boolean
    startDayCode?: string
    startDayName?: string
    startTime?: string
    endDayCode?: string
    endDayName?: string
    endTime?: string
  }
}
```

所有新增字段保持 optional/null 兼容旧客户端与旧数据。部署顺序为 dictionary migration → pbs-server → pbs-portal。新 Portal 遇到旧 server 未返回 `preferOffConfig` 时，不使用前端硬编码兜底：`Days of Week` 与 `Weekends` 暂时不可选，`Specific Dates` 与 `Date Range` 仍可使用。

服务端新增一个只读 Prefer Off 配置加载器：一次读取 `DOW` 和 `PBS_PREFER_OFF`，完成结构校验与 day-code 关联，再把同一个规范化结果传给 current draft response、201 validation 和 algorithm export。校验纯函数本身不直接查数据库，避免三条路径各自实现或在循环内产生查询。

### 8.2 Current draft

- `allOrNothing` 映射现有 `pbs_bid_group.all_or_nothing`。
- `minimumN` 映射现有 `pbs_bid_group.minimum_n`。
- `maximumN` 映射现有 `pbs_bid_group.limit_n`；它在 Prefer Off 语境中解释为“最多满足的 selected periods”。
- 不为 current draft 新增重复的 `maximum_n` 列。
- 同一个增量 migration 更新 `pbs_bid_group.limit_n` 的 column comment，明确它是按 bid type 解释的通用 maximum：Pairing 表示最多 pairing 数，201 Prefer Off 表示最多 selected periods。既有非 201 读写逻辑不改变，并增加回归测试。
- Time Window 继续随 `bid` 序列化到 `param_a` 的 `Window HH:MM-HH:MM` tag，避免拆出新的时间列和破坏旧解析器。

### 8.3 Favorite

`pbs_bid_days_off_favorite` 增加 nullable `maximum_n smallint`，并同步：

- Drizzle model；
- read/write mapper；
- contract；
- focused persistence tests。

Migration 必须幂等，只修改增量 migration，不回改已确认的历史建表脚本。

### 8.4 旧数据兼容

- 旧 `Weekends` tag 保持可读，但其新计数和解释使用 dictionary，不再按 Sat/Sun 硬编码。
- 旧 `Window HH:MM-HH:MM` 恢复到 Time Window 控件。
- 旧 `allOrNothing=true` 回显为 All。
- 旧 `allOrNothing=false` 且 `minimumN`、`maximumN` 均为空时，回显为 All，避免把历史默认值误判为未配置完整的 Flexible。
- 旧 `allOrNothing=false` 且 `minimumN` 有值时，回显为 Flexible；如果 maximumN 为空，UI 以当前 available count 作为本次编辑默认 maximum，保存后补齐。
- 上述兼容规则也应用于写请求 normalization，而不只应用于数据库 row：
  - 201 的 `false + minimumN/maximumN 均为空或缺失` 按 legacy All 归一化；
  - 201 的 `false + minimumN 有值 + maximumN 缺失` 一律按 legacy Flexible 处理，并以 available count 补 maximum；服务端没有客户端版本字段，因此不按“旧/新客户端”猜测两套规则；
  - 201 的 `false + minimumN 缺失 + maximumN 有值` 拒绝；
  - min/max 同时存在时执行严格边界校验；新 Portal 自身始终提交完整 min/max。
- 旧混合 tag-list（日期、星期、范围同时存在）不自动丢弃：以只读兼容状态打开，要求用户选择一个明确模式后才可重新保存；删除旧 bid 不受影响。

## 9. 服务端防线

`validateDaysOffDraftProperties` 的影响分析为 **HIGH**，涉及 Add、Patch、Favorite 和整份 Draft 保存。实现时只增加 `propertyCode=201` 的窄分支，并验证：

- bid 必须是合法的 Prefer Off tag-list；
- 只允许一个主模式，不允许 dates/range/weekdays/weekends 混合；
- 至少一个主选择；
- 最多一个合法 `Window` tag；
- Tier 非空；
- Weekends 配置可用；
- All 时 min/max 为空；
- Flexible 时 min/max 都存在，且满足数量边界；
- Date Range 顺序有效；
- `periodCode` 可用于需要按月份展开的模式。

所有非法情况返回统一 400 业务错误；dictionary 配置错误返回明确的服务配置错误，不吞掉或偷偷回退。201 validation 接收服务层预先加载的 period/config 参数，不在逐 property 校验循环中查库。

## 10. 求解器与算法导出交付边界

### 10.1 本轮可以完成并验证

- Portal 真实 UI 的完整输入、编辑、Favorite 和防呆行为；
- pbs-server contract、校验和持久化；
- Weekend dictionary 的读取与统一解释；
- 现有具体日期 / 日期范围 / 星期展开保持兼容；
- Specific Dates、Date Range 与完整 Weekend block 的 period 边界在 Portal、validation 和 export 三处一致；
- 201 数据能完整 round-trip，不再丢失 Window / fulfilment。

### 10.2 本轮不能虚假宣称

现有 `DAYS_OFF.csv` 没有 All/Flexible/Minimum/Maximum 列，且当前 exporter 跳过 Window。active `pbs-engine` 源码在本地未初始化，无法证明它会执行这些语义。

因此，本 spec 的实施完成语义是“Prefer Off 条件已接入 Portal 和 PBS 数据层”，不是“求解器已经按 Time Window 和 Flexible quantity 优化”。在求解器契约确定前：

- 不把这些字段加入现有 `DAYS_OFF.csv` 的猜测性列；
- 不改变现有全日 Days Off counter 的含义；
- 发布说明和验收报告必须明确这一边界。

如果本次上线要求终端用户填写后立即影响优化结果，则必须在实施前补充一份 `pbs-engine` 输入/约束设计，并取得可运行子模块或基线；该工作不属于本 spec 当前批准范围。

## 11. 代码范围

预计涉及：

- `packages/contracts/pbs-days-off-bids.d.ts`
- `pbs-portal/src/features/days-off/**`
- `pbs-portal/src/shared/services/days-off-service.ts`
- Prefer Off 专属日期选择 / Range / InputNumber 组件（优先放在 Days Off feature 内）
- `pbs-server/src/routes/days-off-bids.ts`
- `pbs-server/src/services/days-off/**`
- `pbs-server/src/models/pbs/pbs-bid-days-off-favorite.ts`
- `pbs-server/src/services/algorithm-export/days-off-export.ts`（仅移除 Weekend Sat/Sun 硬编码并接入 dictionary；不扩展 solver 字段）
- 一个由 Portal count、server validation、algorithm export 共同验证的纯 period/block 展开模块；如果前后端无法直接共享运行时代码，则共享同一 contract fixtures，并要求相同边界用例逐项对照。
- `sql/migration/**`
- `docs/test-cases/pbs/days-off/**`
- `e2e/tests/pbs-portal/**`

明确不修改：

- `pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx`
- Pairing / Reserve / Line dialog
- `sql/schema/**` 历史建表脚本
- 未初始化的 `pbs-engine/` 子模块

## 12. 测试与验证

### 12.1 Portal component tests

至少覆盖：

- 单一 Prefer Off 入口；
- 四种 mode 切换和 payload；
- multiple dates、range 自动排序、weekday 多选；
- Time Window 开关、回显和非法范围；
- 0 Tier 禁用、恢复；
- count 为 0/1 隐藏 Fulfilment；
- count >=2 默认 All；
- Flexible min/max clamp；
- Add / Edit / Favorite round-trip；
- 旧 201 数据兼容。

### 12.2 Server tests

至少覆盖：

- route schema 接受 `maximumN`；
- add / patch / save draft / favorite 四条链路；
- `maximumN < minimumN`、超过 count、只有 maximumN 等非法结构被拒绝；只有 minimumN 的 legacy 结构自动补 maximumN 并有回归测试；
- Window 合法性；
- Weekend dictionary 正常、缺失和非法；
- `maximumN <-> limit_n` 持久化；
- favorite `maximum_n` 持久化；
- 旧 row 反序列化兼容；
- algorithm export 不再以 Sat/Sun 硬编码解释 Weekends。
- Specific/Range period 外日期被拒绝；月初/月末不完整 Weekend 不计数、不跨月导出；完整 Weekend 的 count 与导出一致。
- 201 `limit_n` 映射不改变非 201 bid 的既有 `limit_n` 语义。

### 12.3 Playwright 真实 UI

新增真实 UI E2E，至少完成：

1. 登录并打开 Days Off。
2. 从唯一 `Prefer Off` 入口打开复用的 Portal dialog。
3. 取消最后一个 Tier，验证 Save/Add 禁用；重新选择后恢复。
4. 分别保存 Specific Dates、Date Range、Days of Week、Weekends。
5. 验证 Time Window 与 Flexible quantity 的 request payload 和重新编辑回显。
6. 验证一个 period 时 Fulfilment 不显示，多个 period 时默认 All。
7. 保存 Favorite，并从 Favorite 再次添加。

### 12.4 人工 QA 文档

新增 `docs/test-cases/pbs/days-off/2026-07-10-prefer-off-unified-condition.md`，记录正常、边界、旧数据和 dictionary 异常用例。

### 12.5 计划新增/更新的测试文件

- `pbs-portal/src/features/days-off/components/prefer-off-editor.test.tsx`
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/shared/services/days-off-service.test.ts`
- `pbs-server/src/services/days-off/days-off-validation.test.ts`
- `pbs-server/src/services/days-off/days-off-draft-mappers.test.ts`
- `pbs-server/src/services/days-off/days-off-persistence-mappers.test.ts`
- `pbs-server/src/routes/days-off-bids.test.ts`
- `pbs-server/src/services/algorithm-export/days-off-export.test.ts`
- `e2e/tests/pbs-portal/days-off-prefer-off.spec.ts`

### 12.6 必跑命令

- `cd pbs-portal && npx vitest run src/features/days-off/components/prefer-off-editor.test.tsx src/features/days-off/pages/days-off-page.test.tsx src/shared/services/days-off-service.test.ts`
- `cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/days-off/days-off-validation.test.ts src/services/days-off/days-off-draft-mappers.test.ts src/services/days-off/days-off-persistence-mappers.test.ts src/routes/days-off-bids.test.ts src/services/algorithm-export/days-off-export.test.ts`
- `npm run check:ui`
- `cd pbs-portal && npm run build`
- `cd pbs-server && npm run build`
- 在 pbs-server `:3002` 和 pbs-portal `:3030` 指向允许破坏性测试的 PBS test DB 后运行：`cd e2e && npm run test:pbs-portal -- --no-deps tests/pbs-portal/days-off-prefer-off.spec.ts --reporter=list`
- 跨 contract 完成后执行 `npm run verify:pbs`
- 全量 PBS E2E 门禁使用 `npm run verify:pbs:e2e`；它目前固定运行 portal smoke，不能替代上面的 Prefer Off 定向 spec。
- 提交前执行 GitNexus `detect_changes` 对比 `main`

## 13. 验收标准

- Days Off Add Properties 只显示一个 `Prefer Off` 入口，不再显示三个 alias。
- 弹窗复用 `PbsDialogFrame`，并与 V15 的扁平布局和交互一致。
- Specific Dates、Date Range、Days of Week、Weekends 均可配置、保存、编辑和收藏。
- 新建 Specific Dates / Date Range 不能选择 bid period 外日期；完整 Weekend block 的 count 与 export 一致，且不会跨月输出。
- 日期弹层不被 dialog 裁剪。
- 最后一个 Tier 可取消；0 Tier 时不允许提交，也不被解释为全部 Tier。
- Time Window 默认关闭；开启后只能提交合法同日窗口。
- available count 为 0/1 时不显示 Fulfilment；>=2 时默认 All。
- Flexible 只能产生 `1 <= min <= max <= count` 的数据。
- Weekend 初始定义来自 F8 dictionary：Friday 00:00-Sunday 24:00；前端和服务端不硬编码 Sat/Sun。
- Add、Edit、Favorite 和重新加载后，Window / All/Flexible / min/max 不丢失。
- 旧 201 数据不因 contract 扩展而崩溃或静默丢失。
- 所有 focused tests、真实 Playwright、build、`check:ui` 和 `verify:pbs` 有明确 PASS 收据。
- 交付说明不把尚未接入的求解器语义描述为已生效。

## 14. 风险与取舍

- **求解器语义风险（高）**：UI/数据层可以完整保存，但当前 exporter 和本地可验证引擎不能执行 Time Window / Fulfilment。通过明确交付边界避免错误承诺；若要求立即影响优化，必须先扩充 engine spec。
- **统一校验风险（高）**：Days Off validation 是四条写入流程的共同入口。只添加 201 窄分支，并覆盖四条流程。
- **共享弹窗风险（Critical）**：不修改 `PbsDialogFrame`。
- **历史数据风险（中）**：过去 UI 会丢弃 modifier。通过显式旧数据解释规则和 round-trip tests 控制。
- **Weekend 定义风险（中）**：现有导出硬编码 Sat/Sun。改为 dictionary 后，必须保证 Portal count、服务端 validation 和 export 使用同一解析器。
- **滚动部署风险（中）**：Portal 依赖新增配置 contract。通过 migration → server → portal 的顺序发布；配置缺失时禁用 dictionary-backed modes，不以硬编码兜底。
- **Schema 迁移风险（低）**：current draft 复用 `limit_n`，只给 Favorite 增加 nullable `maximum_n`，避免在主表重复增加列。

## 15. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽然跨 Portal、contract、server 和 migration，但核心数据契约、201 兼容规则、count 与 validation 高度耦合；多人并行容易在同一 contract 和测试 fixture 上发生冲突。
- Suggested split: 不拆 implementation agent；主 agent 按 contract → server → Portal → E2E 顺序实施，独立 reviewer 只做只读审查。
- Write boundaries: 单 agent 负责上述代码范围；不触碰共享 `PbsDialogFrame` 和其他 bid dialog。
- Conflict risk: 中高，主要集中在 `pbs-days-off-bids.d.ts`、Days Off mappers、dialog 和大体量 page tests。
- Execution gate: 用户确认本 spec，且明确接受“本轮不宣称求解器执行 Time Window / Fulfilment”后，才开始业务代码实施。
