# Crew Roster Recovery 代码重构 Prompt

> 来源：`crew-roster-recovery-requirements.md` v3.8 (2026-09-07)
> 用法：接手 Recovery 重构/重写前通读本文；改动须同时满足 §2 约束与 §3 验收。需求文档是唯一权威源；本文件只做结构化提取，避免需求分歧。

---

## 1. 业务基线

Recovery 针对 Live Gantt 已加载数据范围内的告警（Rule `8004` 提供三类恢复：方案一 直接转移/双向交换、方案二 当前基地 Standby Callout、方案三 Cross-base 跨基地（含 子方式 1 Duty 内新增 DHD 航段、子方式 2 复用首尾 DHD）），让用户选 `Apply` 写 Gantt Draft，随 Gantt 原有 `Save`/`Ctrl+S` 落库。本期不通知 Crew、不支持撤销回滚、不重启用顶层 Recovery 菜单。接口与候选引擎按 Rule 无关设计；Rule 检查必经本地 Rule Server。

---

## 2. 一致性约束

### 2.1 入口与可恢复性

- 唯一入口：Roster Pane `Alert Center`。Live 顶层无独立 `Violation` 按钮；`System → Interface` 仅进入 OPS Flight Schedule Simulation。
- `Recovery` 入口/勾选框对以下告警禁用（避免误导）：未配置恢复方式的 Rule（8004 之外默认禁用，直到注册 method）、缺 Pairing/已加载 Roster 锚点、`Roster end < Now()`。列表行仍展示，悬停/aria-label 给出原因。
- 接口 Rule 无关：`/api/recovery/methods/*` 公共字段不绑定 Rule；新增 Rule 恢复方式只需注册 method handler，不改前端入口/Apply/Preview。

### 2.2 Ruleset 严禁硬编码

告警查询、WebSocket 订阅、Rule 重算全部用 `LegalityStore.selectedId` 对应 Ruleset ID。严禁 `103`、旧字符串规则组、Ruleset 名回退；初始化未完成必须等待，不得伪造空告警；完成后必须重新查询已加载 Crew 告警并加入对应频道。

### 2.3 8004 数据源（缺一不可）

- 已分配航段机型：优先 `pairing_segment.fleet_seg`，回退航班/Pairing 机型。
- Crew 有效期机型资格：`crew_fleet.{fleet_specific, ac_type, fleet_grp}`，用 `eff_dt`/`exp_dt` 判定（`crew_fleet` 无 `is_valid`）。
- 缺任一适配器必须明确失败，不得以"重算成功"代替。

### 2.4 本地 Rule Server（Rule 检查唯一入口）

- 所有 Rule 检查（冷启动重算、告警生成、候选模拟、Save 重检、Apply 预览）必须经本地 Rule Server；严禁内嵌 JS、前端自判或任何 SKIP/降级路径。
- `SKIP_RUST_BINS` 开关必须删除；`check-7500-ref` 预处理与 8004 JS 降级随之下线。
- 所有环境（开发/UAT/SIT/生产）必须连接 Rule Server；不可达时 Live Server 明确失败提示，不允许"空告警"。
- Rule Server 响应按 `CrewID + PairingID + Rule Instance + Scope` 独立告警，不在前端/Live Server 合并丢弃。
- `--rules` 范围必须透传 Rule Server；缺实现由 Rule Server 自失败，不伪造通过。

### 2.5 Apply 语义

`Apply` 仅构造 `RecoveryDraftPlan` + `addDraftOp` 写 Gantt Draft；正式落库走 Gantt `Save`/`Ctrl+S`（锁、Rule 预检、事务、缓存刷新）。`/api/recovery/apply-option` 等后端接口作为前向兼容入口存在于 `live-server/src/routes/recovery/recovery.ts`，本期前端不调用。

### 2.6 候选范围与过滤

- 候选/Apply/Preview 只用当前 Live 已加载 Roster、Pairing、Crew、任务、SBY；范围内无候选必须明示"当前加载范围内无可用候选"，不得静默查 DB。
- 模拟 Rule 失败候选从可选项移除，保留 Crew/Rule ID/原因。
- 资格按完整 Roster 所有已加载航段精确匹配机型代码（`7M` ≠ `7M8`）。
- 完成 Roster（`Roster end < Now()`）不生成方案；`end == Now()` 视为未完成。

