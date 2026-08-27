# PBS Favorite 编辑弹窗隐藏明确日期控件设计

日期：2026-08-03
状态：待用户审阅
范围：PBS Portal 从 Favorite 收藏卡片进入的编辑弹窗

## 背景

Configured Favorite 用于跨月份复用，已经通过前端禁用、后端校验和数据库清理禁止保存明确年月日。当前收藏卡片点击 Edit 后，部分弹窗仍展示 `Specific Dates`、`Date Range`、`On Date` 或 `Limit to Event Date` 等控件；用户可以选择这些值，但 `UPDATE FAVORITE` 随后不可提交，交互前后矛盾。

Standing Bid 已采用“直接隐藏明确日期控件”的方式。Favorite 编辑也应采用相同的可复用日期原则，但不能直接复用完整 Standing 上下文，因为两者在条件范围、Tier 和其他业务行为上仍有差异。

## 已确认目标

- 只调整“收藏卡片 → Edit Favorite / UPDATE FAVORITE”的编辑场景。
- Favorite 编辑弹窗只展示可跨月份复用的控件。
- Current Bid 的新增条件、编辑 Existing Bid、`ADD BID` / `UPDATE BID` 行为完全不变。
- 正常 Current Bid 配置弹窗仍可选择明确日期；当明确日期存在时，`SAVE FAVORITE` 继续保持 disabled，作为同一弹窗双用途下的必要限制。

## Favorite 编辑时隐藏的内容

凡是会写入明确 `YYYY-MM-DD` 的交互入口均不显示，包括：

- `Specific Dates`；
- 明确起止年月日的 `Date Range`；
- `On Date`；
- `Limit to Event Date` / `Limit to a Date Range`；
- Pairing occurrence 的具体 `originDate` 选择；
- `dateScope.mode = specific_dates | date_range` 对应的选择器；
- Commuter Pattern / Days Off Pattern 的明确日期范围；
- Reserve / Flying Pattern segment 中的明确日期 scope。

## Favorite 编辑时保留的内容

- `Days of Week`、`Weekends`；
- `Whole Month`、`First Half`、`Second Half` 等相对月份范围；
- `Time Window`、check-in / check-out 等纯时刻或时长；
- Award / Avoid、Any / Every、数量、比例、机场、航班号、Pairing ID / Number 等不绑定具体 occurrence 日期的参数；
- Tier 的现有 Favorite 编辑语义保持不变；本次不改变 Favorite 卡片的 Tx 选择规则。

“日期”与“时间”必须区分：本次只隐藏明确年月日控件，不能隐藏 `HH:mm` 时间窗口。

## 方案比较

### 方案 A：按 Favorite 编辑上下文隐藏明确日期控件（采用）

沿用现有 `favoriteEditMode` / `confirmSavesFavorite` 等稳定入口，把“只显示可复用控件”作为显式编辑上下文传给各条件编辑器。Current Bid 和 Standing 继续使用各自上下文。

优点：边界准确、复用现有编辑器、不会误伤 Current Bid。
风险：需要审计 Days Off、Pairing、Roster / Line 的所有 Favorite 编辑分支，不能只修 Prefer Off。

### 方案 B：Favorite 编辑直接套用 Standing 上下文

优点：表面改动较少。
缺点：Standing 还有不同的 property 可见性、Tier 和默认值规则，容易把不属于 Favorite 的行为带进来。

### 方案 C：复制一套 Favorite 专属编辑器

优点：完全隔离。
缺点：大量重复 UI 和校验逻辑，后续容易与 Current Bid 编辑器漂移。

## 详细设计

### 1. 独立的可复用编辑上下文

Favorite 编辑应使用明确的 reusable/favorite-edit 状态，而不是伪装成 Standing。可以复用现有布尔入口，也可以在共享边界收敛为清晰的枚举；不得通过标题、按钮文案或 property code 推测上下文。

上下文只负责控制日期相关 UI 是否可见，不改变：

- property 是否由数据库 catalog 返回；
- bid payload 类型；
- `allOrNothing`、Min N 等业务字段；
- Favorite POST / PATCH 契约；
- Current Bid / Standing 的保存路径。

### 2. Days Off

- `Prefer Off` Favorite 编辑只显示 `Days of Week`、`Weekends` 和 `Time Window`。
- 不显示 `Specific Dates`、`Date Range` 及其日期选择器。
- `Long Stretch Off / Compressed Flying` Favorite 编辑不显示明确日期范围开关，继续使用可复用的整月语义。
- 其他 Days Off 条件若存在明确日期子控件，也必须在 Favorite 编辑模式隐藏。

### 3. Pairing

- Pairing Favorite 卡片编辑与 Search Pairings 中“编辑 Favorite source”的确认路径统一进入 reusable 编辑上下文。
- 所有支持 `disableEventDateScope` 的编辑器在 Favorite 编辑模式隐藏 event date scope，包括 Airport Preference、Check-In / Check-Out、Flight Legs per Duty、Pairing Length、Flight Number、Redeye、Deadhead、Work Day Preference 等。
- Pairing ID / Number 的整月配置继续可编辑；不得提供具体 occurrence 日期选择。
- Pairing Preview 往返后再次编辑 Favorite 时必须保留同一上下文，不能重新出现日期控件。

