# PBS Standing Existing 条件展示统一设计

## 1. 背景

Standing Bid 已完成统一页面和条件弹窗开发，但 `EXISTING STANDING BID` 只有
`Prefer Off（property_code=201）` 复用了 Current Bid 的分类标签与语义摘要。
其余由后端 Standing catalog 返回的条件仍使用 Standing 的旧通用展示：

- 非 201 条件统一显示紫色分类标签；
- 属性名与原始条件值分成两行；
- 摘要通过 `formatPairingBidValue` 等旧格式化路径生成；
- 与 Current Bid 已有的单行语义摘要不一致。

员工 19 的 `Commuter Pattern` 已直接证明该问题：Standing 显示紫色
`Roster` 标签，并将 `Commuter Pattern` 与 `Work 4-5 days, then 4 days off`
拆成两行；Current Bid 的标准是橙色 `Roster` 标签和单行语义摘要。

## 2. 目标

将后端 Standing catalog 返回的全部条件统一到 Current Bid / Current Reserve 的既有展示规范。
当前员工 19 页面实际返回 18 个可见条件，但 renderer 不能只适配这 18 个；数据库以后重新打开
`218 / 410 / 312 / 313 / 314` 等已支持条件时，它们必须直接获得正确展示，不再修改前端可见性代码。

1. Days Off、Pairing、Roster、Reserve 使用各自标准分类颜色。
2. Existing 条件主体统一显示一行用户可读摘要，不再用“属性名 + raw value”两行展示。
3. Standing 复用 Current Bid 已有的语义摘要规则，不复制业务文案。
4. Reserve Preference 复用 Current Reserve 已有的条件格式，再使用统一单行容器展示。
5. Standing 继续保留 `EDIT` 和 `DELETE`；Current Bid 行为不变。
6. Standing 与 Current Bid 的草稿、保存、编辑和删除数据继续完全分离。
7. property 是否出现在 Standing 中，仍然只由数据库 context visibility 控制；前端不新增可见性硬编码。

## 3. 不在范围内

- 不修改 property catalog 或数据库 visibility。
- 不改变 Standing 条件 payload、保存接口和业务校验。
- 不修改条件弹窗。
- 不修改 Current Bid、Current Reserve 的交互行为。
- 不新增收藏、Preview 或 Search Pairings。

## 4. 方案比较

### 方案 A：复用现有分类标签与摘要生成器（采用）

- 根据 property 的 `bidType/categoryLabel` 映射到 `TierBidTypeBadge`。
- Days Off、Pairing、Roster 调用现有 `buildBidPropertySummary`。
- Reserve Preference 继续调用 Current Reserve 已使用的
  `formatPairingBidValue`，再放入统一摘要视图。
- Standing 的 Existing 列表对所有 property 使用“摘要替代属性名”模式。

优点：与 Current 页面同源、改动小、后续不容易再次漂移。

### 方案 B：为 17 个条件分别增加 Standing 判断（不采用）

短期直观，但继续扩大 property code 硬编码，后续新增或启用数据库条件时容易漏掉。

### 方案 C：新建完整 Standing 摘要系统（不采用）

可以完全独立控制，但会复制 Current Bid 已存在的业务语义，产生两套标准。

## 5. 设计

### 5.1 分类标签

`RuleBidExistingPropertyRow` 的 `bid-list` 展示不再只对 201 特判。
由调用方或共享解析函数提供标准 `TierBidType`：

- `Days Off` → `DaysOff`（绿色）
- `Pairing` → `Pairing`（紫色）
- `Roster` → `Line`（橙色）
- `Reserve` → `Reserve`（灰色）

映射只负责视觉分类，不决定 property 是否可见。

### 5.2 摘要

Standing resolver 以服务端返回的 `bidType/categoryLabel` 决定摘要族，不决定可见性：

- `DaysOff`
  - Current 共用条件（如 201、204）复用 `buildBidPropertySummary("days-off", ...)`。
  - Standing 专属 218 按 `date-or-dow-list` payload 生成 `Day off on ...` 语义摘要。