### 2.7 基础方案业务规则（方案一 / 方案二）

**方案一：直接转移 / 双向交换**
- 直接转移：原 Crew 完整 Roster `Deassign` 后目标 Crew 完整 Roster `Assign`。
- 双向交换：双方 Crew 完整 Roster 互换（每个 Crew 取消原 Roster + 接收对方 Roster）。
- 候选 Crew 资格：待恢复 Roster 所有已加载航段机型精确匹配（`7M` ≠ `7M8`）；同 Rank 优先，只允许同 Rank 或更高 Rank Crew 降级执行较低 Rank 任务（`crewRankOrder <= requiredRankOrder`），低 Rank Crew 不得执行高 Rank 任务。
- 跨基地/跨岗位/跨机组类型本身不禁止，但计入更高直接/虚拟成本，并在方案详情中明示。
- 时间相邻：双向交换候选按 `|待恢复 Roster 开始时间 - 候选交换 Roster 开始时间|` 升序排序；本期不设 0/30 分钟硬门槛。
- 排序：直接转移成本/影响最小优先；双向交换两 Crew 完全合规优先；时间差最小优先；不影响后续任务优先。
- 后续任务检查：仅检查待恢复 Roster 结束时间之后第一个任务，不检查更后续任务。

**方案二：当前基地 Standby Crew 替换（Callout Standby）**
- 目标 Crew 必须存在 `Assignment Group=SBY` 的地面任务；待恢复 Roster 开始时间落在 SBY 任务 [开始, 结束] 区间内（**包含两端边界**，如 SBY 10:00-18:00 时 10:00 或 18:00 视为覆盖），仅判断 Roster 开始时间，不判断结束时间。
- 处理：保留目标 Crew 原 SBY 任务（不取消、不转换状态），新 Roster 与 SBY 任务允许时间重叠；以图标和专用颜色标注为 `Callout Standby`，并在方案详情中显示该例外状态。
- 排序：Rank 相同优先 → 基地相同优先 → 不影响后续第一个任务优先 → 本日历年累计总飞行时间升序（仅读 CC 或 FD Manday `blh`，不跨表混合）→ 成本低/稳定性高优先。
- 唯一性：一个待恢复 Roster 只能分配给一个 Standby Crew，不允许多个 Standby Crew 共同完成。
- Callout 例外仅豁免匹配 SBY 任务与被恢复 Roster 的重叠，其他 Rule 仍按当前 Ruleset 正常检查。

**共同约束**
- Apply/Draft：直接转移 = `Deassign + Assign` Draft；双向交换 = 双方 Deassign/Assign Draft；Callout Standby = 原 Crew Deassign + Standby Crew Assign + 保留 SBY 的 Callout 标记 Draft。
- 已完成 Roster（`Roster end < Now()`）不进入上述两类方案。

### 2.8 Preview 双入口等价

Detail 内"在 Live Gantt 中预览"按钮 = 方案卡/方案列表 `Preview` 按钮 = 同一会话级 Preview 渲染器，共享 Crew 置顶、双态叠加、`Before`/`After` 颜色、Pairing 同行的 Before/After、临时 PairingID 负数化、不入库。不得两套 Preview 状态；切换选项必须清除旧预览。

### 2.9 方案卡 = 方法选择区（同一 UI 元素）

整块可点击方案卡（7.4）= 方法选择区域（14.4），只承担按方案类型（方案一 / 方案二 / 方案三 Cross-base 子方式 1/2）过滤候选。候选区独立固定高度可滚动，底部 `Apply` 保持可见不滚出视口；方案切换/勾选/Detail/Preview 必须严格同步到当前选中方案。

### 2.10 方案三：Cross-base 方案（编号独立，与基础方案一/方案二并列筛选）

**子方式 1：Duty 内新增 DHD 航段**（源 Pairing 首尾航段均为 FLY 时启用）
- 在源 Pairing 第一个 Duty 的首航段前插入去程 DHD（B→A），在最后一个 Duty 的末航段后插入回程 DHD（A→B）。
  - B = 候选 Crew 的基地；A = 原 Pairing 的基地。