### 4. Roster / Line

- 现有 `favoriteEditMode` 下继续隐藏与 Current Bid 专属日期相关的 section。
- `Days Off / Days On Pattern`、`Commuter Pattern` 不显示明确日期范围。
- Reserve / Flying Pattern 只显示 reusable scope；隐藏 `specific_dates`、明确 `date_range`，保留 Whole Month / First Half / Second Half。
- 审计所有 Line dialog 分支，避免仅用 CSS 隐藏外层后仍留下键盘可聚焦或 accessible 的日期控件。

### 5. 状态与数据安全

- DEV、SIT、UAT 已清理明确日期 Favorite，因此不设计旧日期 Favorite 的自动转换或兼容编辑。
- Favorite 编辑器初始化时不得凭当前月份自动补入明确日期。
- 切换或保存其他字段时，不得把隐藏控件的临时默认值写回 payload。
- 共享 `containsExplicitCalendarDate` 前端判断和 Server 400 校验继续保留，作为旧客户端、漏网入口和直接 API 调用的兜底。
- 不新增 migration，不修改数据库 schema。

## 用户体验

- Favorite 编辑弹窗中不存在“可以选择日期但最终不能保存”的死路。
- 不新增说明文字、tooltip、toast 或额外占位。
- 弹窗继续使用当前统一 UI；隐藏控件后自然收拢布局。
- `UPDATE FAVORITE` 仅由剩余字段的完整性和 pending 状态控制，不因不可见日期字段被错误禁用。

## 验收标准

### Favorite 编辑

- 从 Days Off、Pairing、Roster / Line 收藏卡片点击 Edit，所有明确年月日控件均不可见、不可聚焦且不存在对应 accessible control。
- Prefer Off 只显示 `Days of Week`、`Weekends`；`Time Window` 仍可使用。
- Pairing 各日期 scope 编辑器不显示日期限制入口，Search Pairings Favorite 编辑一致。
- Line pattern 只显示 reusable scope，明确日期范围入口不可见。
- 修改并更新收藏成功，保存 payload 不包含新生成的明确日期。

### Current Bid 不回归

- 从普通 property 入口新增 Current Bid 时，明确日期控件仍显示且可以 `ADD BID`。
- 编辑 Existing Current Bid 时，原日期值仍显示且可以 `UPDATE BID`。
- 普通配置弹窗选择明确日期后，`SAVE FAVORITE` 仍 disabled；切回无日期配置后恢复 enabled。

### 防线不回归

- Portal eligibility 与 Server 校验仍拒绝明确日期 Favorite POST / PATCH。
- `Days of Week`、`Weekends`、相对月份 scope 和纯时间配置仍可保存或更新 Favorite。

## 测试要求

- Days Off：Prefer Off Favorite 编辑隐藏两个日期 tab，保留 weekday/weekend/time window；Long Stretch Favorite 编辑隐藏日期范围。
- Pairing：主 Favorite 编辑、Search Pairings Favorite source 编辑分别覆盖至少一个 date-scope property；整月 Pairing ID / Number 仍可更新。
- Line：Commuter Pattern 与 Reserve / Flying Pattern 分别覆盖明确日期入口隐藏、reusable scope 保留。
- 每个模块都增加 Current Bid 对照用例，证明新增和 Existing 编辑的日期功能未被隐藏。
- 更新 `e2e/tests/pbs-portal/condition-default-favorites.spec.ts` 或对应真实 UI Playwright，用收藏卡片 Edit 驱动完整流程。
- 更新 `docs/test-cases/pbs/...` QA 用例，明确 Favorite Edit 与 Current Bid 的差异。
- 运行或补充 focused `pbs-server` 回归：Days Off、Pairing、Line 的 Favorite POST / PATCH 携带明确日期时仍返回 400；相对月份 scope 与纯 `HH:mm` 配置不得被误拒绝。
- 运行相关 Portal Vitest、PBS Portal 全量测试、Server focused tests、`npm run lint`、`npm run build`、`npm run check:ui` 和聚焦 Playwright。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前相关 Days Off、Pairing、Line 弹窗存在同一批未提交修改，且上下文需要统一收敛；并行写入容易覆盖或产生分支行为不一致。
- Suggested split: 不拆分，由单一实现者依次修改并统一回归。
- Write boundaries: PBS Portal 条件弹窗、相关自动化测试和 PBS QA 文档；只运行既有 Server 兜底回归，除非测试证明现有校验缺失，否则不修改 Server、数据库或算法。
- Conflict risk: 中等；实施前必须逐文件检查现有未提交差异并做最小补丁。
- Execution gate: 用户审阅并确认本 spec 后实施。
