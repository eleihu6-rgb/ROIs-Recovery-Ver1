# PBS Lineholder Standing Bid 条件菜单对齐设计

日期：2026-07-27  
状态：V3 HTML 原型已确认，spec 复审通过
范围：仅对齐 `Lineholder Standing Bid` 的可选条件菜单与输入限制

## 1. 背景

现有 Standing Bid 是 Phase A / MVP 实现，已支持 Lineholder 与 Reserve 两套长期模板的编辑和保存，但 Lineholder 条件目录仍使用 2026-07-07 建立的手写 code 白名单。此后 Current Bid 条件已发生变化：

- `Airport Preference (168)` 已替代旧的 `Any Landing In Airport (101)` / `Any Layover In Airport (104)` 作为当前可见机场条件。
- `Efficient Flying First (428)` 已从 Line 条件迁移为 Pairing 条件。
- 远端 `f8_pbs.pbs_bid_property` 的可见性配置也已调整。

因此，Standing Bid 条件菜单与当前 Bid 页面实际显示的条件产生漂移。

用户确认本轮只完成一个小步骤：**以当前 Bid 页面实际显示的条件为主，整理 Lineholder Standing Bid 的条件菜单。**

## 2. AA 参考口径

AA `Flight Attendant PBS Guide` 对 Lineholder Standing Bid 的定义是：

- 它是跨月份长期保存的备用申请。
- 可包含通用 Days Off、Pairing 和 Line 条件。
- 不允许具体日期、具体 Pairing 或 `on Date` 条件。
- `Day of Week Off` 是 Standing 专属条件，可以保留。
- 每种 Standing Bid 有独立的 7 个 Tier。

本轮只采用上述“长期可复用条件”口径，不实现 AA 的算法回退、导入导出或特殊 award 行为。

## 3. 已确认需求

### 3.1 条件来源

- 以当前 Bid 页面从后端实际返回并显示的条件为主要来源。
- 后端仍以 `pbs_bid_property.is_active=1` 且 `is_visible_in_portal=1` 作为运行时可见性门禁。
- Standing 页面不得自行硬编码注入 Current Bid 已隐藏的普通条件。
- Standing 专属 `Day of Week Off (218)` 作为明确例外保留。
- Contract 必须维护一份**显式确认的 Lineholder Standing 可复用 code 集合**，不能把实现简化为“Current catalog 排除 `102 / 204` 后全部自动进入”。以后 Current Bid 新增条件时，仍需明确判断是否可跨月复用。

### 3.2 必须排除的条件

以下 Current Bid 条件不进入 Lineholder Standing Bid：

| Code | 条件 | 排除原因 |
|---:|---|---|
| 102 | Pairing Preference | 绑定具体月份的 Pairing pool，无法跨月兜底 |
| 204 | Long Stretch Off / Compressed Flying | 当前输入依赖具体日期范围，无法跨月兜底 |

### 3.3 必须保留的条件

- `Efficient Flying First (428)` 保留。它不保存具体日期或具体 Pairing，可在每个月按当月 Pairing 数据重新计算。
- `Day of Week Off (218)` 保留。它是 Standing 专属且天然跨月有效。
- 其他当前 Bid 已显示、且不依赖具体日期或具体 Pairing 的 Days Off、Pairing、Line 条件保留。

### 3.4 日期输入行为

对带有可选日期限制的通用条件：

- 条件本身继续显示。
- 日期或日期范围区域继续显示，避免用户看不到条件原有结构。
- 日期值默认留空，表达“任何日期均适用”。
- 本轮不允许用户填写具体日期或日期范围。
- 保存 payload 中对应日期限制必须保持 `null`、空数组或合同定义的等价空值。
- 后端必须拒绝绕过前端提交的非空具体日期或日期范围。

这里的限制只针对“具体日期”输入。`Whole Month`、`First Half`、`Second Half` 等不绑定年月的相对范围，如果某个条件的核心语义依赖它们，继续按现有 Standing 规则处理。

## 4. 本轮目标条件集合