- **不创建独立半环 Pairing**；Pairing/Duty 数量不变，仅航段序列扩展。
- DHD 间隔 2-6 小时（不得 < 2h 含地面操作，不得 > 6h 避免长待命），按 Crew base 本地时间。
- DHD 候选从 `flight` 表直查（不依赖已加载数据），间隔越短排序越前。
- DHD 定位窗口内目标 Crew 除匹配 Callout SBY 外不得有其他任务重叠。
- 子模式：子方式 1.a 跨基地 Standby（保留 SBY）、子方式 1.b 跨基地 Swap（双方交换完整 Roster）。

**子方式 2：复用首尾 DHD**（源 Pairing 首尾航段均为 DHD 时启用）
- 触发：首/末航段均为 DHD + 首 DHD 落地机场在 `base` 静态数据 + 末 DHD 起飞机场在 `base` 静态数据 + 两 base 相同。
- 去掉这两个 DHD 形成新"基地任务环"，分配给该 base 其他 Crew；不创建新 DHD。
- 删除首 DHD 后 Pairing 与 Roster 的 `base` 取 `middle[0].depArp`，服务端从 DB 航段重算，不信前端传入。
- 目标 Crew ≠ 原 Crew；中间航段时间窗口内不得与已有非 SBY 任务重叠。

**共同约束**
- Acting Rank 不得写死 `CA`；必须动态继承源 Crew 在该 Pairing 的 `rosterActingRank`，缺失回退 `flightActingRank`，再缺失候选无效。
- `plan=1` 时修改原 Pairing；`plan>1` 时创建只含中间航段的新 Pairing 并写入 `plan=1`。
- 成本：子方式 2 扣除复用 DHD 成本（节省额显示在方案详情）；子方式 1 计入新增 DHD 航段成本。

### 2.11 综合恢复（多告警组合）

- 顶层 Option = 完整 Crew 组合；子方案仅作明细。Rule 检查/可执行/失败原因顶层聚合；任一子方案失败整个组合过滤。Draft、Pairing Preview、Gantt Before/After 递归覆盖全部子方案；子方案状态不能独立 Apply。
- **同一 Crew 同一待恢复 Roster 在一个 Option 内部只能出现一个恢复决策**（即同一 (源 Roster, 目标 Crew) 组合在 Option 内不重复）。多个 Option 之间可以存在对同一 Roster 的不同目标 Crew 候选，但 Option 内部对该 Roster 只能落一种恢复方式。
- **Option 排序按 KPI 综合升序**：成本（直接成本 + 虚拟成本 × 权重）升序优先；成本相同时按 Roster 整体稳定性降序（稳定性越高越靠前）；仍相同按后续任务影响数升序；再相同按年度总飞时升序；最终稳定排序字段见 7.6 / 16.2 Q8。

### 2.12 接口/事务/日志/安全

- 跨 Crew/Pairing/Roster Flight 正式修改同一数据库事务；事务外缓存失效、Composition fill、Rule 重检、Manday 重算失败不反写已提交数据。
- 结构化日志：`requestId`、操作人、`method`、`operation`、对象 ID、Pairing 模式、结果状态；无凭据/完整 Crew 数据。
- 错误统一 `code/data/message` 包装；不返回数据库堆栈。
- 所有写保留 `created_by/created_at/updated_by/updated_at`；不提供 Recovery 回滚接口。
- 前端 `localExecutable`、勾选、按钮禁用只是交互保护，不是授权边界；服务端必须重校验对象归属/Crew 资格/锁/Draft 范围。
- 查询用参数化 ORM/SQL；Schema 约束所有入参。

### 2.13 UI/性能/索引

- 业务弹窗用 `@rois/ui` `AppDialog`；UI 文案英文；样式走 `packages/ui/src/styles/globals.css`；改完前端样式跑 `npm run check:ui` 报 0 hard violation。
- Live Gantt 首屏 1-2 秒出数据；Roster/Pairing 加载不被完整历史/证照阻塞。
- 单批读取失败最多重试一次；禁止按 Crew/日期递归二分并发重试。
- 必备索引：`roster_flight(crew_id, sch_str_dt_utc)`、`pairing(division, sch_str_dt_utc)`、Pairing Segment `(pairing_id, duty_seq, seg_seq)`、Pairing Composition `pairing_id`，限定未删除记录。
- `scenario/run-health` 仅在 Scenario 页面活跃时轮询；服务端短时缓存并合并同刻探测。

