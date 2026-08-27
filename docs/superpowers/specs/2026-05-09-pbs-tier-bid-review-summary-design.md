# PBS Tier Bid Review / Summary 首期设计

## 背景

PBS Portal 当前已经完成 Pairing、Days Off、Line 的核心出价录入和保存链路，`/tier` 页面已有基础 `lineholder summary` 读取能力，但页面仍保留较多 Pairing mock 外壳：

- 标题仍是 `PAIRING STATISTICS / PAIRING SUMMARY / PAIRING PROPERTIES`。
- 表格里有下拉、删除、Tier toggle 等看似可编辑但实际无效的控件。
- 后端 summary 当前更接近扁平 `label + bid + tiers`，还不能完整表达“一个 bid group 多个条件节点”的真实业务形态。

AA Guide 里的 `Layer Tab` 对应本项目 `Tier` 页面。AA 的 Layer Tab 不是新的出价编辑入口，而是用户检查 Lineholder Monthly Bid 的地方：查看每层里有哪些 specific pairings、pairing properties、line properties、days off，并通过统计和空层提示发现 bid 太窄、空层、重复或潜在冲突。

`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 只作为真实旧数据形态参考，不作为导入需求。它说明旧数据中存在：

- `layer` 范围 `1..24`。
- `property_group_id + node_id` 的规则树结构。
- 主节点后可跟多个 `AND` 条件节点。
- 高频真实属性集中在 `Prefer Off`、`Pairing Number`、`Any Landing In Airport`、`Pairing Check-In Time`、`Pairing Total Credit`、`Departing On`、`Max/Min Credit Window`、`Clear Schedule and Start Next Bid Group`。

## 目标

- 把 `/tier` 首期做成 AA Layer Tab 对应的只读 `Bid Review / Summary` 页面。
- 汇总当前 Lineholder Current draft 中的 `Pairing / DaysOff / Line / Calendar` bid。
- 按 `T1-T7` 展示每层 bid 内容和统计。
- 每条 bid 能展示业务可读内容，而不是直接暴露 `param_a / param_b / param_c`。
- 支持一个 bid group 合并展示多个 `AND` 条件节点。
- 清理现有 Tier 页面里的假编辑控件，避免用户误以为可以在 Tier 页面保存、删除或修改。
- 对超出 `T7` 的旧数据做显式兼容提示，不静默丢弃。

## 非目标

- 不做 Excel 导入。
- 不做 Tier 页面内编辑、删除、拖拽、重排或保存。
- 不做真实 Pairing Pool 计算或 `View Pairing Set`。
- 不做 Award Engine。
- 不做 Award Tab / Reason Report。
- 不把 AA 原文 `Layer` 术语带入代码、路由、UI 或 API；本项目统一使用 `Tier / Tx`。
- 不把旧数据的 `T1-T24` 全量开放为首期可操作 UI。

## 术语与参考边界

- AA 原文 `Layer`：对应本项目 `Tier`。
- AA 原文 `L1-L7`：对应本项目 `T1-T7`。
- AA `Layer Tab`：对应本项目 `/tier` 页面。
- Excel 里的 `layer=1..24`：旧数据兼容风险，只用于提醒后端和 UI 不应默默丢数据。
- Excel 里的规则树：用于指导 summary contract 支持 `bid group + condition nodes`，不代表本期要导入该 Excel。

## 推荐方案

采用“只读 Bid Review / Summary 首期”的方案。

页面由后端统一 summary API 提供 current draft 汇总，前端只负责展示、分组、格式化和基础 warning。Pairing、DaysOff、Line 继续在各自页面编辑；Tier 页面仅用于提交前检查。

### 为什么先做这个

- 它是 AA Layer Tab 的核心第一步。
- 它可以马上串联 Pairing、DaysOff、Line 已有保存结果。
- 它能暴露当前 bid 是否按 Tier 分布合理。
- 它避免过早引入跨模块写入、并发版本、删除身份、重排等复杂问题。
- 它为后续 `View Pairing Set`、Award Tab、Reason Report 提供数据模型基础。

## 可选方案对比

### 方案 A：只读 Bid Review / Summary（推荐）

优点：

- 与 AA Layer Tab 的首要用途一致。
- 风险低，主要读取 current draft。
- 能复用现有 Pairing / DaysOff / Line 写入链路。
- 可以先把 summary contract 做正确，为后续功能铺路。

代价：

- 首期不能在 Tier 页面直接编辑 bid。
- Pairing pool 数量仍只能显示已有 summary 统计，不做真实池子模拟。

### 方案 B：先做旧数据 T1-T24 浏览器

优点：

- 更适合验证 Excel/旧库数据迁移形态。

代价：

- 偏离 AA 7 层主线。
- UI 和 contract 会被 legacy 数据牵着走。
- 当前用户目标是按 AA 开发并兼容旧数据，不是先做迁移浏览器。

### 方案 C：先做 Tier 编辑器

优点：

- 用户可以在一个页面统一操作全部 bid。

代价：

- 会重复 Pairing / DaysOff / Line 已有编辑入口。
- 需要重新处理稳定身份、版本并发、删除、排序、跨模块 cache 同步。
- 当前时机过早，不推荐。

## 数据契约设计

现有 `PbsLineholderCurrentSummaryResponse` 可以保留入口，但需要增强 summary item 表达能力。

建议 contract 方向：

```ts
type PbsLineholderSummaryTier = {
  tier: string;
  totalItems: number;
  calendarDayOffCount: number;
  pairingCount: number;
  lineCount: number;
  daysOffCount: number;
  reserveCount?: number;
  unsupportedItemCount?: number;
};