以下集合以 2026-07-27 当前 Bid 可见 catalog 为基线；最终运行时仍取 contract 支持集合与数据库 active/visible 集合的交集。

### 4.1 Days Off

| Code | 条件 | Standing 处理 |
|---:|---|---|
| 201 | Prefer Off | 保留；具体日期输入显示但禁用，值为空 |
| 218 | Day of Week Off | 保留；Standing 专属 |

`204 Long Stretch Off / Compressed Flying` 排除。

### 4.2 Pairing

| Code | 条件 | Standing 处理 |
|---:|---|---|
| 168 | Airport Preference | 保留；具体日期限制显示但禁用 |
| 428 | Efficient Flying First | 保留；按每月数据动态计算 |
| 103 | Pairing Check-In / Check-Out Time | 保留；具体日期限制显示但禁用 |
| 107 | Flight Legs per Duty | 保留；具体日期限制显示但禁用 |
| 110 | Work Day Preference | 保留；具体日期限制显示但禁用 |
| 112 | Pairing Length | 保留；具体日期限制显示但禁用 |
| 116 | Flight Number Preference | 保留；具体日期限制显示但禁用 |
| 117 | Redeye Preference | 保留；具体日期限制显示但禁用 |
| 122 | Deadhead Flying | 保留；具体日期限制显示但禁用 |
| 129 | Time Between Flights | 保留 |
| 163 | Month-End Carryover | 保留；使用跨月相对天数语义 |

`102 Pairing Preference` 排除。

### 4.3 Line

| Code | 条件 | Standing 处理 |
|---:|---|---|
| 429 | Credit Window Preference | 保留 |
| 407 | Minimum Base Layover | 保留 |
| 408 | Commuter Pattern | 保留 |
| 410 | Mixed Block Pattern | 保留；只允许现有跨月可复用的相对范围 |
| 427 | Reserve Avoidance | 保留 |

### 4.4 已保存旧条件的兼容边界

2026-07-27 对远端权威 `f8_pbs` 的只读核查结果：

- `StandingLineholder` 只有 1 条空 draft。
- `StandingReserve` 没有 draft。
- 两种 Standing context 均没有已保存的 `pbs_bid_group` property。

因此，当前权威环境不存在需要从 `101 / 104` 迁移到 `168` 的历史 Standing property，本轮不设计数据转换。

但由于 Standing 保存使用整份草稿覆盖，实施和部署前必须再次执行只读 preflight：

- 统计 `StandingLineholder / StandingReserve` 下所有不属于新支持集合的已保存 property code。
- 如果发现任何旧 property，必须停止部署并单独确认“保留只读、迁移或清理”方案。
- 不允许在 GET 时静默隐藏旧 property 后，再通过用户下一次保存把它删除。
- 不允许把旧 `101 / 104` 无条件改写为 `168`；两者 payload 语义不同，必须另行设计显式迁移。

## 5. 方案比较

### 方案 A：继续维护完整 Standing code 白名单

直接修改现有白名单，补入 `168 / 428` 并删除失效 code。

优点：

- 改动最小。

缺点：

- Current Bid 条件以后再次调整时，Standing 容易继续漂移。
- 同一条件身份需要维护两套目录。

### 方案 B：从 Current Bid catalog 派生，再应用 Standing 规则（推荐）

复用 Days Off、Pairing、Line 的当前 contract 定义，但使用显式确认的 Standing capability 集合：

1. 从 Current Bid contract 中按显式 code 集合选取已确认可复用条件。
2. 明确排除 `102 / 204`，并且新 Current 条件不会自动进入 Standing。
3. 对可选日期字段应用 Standing 输入适配。
4. 加入 Standing 专属 `218`。
5. 后端继续与数据库 active/visible 配置取交集。

优点：

- 满足“以当前 Bid 页面条件为主”。
- Current Bid 新增或迁移通用条件时，不容易继续遗漏。
- 排除规则与输入适配规则清晰可测试。

风险：

- Current Bid 新增条件时，仍需判断它是否真正可跨月复用，不能无条件自动进入 Standing。

控制方式：