### 2.14 不在本期范围（显式禁止）

真实 OPS 接入；恢复后 Crew 通知；方案撤销/回滚；自动批准所有方案；完整成本结算/工资对接；全网络自动恢复；删除/替代现有 Rule Engine；顶层 `Recovery` 菜单；不在 4.1 列出的功能扩展。

---

## 3. 验收清单

**数据与告警**
- [ ] Crew 1012 + Pairing 135559 + `7M8` 航段 + 仅 `737` 资格 → Alert Center 出现 8004，消息含 `Crew fleet 7M8 is not a valid qualification`。
- [ ] 同一 Crew 同一 Pairing 补充有效 `7M8` 资格 → 8004 消失。
- [ ] 同一 Crew 三个不同 Pairing 均无资格 `7M8` → 三条独立 8004，不合并/丢失。
- [ ] Ruleset 异步初始化完成前不出现伪造空告警；完成后告警与 WebSocket 频道正确更新。

**入口与可恢复性**
- [ ] 未配置恢复方式的 Rule / 缺 Pairing / `Roster end < Now()` 的告警，`Recovery` 入口/勾选框禁用并附原因。
- [ ] 为非 8004 Rule 注入 method 后该 Rule 告警自动可恢复，不改前端入口。

**方案生成与过滤**
- [ ] 方案一、方案二、方案三 Cross-base 子方式 1/2 均能生成对应候选。
- [ ] 方案一（直接转移/双向交换）：目标 Crew 机型精确匹配、降级 Rank 规则（`crewRankOrder <= requiredRankOrder`）生效；双向交换按开始时间差值升序排序；后续任务仅检查结束时间后第一个任务。
- [ ] 方案二（Callout Standby）：目标 Crew 存在 `Assignment Group=SBY` 任务，SBY 区间包含两端边界；Callout SBY 任务保留且与新 Roster 允许时间重叠；一个 Roster 仅一个 Standby Crew。
- [ ] 方案三 Cross-base 子方式 1 候选的 DHD 间隔 2-6h、插入原 Duty 首/末航段边界、不创建独立半环 Pairing。
- [ ] 方案三 Cross-base 子方式 2 触发条件（首尾 DHD + base 静态数据 + 两 base 相同）严格生效；调整后 base 由服务端从 DB 重算。
- [ ] 模拟 Rule 失败候选从可选项移除，保留 Crew/Rule ID/原因。
- [ ] 完成 Roster 不生成方案；候选范围严格限制已加载数据。

**Preview 与 Apply**
- [ ] Detail 内"在 Live Gantt 中预览"与方案卡 `Preview` 共享同一渲染器，切换选项时旧预览清除。
- [ ] `Apply` 仅写 Draft；Gantt `Save`/`Ctrl+S` 落库后 Rule 重检/Manday/缓存按既有链路完成。
- [ ] `Ctrl/Cmd+R` 打开综合工作流；`Ctrl/Cmd+Enter` 在可执行且详情未开时等价 `Apply`；输入框/文本框内不触发。

**综合恢复**
- [ ] 顶层 Option 一次性 Rule 检查；任一子方案失败整个组合过滤；子方案状态仅作明细。
- [ ] 同一 (源 Roster, 目标 Crew) 组合在 Option 内部只出现一次；不同 Option 之间可有不同目标 Crew 候选。
- [ ] Option 按 KPI 排序（成本升序 → 稳定性降序 → 后续任务影响数升序 → 年度总飞时升序 → 稳定排序字段），方案比较区显示排序依据。

**后端与适配器**
- [ ] 8004 适配器两路（`pairing_segment.fleet_seg` 回退链 + `crew_fleet` 有效期资格）齐备；缺一即失败。
- [ ] 跨 Crew/Pairing/Roster Flight 写操作同事务。
- [ ] 后端 `/api/recovery/apply-option` 等存在但前端不调用；Rule Server 不可达明确失败。
- [ ] 结构化日志覆盖必要字段，无凭据/完整 Crew 数据；错误统一 `code/data/message`。