type PbsLineholderSummaryCondition = {
  id: string;
  label: string;
  operator?: string;
  value: string;
  connector?: "AND";
};

type PbsLineholderSummaryItem = {
  id: string;
  groupKey: string;
  bidType: "Calendar" | "Pairing" | "Line" | "DaysOff" | "Reserve" | "Unsupported";
  action?: "Award" | "Avoid" | "SetCondition" | "CalendarOff";
  label: string;
  operator?: string;
  value: string;
  readableText: string;
  tiers: string[];
  conditions: PbsLineholderSummaryCondition[];
  source?: "currentDraft" | "legacy";
  warningCode?: "unsupportedTier" | "unsupportedProperty" | "emptyTier" | "legacyOnly";
};
```

说明：

- `groupKey` 是稳定展示分组身份，不用展示顺序或 label 当 key。
- `conditions` 用于表达 Excel 参考里的 `node_id=2..n` 条件链，也能表达后端当前 `pbs_bid_condition` 的后续扩展。
- `readableText` 由后端或 mapper 产出，前端优先展示它，避免 UI 到处拼接业务语句。
- `tiers` 可包含 `T8-T24`，但前端首期只把 `T1-T7` 作为主展示范围，超出部分进入 warning 或 legacy 区。

## 后端 Summary 规则

### 读取范围

- 读取当前登录用户的 Lineholder Current draft。
- bid context 固定为 `Current`。
- period 使用现有 current period 解析逻辑。
- 没有 draft 时返回空统计和空 summary。

### Bid 类型

首期必须汇总：

- `Pairing`
- `DaysOff`
- `Line`
- `Calendar`

可预留：

- `Reserve`
- `Unsupported`

### 分组规则

- 同一业务 bid group 跨多个 Tier 时展示为一条 item，`tiers` 合并排序。
- 同一 `groupKey` 的附加条件应进入 `conditions`。
- Calendar day off 可继续按 `date + bid kind` 聚合，并合并 tiers。
- Line、DaysOff、Pairing 都应保留各自 `bidType`，不能统一伪装成 Pairing。

### 旧数据兼容

后端如果读到 `T8-T24`：

- 不抛 500。
- 不静默丢弃。
- 在 summary 中保留该 item 的 tier 信息。
- statistics 中可增加 `unsupportedItemCount` 或在 response 顶层提供 warning。
- 前端主区显示 `T1-T7`，legacy 区或 warning 中提示存在超出当前 AA 7 Tier 范围的数据。

## 前端页面设计

### 页面定位

`/tier` 页面文案从 Pairing 专属改为 Bid Review：

- `BID STATISTICS`
- `BID SUMMARY`
- 可选 `TIER WARNINGS`

不再使用：

- `PAIRING SUMMARY`
- `PAIRING PROPERTIES`
- 假下拉编辑
- 假删除按钮
- 假可编辑 Tier toggle

### 顶部统计

展示 `T1-T7`：

- Tier 编号。
- total bids。
- Pairing count。
- DaysOff count。
- Line count。
- Calendar count。
- 简单条形可继续保留，但语义改为 total bid distribution，不再叫 pairing-only。

如果某 Tier 为空：

- 显示 `No bids in this tier` 或等价提示。
- 不把空 Tier 当错误。

### Summary 主表

建议列：

- `TIER`
- `TYPE`
- `BID`
- `DETAILS`
- `WARNINGS`

展示方式：

- 默认按 `T1 -> T7` 分组。
- 每组内部按 `Calendar / Pairing / DaysOff / Line` 或后端稳定顺序展示。
- `readableText` 放主行。
- `conditions` 以缩进或轻量 secondary text 展示，例如 `AND Pairing Check-In Time < 12:00`。
- 多 Tier item 可以在每个相关 Tier 下出现一次，也可以主表显示一次并用 chips 标记 tiers；首期推荐“按 Tier 分组重复引用”，更符合用户按层检查的心智。

### Legacy / Unsupported 提示

如果 summary 发现 `T8-T24`：

- 在顶部或 warnings 区提示：`Legacy bid groups exist outside T1-T7 and are shown separately for review only.`
- 不允许编辑。
- 不混入 `T1-T7` 主统计。
- 可折叠展示 legacy items，作为只读兼容信息。

## 可读性格式化优先级

首期优先把真实高频属性格式化好：

- `Prefer Off`
- `Pairing Number`
- `Any Landing In Airport`
- `Pairing Check-In Time`
- `Pairing Total Credit`
- `Departing On`
- `TAFB`
- `Any/Every Layover In Airport`
- `Max Credit Window`
- `Min Credit Window`
- `Clear Schedule and Start Next Bid Group`
- `No Same Day Pairings`

格式化原则：

- `Between` 显示为 `A - B`。
- 列表值保留逗号分隔，但过长时前端可截断并提供 title。
- 开关型 Line property 显示为 `Enabled` 或直接显示 property 名。
- `Award / Avoid` 必须在 readable text 中可见。
- 不强行把旧数据的混合参数全部结构化；无法可靠拆分时保留原值并标 warning。

## 错误处理

- API 失败时显示原有 panel error 状态，文案改为 `Unable to load the current bid summary.`
- 无 draft 时不是错误，显示空 summary。
- 有 unsupported property 时不阻断整页，单行显示 warning。
- 旧数据超出 `T7` 时不阻断整页，显示 legacy warning。

## 性能要求

- Summary API 继续保持一次请求返回页面所需数据。
- 不在前端为每个 Tier 或每个 item 额外发请求。
- 后端查询应使用一次 rule rows 查询 + 一次 calendar rows 查询的模式，后续如果加入 conditions，也应避免 N+1。
- 页面渲染必须能承受数百条 summary item；必要时先用折叠分组减少首屏压力。

## 测试计划

### 自动化测试

后端：

- `lineholder-summary.test.ts` 覆盖 route 返回增强 summary。
- `lineholder-summary-service` 相关测试覆盖：
  - 空 draft 返回 `T1-T7` 空统计。
  - Pairing / DaysOff / Line / Calendar 分别计数。
  - 同一 item 多 Tier 合并。
  - `T8-T24` 不丢失并产生 warning。
  - 多条件节点能进入 `conditions` 或 readable text。

前端：

- `tier-draft-mappers.test.ts` 覆盖增强 contract 到页面数据的映射。
- `tier-right-panel.test.tsx` 覆盖：
  - 标题使用 `BID STATISTICS / BID SUMMARY`。
  - 不渲染假编辑控件。
  - 按 Tier 展示 bid groups。
  - conditions 正确显示。
  - legacy warning 正确显示。
- `tier-page.test.tsx` 覆盖 loading、empty、error、service boundary。

### QA 测试案例

新增：

`docs/test-cases/pbs/tier/2026-05-09-tier-bid-review-summary.md`

覆盖：

- 无 bid 的空状态。
- Pairing / DaysOff / Line / Calendar 混合 summary。
- T1-T7 分组和数量统计。
- 多条件 bid group 展示。
- Line property 不被误显示成 Pairing。
- 旧数据超出 T7 的 warning。
- 页面无误导性编辑控件。

## 验收标准

- `/tier` 页面变成只读 Bid Review / Summary。
- `PAIRING SUMMARY / PAIRING PROPERTIES` 等旧 Pairing-only 文案被移除或替换。
- 每个 `T1-T7` 能看到对应 bid 统计。
- Summary 能同时展示 Pairing、DaysOff、Line、Calendar。
- 一个 bid group 多个 `AND` 条件能在同一 summary item 中被用户读懂。
- 无 draft、空 Tier、API error 都有明确状态。
- 旧数据 `T8-T24` 不会被静默丢弃，有只读 warning。
- 不引入新依赖。
- 不修改 Excel，不做导入。
- 不触碰当前未提交的 Line 功能文件，除非实现时发现共享契约必须同步并经确认。
- 根目录 `npm run verify:pbs` 通过。

## 后续路线

1. `View Pairing Set` / pairing pool preview。
2. Bid group detail drawer。
3. 更完整的 AA Layer Tab 诊断：空池、重复、过窄、restrictive property 提示。
4. Award Tab。
5. Reason Report。
6. 评估是否需要 Tier 内编辑能力。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 首期改动集中在 summary contract、lineholder summary service、Tier mapper/UI 和测试，文件边界紧密，拆分后容易互相等待或冲突。
- Suggested split: 不拆。
- Write boundaries: `packages/contracts/pbs-lineholder-summary.*`、`pbs-server/src/services/lineholder/lineholder-summary-service.ts`、`pbs-server/src/routes/lineholder-summary.test.ts`、`pbs-portal/src/features/tier/*`、`docs/test-cases/pbs/tier/*`。
- Conflict risk: 中等。当前工作树已有大量 Line 未提交改动，实现时必须避开 Line 文件，除非发现共享类型必须同步并单独说明。
- Execution gate: 用户 review 本 spec 并明确批准后，才能进入实现。