- 新增 Current 条件时，必须显式通过 Standing capability 判定；日期绑定、具体业务对象绑定的类型默认不进入 Standing。

### 方案 C：数据库新增 `is_visible_in_standing_bid`

给 `pbs_bid_property` 增加独立 Standing 可见性字段。

优点：

- 运营配置最直观。

缺点：

- 本轮需要 schema、migration、seed、模型和配置流程改造。
- 对当前小范围目标过重。

结论：本轮不采用。

## 6. 推荐设计

采用方案 B，但保持最小实现：

- Contract 层负责定义“Current catalog + Standing capability/exclusion + Standing 专属条件”。
- `pbs-server` 负责把该支持集合与数据库 active/visible 条件取交集，并执行保存硬校验。
- `pbs-portal` 只消费后端返回的 Standing catalog，不再额外隐藏 `428` 或注入旧条件。
- 日期控件复用现有编辑器，通过 Standing context 将具体日期输入设为可见但禁用。

不得在 Portal mapper 中继续保留类似 `propertyCode !== 428` 的临时过滤。

## 7. 数据流

```text
Current contract catalogs
        +
Standing exclusion/capability rules
        +
Standing-only property 218
        ↓
pbs-server supported Standing catalog
        ∩
pbs_bid_property active + visible
        ↓
GET /api/standing-bids/current
        ↓
pbs-portal Lineholder Standing Bid menu
```

保存时：

```text
Portal Standing editor
  → 日期限制保持空值
  → PUT /api/standing-bids/current
  → server 校验 property 属于 Lineholder Standing catalog
  → server 校验无具体日期/日期范围/具体 Pairing
  → 保存到 StandingLineholder + STANDING
```

## 8. 前端行为

- Standing Bid 页面继续复用当前 Bid 页的视觉与交互结构，不另建卡片式条件目录。
- Lineholder / Reserve 使用页面顶部的紧凑横向 Tab；不增加左侧导航栏。
- Lineholder Standing Bid 的条件目录使用与当前 Bid 页一致的整行属性列表：
  - 左侧显示属性名称。
  - 中间按现有规则显示 `TOP USED` 等既有标记。
  - 右侧使用现有圆形添加按钮。
- Standing Bid 页面不提供 `Favorites / Favorited Properties` 分类或收藏入口。
- Lineholder Standing Bid 的目录 Tab 为：
  - `All Properties`
  - `Days Off`
  - `Pairing`
  - `Roster`
- `Roster` 只是现有 Portal UI 标签，底层仍对应本 spec 所称的 Line 条件分类。
- `Day of Week Off (218)` 归入 `Days Off`，不额外增加只有一个属性的 `Standing` Tab。
- “已添加 Standing Bid 条件”区域沿用当前 Bid 页的列表样式；不得用卡片网格展示。
- 原型和产品不得伪造示例 Standing Bid 数据。没有已保存条件时，显示简洁空状态；有真实数据时才按现有 Bid 条件行展示。
- `Airport Preference` 替代旧机场条件进入 Pairing 分类。
- `Efficient Flying First` 进入 Pairing 分类。
- `Pairing Preference` 和 `Long Stretch Off / Compressed Flying` 不显示。
- 日期区域显示为禁用状态，空值含义需要有简短说明，例如：
  - `Applies to any date in the bid month.`
- disabled 状态必须有可感知的非颜色提示，并保持键盘与辅助技术语义。
- 现有新增、编辑、删除、T1-T7、自动保存和版本冲突行为保持不变。

## 9. 后端校验

保存 Lineholder Standing Bid 时必须：

- 只接受服务端解析出的 Standing catalog code。
- 拒绝 `102 / 204`。
- 拒绝具体 Pairing ID / occurrence。
- 拒绝任何非空绝对日期、日期数组或日期范围。
- 对带嵌套 `dateScope` 的 Pairing payload，拒绝具体日期模式或非空日期值。
- 继续接受不绑定年月的相对范围。
- 继续限制 T1-T7。
- 不信任前端传入的 property name、bid type 或默认 action。