**性能/索引/UI**
- [ ] 首屏 Roster 1-2 秒可见；单批失败仅一次重试，不递归倍增。
- [ ] 必备索引存在；`npm run check:ui` 0 hard violation。

**测试与回归**
- [ ] `test:8004-regression` 全绿（1012/135559/7M8 样例）。
- [ ] Playwright 覆盖：登录 → 筛选 → Alert Center 出现 8004 → 勾选 → Preview → Apply Draft → Gantt Save → 告警消失；截图归档 `docs/assets/screenshots/<module>/<feature>-Ver<N>.png`。
- [ ] 涉及规则/告警查询/Ruleset 选择/Live 数据加载的改动必须先过 `test:8004-regression`。

### 3.9 测试用例与回归场景（按层与场景列举）

> 每条 case 给出 输入 / 操作 / 预期；任何 LLM 接手时必须按本节补全或新建对应测试，全部 PASS 后才能交付。

**A. Vitest — 基础方案业务规则（对应 §2.7）**

| ID | 输入 | 操作 | 预期 |
|---|---|---|---|
| A1 | 直接转移候选：原 Crew Roster 含 `7M8` 航段；目标 Crew 只有 `737` Fleet 资格 | 模拟直接转移 | 候选在 Rule 模拟阶段被移除，保留 Rule ID `8004` + 失败原因 `Crew fleet 7M8 is not a valid qualification` |
| A2 | 双向交换候选：原 Roster `7M8`，目标 Crew 只有 `737` 资格；交换后目标 Crew 仍需 `7M8` 资格 | 模拟双向交换 | 候选被移除，原因同上 |
| A3 | Rank 降级：原 Roster 需要 `CA`（order=1），目标 Crew 是 `FO`（order=2） | 模拟转移 | 候选被移除（`crewRankOrder > requiredRankOrder`，低 Rank 不得执行高 Rank） |
| A4 | Rank 升级/同 Rank：原 Roster `FO`（order=2），目标 Crew `FO`/`CA` | 模拟转移 | 候选保留 |
| A5 | 时间相邻排序：候选 A 与原 Roster 相差 30min，候选 B 相差 2h | 触发双向交换候选排序 | A 排在 B 前 |
| A6 | 跨基地/跨岗位/跨机组类型 | 模拟任何方案 | 候选保留，但成本/详情显示更高成本影响 |
| A7 | Callout Standby：目标 Crew SBY 任务 10:00-18:00；待恢复 Roster 开始 18:00 | 模拟 | 候选保留（边界包含） |
| A8 | Callout Standby：SBY 10:00-18:00；Roster 开始 09:59 | 模拟 | 候选被移除 |
| A9 | Callout Standby：两个不同 SBY Crew 均覆盖开始时间 | 模拟 | 仍只生成两个独立选项（不允许多个共同完成一个 Roster） |
| A10 | Callout 标识：SBY 任务被匹配后 | Apply Draft 后 | 原 SBY 任务仍在 Roster 序列，标注 `Callout Standby`（图标 + 颜色），不取消、不转换状态 |
| A11 | Roster 结束时间 < Now | 任何方案 | 不生成候选，`Recovery` 入口禁用 |
| A12 | Roster 结束时间 == Now | 任何方案 | 视为未完成，正常生成候选 |

**B. Vitest — Cross-base 方案（对应 §2.10）**