- `Pairing`
  - Current 共用条件复用 `buildBidPropertySummary("pairing", ...)`，包括当前 11 个条件。
  - 428 与 Current Bid 使用同一个 `useEfficientFlyingConfig` 查询；仅在 Existing 中存在
    428 时启用。配置可用时传入 percentile，配置不可用时沿用现有
    `Efficient flying configuration is unavailable.` 降级，不硬编码百分比。
- `Line/Roster`
  - 407、408、410、427、429 等共用条件复用
    `buildBidPropertySummary("line", ...)`；其中 410 不得遗漏。
- `Reserve`
  - 301 复用 Current Reserve 已使用的 `formatPairingBidValue`，保证 date scope 文案同源。
  - 312 根据 `date-or-dow-list` 生成 `Reserve day off on ...`。
  - 313 根据 `stepper-range` 生成 `Reserve work blocks of X–Y days`。
  - 314 根据 `flag` 生成 `Waive to allow carryover to be days off`。

上述映射仅覆盖 contract 已支持的 payload 语义，不参与 catalog 筛选。对于数据库新打开、且 contract
已支持的 Standing property，页面直接按其 bidType/payload 获得标准标签和摘要；不增加“显示/隐藏”
判断。对于未知或不完整 payload，显示共享的 `needs review` 语义，不能展示 raw JSON 或伪造兜底结果。

不为 Current Bid 已有条件重新编写 Standing 文案。现有共享 formatter 已按 property payload
生成语义摘要；Standing 去掉明确年月日后的 payload 会自然生成不含日期的摘要。

若 payload 不完整，沿用共享摘要的 `needs review` 行为，不制造看似正确的兜底文案。

### 5.3 Existing 行

所有 Standing Existing 行：

- 左侧只显示分类标签；
- 中间只显示统一摘要；
- 不再额外显示 property 名称；
- Tiers、`EDIT`、`DELETE` 保持现状；
- 排序、稳定 id、保存上下文保持现状。

## 6. 验收标准

1. 员工 19 的四条 Prefer Off 保持当前已确认文案和绿色标签。
2. `Commuter Pattern（408）` 显示橙色 `Roster` 标签和单行
   `Work 4–5 days, then 4 days off`。
3. Pairing Existing 行与 Current Bid 对同一 payload 使用相同摘要；428 分别覆盖配置可用和不可用。
4. 数据库当前返回 204 时，Long Stretch Off 使用绿色 `Days Off` 标签和共享摘要；本次 UI
   不判断它应否可见。
5. 410 显示橙色 `Roster` 标签和共享 Mixed Block 摘要。
6. 301 使用灰色 `Reserve` 标签，并覆盖 Whole Month、First Half、Second Half 三种 Standing scope。
7. 218、312、313、314 在测试 catalog 中出现时均得到正确分类和语义摘要。
8. 所有 Standing Existing 行继续提供 Edit/Delete。
9. Current Bid 和 Current Reserve 展示无回归。
10. mapper 和 renderer 只消费后端返回集合；数据库隐藏的 Standing property 不会因本次修改出现。

## 7. 验证范围

- `bid-property-summary` focused Vitest：覆盖 Standing 使用的 Days Off、Pairing、Roster，包括
  410 和 428 配置可用/不可用。
- `standing-bid-page` / `rule-bid-property-table` Vitest：按完整 contract code 清单覆盖四类标签、
  单行摘要和 Edit/Delete，并显式覆盖 218、301、312、313、314。
- mapper Vitest：证明展示层只消费服务端返回 catalog/draft，不扩大可见集合。
- Playwright：真实登录员工 19，检查 Prefer Off 与 Commuter Pattern；通过可控测试数据覆盖
  Pairing、Days Off、Roster、Reserve 四类 Existing 行。
- `npm run check:ui`
- `npm --prefix pbs-portal test`
- `npm --prefix pbs-portal run build`

## 8. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一 Existing 行组件、Standing 页面 resolver 和相邻测试，拆分会让多个 agent 修改同一文件。
- Suggested split: 主 agent 完成实现与验证；独立 reviewer 只做只读审查。
- Write boundaries: 不拆分写入范围。
- Conflict risk: 并行实现会在 Standing 页面与共享表格组件产生高冲突。
- Execution gate: 用户审核并批准本设计后实施。