用户可见错误继续使用项目统一错误入口，不显示原始异常、SQL 或内部 payload。

## 10. 非目标

本轮不实现：

- Reserve Standing Bid 条件调整。
- Current → Standing Import。
- Standing → Current Export。
- Current / Standing / Default 的算法回退。
- PBS Engine 或 Algorithm Export 改动。
- Buddy Bid follower 或 bubble bidder 特殊规则。
- 新增数据库字段。
- 当前 Bid 页面条件本身的新增、删除或重设计。

## 11. 测试与验证

### Contract / 后端

- catalog 包含 `168 / 428 / 218`。
- catalog 不包含 `101 / 104 / 102 / 204`。
- DB hidden/inactive 条件不会返回。
- 部署前 preflight 能证明没有不受支持的历史 Standing property；发现时必须失败并报告。
- 保存 `168 / 428` 成功。
- 保存带非空具体日期的通用条件返回 `400`。
- 绕过 Portal 保存 `102 / 204` 返回 `400`。

### Portal 单元测试

- Lineholder Standing 菜单显示 `All Properties / Days Off / Pairing / Roster`，不显示 Favorites 或单独的 Standing Tab。
- 条件目录复用整行属性列表和现有添加入口，不渲染卡片网格。
- 没有已保存条件时显示空状态，不渲染示例数据。
- 显示 `Airport Preference` 与 `Efficient Flying First`。
- 不显示旧机场条件、`Pairing Preference`、`Long Stretch Off / Compressed Flying`。
- 带日期限制的条件显示日期区域，但控件 disabled 且初始为空。
- 保存 payload 不包含具体日期。

### Playwright

通过真实 Portal 页面和真实 Standing API：

1. 登录并进入 `/standing-bid`。
2. 打开 Lineholder Standing 条件菜单。
3. 验证目标条件显示与排除条件不显示。
4. 配置并保存 `Airport Preference`。
5. 配置并保存 `Efficient Flying First`。
6. 刷新后验证两项仍可读取和编辑。
7. 验证日期控件可见但无法填写。

### 交付验证

- `pbs-server` Standing 相关 Vitest / Node tests
- `pbs-portal` Standing 相关 Vitest
- Standing Bid Playwright
- 更新 `docs/test-cases/pbs/standing-bid/` 下与旧机场条件或“隐藏日期区域”冲突的 QA 用例
- `pbs-server` build
- `pbs-portal` lint / build
- `npm run check:ui`
- `git diff --check`
- `node .gitnexus/run.cjs detect_changes --scope compare --base-ref main`

## 12. 验收标准

1. Lineholder Standing Bid 条件菜单以当前 Bid 可见条件为主。
2. `168 Airport Preference` 和 `428 Efficient Flying First` 可见、可保存、可刷新回显。
3. `102 Pairing Preference` 与 `204 Long Stretch Off / Compressed Flying` 不可见且后端拒绝保存。
4. `218 Day of Week Off` 继续保留。
5. 可选日期区域可见、默认留空、不可填写。
6. 后端不能通过构造请求保存具体日期或具体 Pairing。
7. Reserve、算法回退、导入导出和 Current Bid 页面行为不受影响。
8. 页面沿用当前 Bid 的整行属性列表，不使用卡片目录，不提供收藏入口。
9. 无已保存 Standing Bid 条件时显示空状态，不显示任何伪造示例。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮范围集中在同一套 contract、Standing service、Standing Portal editor 与对应测试，写入边界高度耦合；多人并行会增加 contract 冲突和重复判断风险。
- Suggested split: 不拆分，由单一实现者完成。
- Write boundaries: `packages/contracts/pbs-standing-bids.*`、`pbs-server/src/services/standing-bid/**`、`pbs-portal/src/features/standing-bid/**`、Standing 专项测试与 QA 文档。
- Conflict risk: 低到中；当前工作树存在其他 PBS Bid 页面改动，实施时必须避开并保留用户现有修改。
- Execution gate: 本 spec 经用户审阅并明确批准后，才进入实施计划与代码修改。