| ID | 输入 | 操作 | 预期 |
|---|---|---|---|
| B1 | Cross-base 子方式 1：源 Pairing 首尾航段均为 FLY；候选 Crew 基地 B 与原 Pairing 基地 A 不同 | 跨基地追加 DHD 半环 | 候选生成；不创建独立半环 Pairing；DHD 插入原 Duty 首航段前/末航段后 |
| B2 | Cross-base 子方式 1：去程 DHD 间隔 1h（< 2h） | 跨基地追加 DHD 半环 | 候选被移除（间隔 < 2h 违反地面操作时间） |
| B3 | Cross-base 子方式 1：去程 DHD 间隔 7h（> 6h） | 跨基地追加 DHD 半环 | 候选被移除（间隔 > 6h 避免长待命） |
| B4 | Cross-base 子方式 1：去程 DHD 间隔 4h，回程 DHD 间隔 5h | 跨基地追加 DHD 半环 | 候选保留，间隔越短排序越前 |
| B5 | Cross-base 子方式 1.a 跨基地 Standby：目标 Crew 在 B 基地存在 `Assignment Group=SBY` 覆盖 Roster 开始时间 | 跨基地追加 DHD + 保留 SBY | 候选保留；SBY 任务保留；DHD 插入原 Duty 边界 |
| B6 | Cross-base 子方式 1.b 跨基地 Swap：目标 Crew 在 DHD 定位窗口内有非 SBY 任务重叠 | 跨基地 Swap | 候选被移除（DHD 窗口不得有非 SBY 任务重叠） |
| B7 | Cross-base 子方式 2：源 Pairing 首尾航段均为 DHD；首 DHD 落地机场 = X，末 DHD 起飞机场 = X，且 X 属于 `base` 静态数据 | 跨基地复用首尾 DHD | 候选生成；新 base = `middle[0].depArp`；首尾 DHD 移除 |
| B8 | Cross-base 子方式 2：首 DHD 落地机场和末 DHD 起飞机场不同 | 跨基地复用首尾 DHD | 候选被移除（两 base 不相同） |
| B9 | Cross-base 子方式 2：首 DHD 落地机场不在 `base` 静态数据 | 跨基地复用首尾 DHD | 候选被移除 |
| B10 | 共同：Acting Rank 源 Crew `rosterActingRank=FO`；新 Pairing | 任何跨基地方案 | 新 Pairing Composition 该 Rank `plan=1`；不得写死 `CA` |
| B11 | 共同：源 Pairing Acting Rank `plan>1` | 任何跨基地方案 | 创建新 Pairing（仅含中间航段），新 Pairing 该 Rank `plan=1` |
| B12 | 共同：源 Pairing Acting Rank `plan=1` | 任何跨基地方案 | 修改原 Pairing（不创建新 Pairing） |
| B13 | 共同：目标 Crew = 原 Crew | 任何跨基地方案 | 候选被移除 |
| B14 | 共同：跨基地 DHD 候选 | 排序 | 按 DHD 间隔升序，间隔相同时按成本/稳定性 |

**C. Vitest — 候选范围与 Rule 适配器（对应 §2.6、§2.3、§2.4）**

| ID | 输入 | 操作 | 预期 |
|---|---|---|---|
| C1 | 已加载 50 个 Crew，DB 全量 5000 个 Crew | 触发候选生成 | 候选只来自已加载 50 个；DB 全量 Crew 不出现 |
| C2 | 模拟 Rule 失败（8004 + 其它 Rule 任意新增告警） | 候选生成 | 该候选从可选项移除，保留 Crew/Rule ID/原因 |
| C3 | 适配器：`pairing_segment.fleet_seg` 为 NULL | 8004 重算 | 回退航班/Pairing 机型；任一适配器缺失 → 适配器层明确失败 |
| C4 | 适配器：`crew_fleet` 资格 `eff_dt/exp_dt` 包含航段日期 | 8004 重算 | 该 Fleet 行不告警 |
| C5 | 适配器：`crew_fleet` 资格 `exp_dt` 早于航段日期 | 8004 重算 | 该 Fleet 行告警 |
| C6 | 适配器：`crew_fleet` 不含 `is_valid` 字段 | 读取代码 | 不读、不写该字段；有效性仅用 `eff_dt/exp_dt` 判定 |
| C7 | Rule Server 不可达 | 启动/重算 | Live Server 明确失败提示，无"重算成功"或"空告警" |
| C8 | Ruleset 异步初始化未完成 | 告警查询 | 等待，不得伪造空告警；不得回退 `103`/旧字符串 |
| C9 | Ruleset 加载完成后 | 告警查询 | 自动重新查询已加载 Crew 告警并加入对应 WebSocket 频道 |

**D. Vitest — 综合恢复与多告警组合（对应 §2.11）**

| ID | 输入 | 操作 | 预期 |
|---|---|---|---|
| D1 | 3 条 8004 告警，候选生成 | 综合恢复 | 顶层 Option 是 Crew 组合；任一子方案失败整个组合过滤 |
| D2 | Option 内同一 (源 Roster, 目标 Crew) 组合出现两次 | 综合恢复 | 合并为一条，仅落一种恢复方式 |
| D3 | Option 排序 | 多个 Option | 成本升序 → 稳定性降序 → 后续任务影响数升序 → 年度总飞时升序 → 稳定排序字段 |
| D4 | 子方案状态 | UI | 仅作明细展示，不能独立勾选 Apply |
| D5 | Draft / Pairing Preview / Gantt Before-After | 综合恢复 Apply | 递归覆盖全部子方案；不能因 UI 展开遗漏其他 Crew/Roster |
| D6 | 同一 Crew 三个不同 Pairing 均无资格 `7M8` | 8004 适配器 | 生成三条独立 8004 告警，不合并、不丢失 |

**E. Vitest — Apply / Save 链路与接口（对应 §2.5、§2.12）**

| ID | 输入 | 操作 | 预期 |
|---|---|---|---|
| E1 | Apply 选定 Option | 触发 Apply | 仅构造 `RecoveryDraftPlan` + `addDraftOp` 写 Gantt Draft；不调用 `/api/recovery/apply-option` 等后端提交接口 |
| E2 | Gantt `Save` / `Ctrl+S` | 触发 Save | 走既有锁、Rule 预检、事务、缓存刷新链路；`roster_flight` 落库 |
| E3 | Source vs target Crew 相同 | 任何写接口 | 后端 409 事务回滚 |
| E4 | 源 Roster 已被其他用户修改 | Save | 走版本/锁冲突路径，明确错误，不反写已提交数据 |
| E5 | 跨 Crew/Pairing/Roster Flight 写操作 | 任一保存 | 同事务；事务外缓存失效、Composition fill、Rule 重检、Manday 重算失败不回写已提交数据 |
| E6 | 错误响应 | 任何后端 | 统一 `code/data/message` 包装，不返回数据库堆栈 |
| E7 | 结构化日志 | 任何 Recovery 调用 | 字段 `requestId`、操作人、`method`、`operation`、对象 ID、Pairing 模式、结果状态；无凭据/完整 Crew 数据 |
| E8 | 审计字段 | 任何 Recovery 写 | 保留 `created_by/created_at/updated_by/updated_at` |
| E9 | `/api/recovery/apply-option` | 客户端调用 | 本期前端不调用；接口仅作前向兼容入口存在于 `live-server/src/routes/recovery/recovery.ts` |

**F. Playwright — 端到端流程（截图归档 `docs/assets/screenshots/recovery/<feature>-Ver<N>.png`）**

| ID | 流程 | 预期 |
|---|---|---|
| F1 | 登录 → 选 Roster Pane → 应用筛选（含 Crew 1012）→ 打开 Alert Center | Alert Center 显示 8004 告警，消息含 `Crew fleet 7M8 is not a valid qualification`；截图 `F1-alert-center-1012-Ver1.png` |
| F2 | 在 Alert Center 勾选该 8004 告警 → 点击 `Ctrl/Cmd+R` 或 `Recovery selected` | 打开综合 Recovery 工作流，方案比较区显示方案一/方案二/Cross-base 子选项 |
| F3 | 在方案一/方案二下任选一个 Crew 候选 → 点击 `Detail` | 表格展示 Before/After 颜色区分 + 图例；截图 `F3-detail-Ver1.png` |
| F4 | 同一选项 → 点击 `Preview` | Live Gantt 同屏叠加恢复前/后 Roster；受影响 Roster 置顶 + Before/After 标签 + 不同颜色虚线框；Callout SBY 保留黄色 `C` 标识 |
| F5 | 切换到另一个候选选项 | 旧预览清除，新选项预览生效；不混用 |
| F6 | 选定 Option → 点击 `Apply`（或 `Ctrl/Cmd+Enter`） | 仅 Gantt Draft 更新；正式数据库无变化；Gantt 显示 `Recovery` 标记但 Alert Center 8004 仍存在 |
| F7 | 点击 Gantt `Save` / `Ctrl+S` | Live 数据库落库；Alert Center 8004 告警消失；Pairing 状态刷新；Rule 重检通过 |
| F8 | 方案三 Cross-base 子方式 1：选择 Cross-base → 选跨基地 Crew | Gantt 预览：原 Pairing 在首/末 Duty 边界插入 DHD 航段，Pairing 数量不变；截图 `F8-crossbase-1-Ver1.png` |
| F9 | 方案三 Cross-base 子方式 2：源 Pairing 首尾 DHD 且 base 相同 | 预览：首尾 DHD 移除，base 更新为保留航段首段起飞机场；截图 `F9-crossbase-2-Ver1.png` |
| F10 | 不可恢复告警：非 8004 / 缺 Pairing / `Roster end < Now()` | Alert Center 列表行展示，`Recovery` 按钮/勾选框禁用并显示原因（悬停/aria-label） |
| F11 | 已完成 Roster `Roster end < Now()` | 不显示 `Recovery` 入口，不生成方案 |
| F12 | `Ctrl/Cmd+R` 在输入框/文本框内按下 | 不触发综合工作流 |
| F13 | `Ctrl/Cmd+Enter` 在详情弹窗打开时按下 | 不触发 Apply |
| F14 | 不可执行或 Rule 检查失败时点 `Apply` | 按钮禁用 + 显示原因 |
| F15 | Preview 状态：Live Gantt 主界面 `Reset` | 保留 Recovery Preview，仅重置布局 |

**G. test:8004-regression（命令行回归，必须全绿）**

| 场景 | 命令 | 验收 |
|---|---|---|
| G1 | `pnpm test:8004-regression` | Crew 1012 + Pairing 135559 + `7M8` 航段 + 仅 `737` Fleet 资格 → 告警查询 + WebSocket 订阅同时显示 8004，消息含 `Crew fleet 7M8 is not a valid qualification` |
| G2 | 同上 + 补充有效 `7M8` Fleet 资格 | 告警查询 + WebSocket 订阅 8004 消失 |
| G3 | 同一 Crew 三个不同 Pairing 均无资格 `7M8` | 三条独立 8004 告警，不合并/丢失 |
| G4 | 关闭本地 Rule Server 后跑 G1 | 启动/重算明确失败，Alert Center 不出现伪造空告警 |
| G5 | 修改 `LegalityStore.selectedId` 为无效 ID | 告警查询/WS 订阅失败/重试，不得回退到 `103`/旧字符串 |

**H. 改动前必须先过的硬门槛**

任何涉及以下模块的代码改动，必须先跑 A/B/C/D/E 中对应 case + `test:8004-regression` 全绿，再交付：
- 告警查询、WebSocket 订阅、Ruleset 选择/初始化
- 8004 适配器、Rule Server 客户端、SKIP 路径（如有）
- 候选生成、过滤、排序、模拟预览
- Preview 双入口、Apply Draft、Gantt Save 链路
- 综合恢复顶层 Option 聚合
- 方案三 Cross-base 子方式 1/2、Cross-base DHD 插入/复用、Acting Rank 动态继承
- 接口契约、事务、缓存失效、Composition fill、Rule 重检、Manday 重算

---

## 4. 范围

**本 prompt 覆盖**：gantt 前端（Alert Center、Recovery Violation Dialog、Preview 渲染、Apply Draft、方案卡/候选区）；live-server 后端（`/api/recovery/*`、`/api/draft/*`、Pairing/DHD 服务、方案三 Cross-base 子方式 1/2、事务/锁、Redis 键、Rule Server 客户端）；rule-engine-rs + 本地 Rule Server + Live 8004 适配器；测试与回归（`test:8004-regression`、135559/7M8 样例、Playwright、Vitest）。

**不在范围**：§2.14 列出的全部项；不在 4.1 列出的功能扩展（需先回写需求文档与本文件）。

---

## 5. 工作守则

> 告警看 Alert Center；Rule 检查必经本地 Rule Server 严禁 SKIP/降级；Ruleset 严禁硬编码；Apply 写 Draft、Save 才落库；方案三 Cross-base 子方式 1 在 Duty 内插 DHD 航段（不创建半环 Pairing）、子方式 2 复用首尾 DHD；8004 数据源两适配器齐备；索引与性能不能回退。