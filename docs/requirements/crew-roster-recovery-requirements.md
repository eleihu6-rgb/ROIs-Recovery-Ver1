# Crew Roster Recovery 机组恢复需求文档

> 项目：ROIS Recovery
> 文档状态：需求基线，供后续手工优化
> 版本：2.5
> 日期：2026-09-06

---

## 1. 文档目的

本文档定义 ROIS 系统中 Crew Roster Recovery（机组排班恢复）功能的业务目标、功能范围、用户流程、数据影响、规则检查和验收标准。

本文档是后续开发和业务讨论的基线。标记为“待确认”的内容不应被视为最终业务规则。

## 2. 背景与目标

航班发生机型、机尾号或运行时间变化后，原有机组可能不再满足机型资格、航段衔接、休息时间或其他运行规则。排班员需要快速识别受影响对象，比较可行的恢复方案，并将确认后的方案同步到正式排班。

功能目标：

- 收集并模拟 OPS 航班计划变化。
- 自动识别受影响的 Flight、Pairing、Duty、Roster 和 Crew。
- 基于当前生效 Ruleset 自动检查合规性并生成告警。
- 在 Live 界面集中查看当前 Roster、Pairing 数据的告警。
- 对 Rule 8004 告警提供可执行的机组恢复方案。
- 提供至少两种机组恢复方案。
- 展示方案执行前后的排班差异、成本差异和影响范围。
- 用户确认后保存并生效，重新执行规则检查。
- 全流程可追踪，避免人工多处修改导致数据不一致。

## 3. 用户角色

| 角色 | 主要职责 |
|---|---|
| 排班员 | 查询航班变化、处理告警、比较并应用恢复方案 |
| 排班主管 | 本期不参与 Recovery 方案审批；后续迭代可扩展为审批角色 |
| 系统管理员 | 配置菜单、权限、Ruleset 和基础数据 |
| OPS 接口用户 | 提供或模拟航班计划变化 |

## 4. 功能边界

### 4.1 本期范围

- OPS 航班计划模拟查询和编辑。
- 航班运营字段变化后的关联对象同步。
- 机型资格不合规等 Rule 告警。
- Roster Pane 的 Alert Center 告警入口；废弃 Live 顶层 Violation 入口。
- Rule 8004 告警的 Roster 交换和 Standby Crew 替换。
- Standby Crew 替换方案。
- Crew 之间交换任务方案。
- 方案前后差异、成本和影响数量展示。
- 方案确认、保存、生效和再次检查。
- 本期具备应用权限的用户确认方案后可直接生效，不需要主管审批。
- 用户必须手工选择并执行恢复方案；在用户执行前，所有分析、比较和 Live Gantt 展示均为 Scenario/Sandbox 预览，不写入正式数据库。
- Recovery 页面 `Apply` 只将已选恢复方案写入当前 Gantt 的未保存 Draft，并立即更新 Live Gantt；`Apply` 不直接写入正式数据库，也不替代 Gantt 原有 Save。
- 正式数据库提交统一复用 Gantt 原有 Save 按钮或 `Ctrl+S`，并沿用 Draft 的锁、Rule 预检、Undo/Redo 和保存结果处理。
- 正式执行时，直接转移按完整 Roster 的 `Deassign + Assign` 语义处理；双向交换按两个 Crew 的完整 Roster 互换语义处理。
- Live Gantt、Live Roster、Pairing 和告警状态刷新。

### 4.2 本期不包含

- 真实 OPS 外部接口的正式接入。
- 恢复方案生效后向 Crew 发送通知；本期仅预留后续通知能力。
- 已保存并执行的 Recovery 方案的用户撤销、回滚或恢复历史版本。
- 自动批准所有恢复方案。
- 完整的成本结算或工资系统对接。
- 自动优化全航班网络的恢复方案。
- 删除或替代现有 Rule Engine。
- 独立的顶层 `Recovery` 菜单。

机组恢复能力统一通过 `System → Interface`、Live 告警和 Live Gantt 等工作流进入。

## 4.3 本期规则恢复范围

本期从 Live 告警进入 Recovery 时，只有告警来源为 Rule ID `8004` 的记录进入已定义的自动恢复流程。

- Rule `8004`：提供 Crew Roster 转移/交换和 Standby Crew 替换两种恢复方案。
- 其他 Rule：可以展示告警，但 Recovery 按钮应显示不可用、待配置或提示暂不支持，不能错误套用 8004 的恢复逻辑。
- Ruleset 仍由系统当前生效配置决定；`8004` 是本期恢复策略的业务分支，不代表页面硬编码所有规则检查逻辑。
- 已完成 Roster 定义为该完整 Roster 的结束时间早于当前时刻（`Roster end < Now()`）。已完成 Roster 不显示可执行 Recovery 入口，也不生成转移、交换或 Callout Standby 方案；结束时间等于 `Now()` 时仍按未完成处理。
- 恢复候选必须同时满足基础资格/时间筛选和模拟后的完整 Rule 检查。模拟后仍存在 `8004`，或产生任意新增 Rule 告警的候选，必须从最终可选方案列表中移除，并保留 Crew、Rule ID 和失败原因供诊断。

### 4.4 Live Roster 加载完整性与回归保护

Live Gantt 在用户应用筛选条件后，必须先获得当前筛选范围内的 Crew 标识、当前有效 Rank/Base/Fleet 及 Rule 检查所需的资格摘要，并基于该 Crew 集合发起 Roster 加载。Crew 的完整历史、证照、团队等非首屏数据不得阻塞 Roster 加载。

- Crew 首屏或筛选加载超时、失败时，页面必须显示明确的加载失败状态；不得把“未能取得 Crew”静默展示为 Load Roster = 0。
- 当筛选结果包含 Crew 时，Roster 请求必须使用这些 Crew ID；Roster 响应为空才可以显示 Roster 数量为 0。
- 当前有效资格摘要必须在首屏响应中可用，以保证 8004 等 Rule 检查与 Recovery 候选分析不会因性能优化丢失资格输入。
- 该加载链路必须保留自动化回归测试：筛选加载使用 Gantt 精简视图，并在成功后写入 selectedCrewIds，供 Roster 批量加载使用。

## 5. OPS 航班计划模拟接口

### 5.1 页面位置

`System → Interface → OPS Flight Schedule Simulation`

### 5.2 查询条件

| 条件 | 要求 |
|---|---|
| 航班号 | 支持模糊匹配 |
| 航班日期 | 按指定日期查询 |

查询结果默认限制返回数量，具体上限由技术实现配置。

### 5.3 查询结果字段

页面展示以下字段。Recovery 相关的 Roster、SBY 任务、航班时间展示、候选排序和日历年边界均以 Crew base 本地时间为准；时间数据必须携带时区信息，不能只按无时区的字符串或 UTC 日期进行比较。

- 航班号
- 航班日期
- 起飞机场
- 目的机场
- STD
- STA
- ETD
- ETA
- ATD
- ATA
- 机型
- 机尾号
- Edit 操作

原始需求中 STD、STA 出现两次，本期将第二组解释为 ATD、ATA。

### 5.4 编辑规则

航班号、航班日期、起飞机场和目的机场在该页面只读，不允许通过本接口修改。

允许编辑：

- STD
- STA
- ETD
- ETA
- ATD
- ATA
- 机型
- 机尾号

机型和机尾号使用下拉框。下拉框当前来自前端静态配置；当前值即使不在静态列表中，也必须保留为可见和可保存的选项，避免旧数据无法编辑。

### 5.5 保存行为

用户点击 Save 后，系统应：

1. 校验输入格式和时间关系。
2. 保存航班运营字段变化。
3. 同步关联 Pairing Segment。
4. 同步关联 Duty 的计划和实际时间锚点。
5. 同步关联 Roster Flight。
6. 更新 Pairing 的机型及整体计划/实际开始结束时间。
7. 刷新受影响对象缓存和实时通知。
8. 对受影响 Pairing、Roster 和 Crew 触发 Rule 检查。
9. 在页面提示同步和检查结果。

如保存或级联同步失败，系统不得只更新部分对象而不提示用户；应返回明确错误并保留可审计的失败信息。

## 6. 影响分析与告警

航班变更后，系统应沿以下关系分析影响范围：

```text
Flight
  ├─ Pairing Segment
  │    └─ Pairing / Duty
  └─ Roster Flight
       └─ Roster / Crew
```

至少需要识别：

- 受影响航班数量。
- 受影响 Pairing 数量。
- 受影响 Duty 数量。
- 受影响 Roster 数量。
- 受影响 Crew 数量。
- 受影响的其他关联任务。

### 6.1 规则检查触发时机

- 航班保存后自动触发。
- Recovery 方案预览时触发或调用预检查。
- 用户应用方案后再次触发最终检查。
- 关键的 Live Gantt 手工调整仍沿用现有实时检查机制。

### 6.2 规则检查范围

规则必须依据当前生效 Ruleset 执行，不应在业务页面硬编码规则编号。

至少包括：

- Crew 与机型的资格匹配。
- Crew 与机尾号或机队的资格匹配（如当前 Ruleset 使用该维度）。
- 航段衔接和任务连续性。
- Duty 最大工作时间。
- 最小休息时间。
- 连续工作限制。
- 累计工作时间或 Manday 限制。
- Roster 时间重叠。
- Pairing 整体合法性。
- Standby Crew 或交换后 Crew 的完整合规性。

### 6.3 告警内容

告警至少应包含：

- 告警级别。
- 规则名称或规则标识。
- 受影响 Crew。
- 受影响 Roster、Duty、Pairing 和 Flight。
- 当前值与期望条件。
- 告警产生时间。
- 可执行的 Recovery 操作。

### 6.4 Live Violation 告警入口

Live Roster Pane 的条件工具栏提供唯一的 `Alert Center` 入口。用户点击后，系统展示当前 Live 界面数据范围内的告警列表；Live 顶层工具栏不再提供独立 `Violation` 入口，避免告警列表重复。

“当前界面数据”明确指当前 Live 页面已经加载到前端的 Roster、Pairing 数据，包含当前页面上下文和筛选结果。点击 `Alert Center` 时只基于这批已加载数据生成告警，不重新从数据库查询未加载的全量数据；用户刷新或改变页面筛选条件后，告警列表随新的已加载数据重新计算。

告警列表至少展示以下字段：

| 字段 | 要求 |
|---|---|
| Rule ID | 规则编号，例如 `8004` |
| CrewID | 受影响机组标识 |
| PairingID | 受影响 Pairing 标识 |
| Flight Date | 受影响航班日期 |
| Flight Number | 受影响航班号 |
| Violation Detail | 告警详细内容，支持完整查看 |
| Recovery | 进入机组恢复流程的操作按钮 |

交互要求：

- 点击 `Alert Center` 后打开列表面板、弹窗或等价的工作区，不离开当前 Live 页面。
- 告警列表应保持当前 Roster、Pairing 的上下文。
- 告警没有关联 Pairing 或航班时，相关字段显示为空值，不得阻止列表展示。
- `Recovery` 按钮仅对已配置恢复策略的告警可用；本期重点支持 Rule `8004`。
- Violation 告警页不显示固定的红色 `8004 Recovery` 标记；Rule ID、告警级别和每一行可用的 `Recovery` 操作已足以表达处理范围，避免将列表错误地表现为只包含单一 Rule。
- 用户可从告警定位到对应 Crew、Pairing、Roster 或航班上下文。
- 恢复成功后，告警列表应刷新；已解决告警不应继续显示为待处理状态。

#### 6.3.1 综合恢复选择

Alert Center 不再以单条告警作为 Recovery 的唯一入口，而是支持在当前已加载的告警列表中同时选择多条可恢复的 Rule `8004` 告警，并通过 `Recovery selected` 一次性生成综合恢复方案。选择范围严格限定为当前已经加载并显示的告警，不得因批量操作扩展到数据库全量数据。

- 每条可恢复 `8004` 告警提供复选框；非 `8004`、缺少 Pairing、或完整 Roster 已结束的告警不可选择。
- 支持当前列表/筛选结果的全选和取消全选，并显示已选告警数量。
- 用户未选择任何告警时，批量 Recovery 按钮禁用；Recovery 入口不得再直接提交单行恢复。
- `Ctrl/Cmd+R` 在 Live 页面打开当前已加载的全部可恢复 `8004` 告警的综合 Recovery 工作流；用户可在生成前返回 Alert Center 调整选择。
- 从 Roster 告警浮显进入 Recovery 时仍保持单告警上下文，这是定位入口；用户进入工作流后可返回 Alert Center 追加其他已加载告警。

#### 6.4.1 Roster 告警悬浮入口

当用户将鼠标悬浮到 Live Gantt 中带有告警的 Roster 时，现有告警浮显必须提供 `Recovery` 入口。该入口只对支持恢复策略的 Rule `8004` 显示，并使用与 Alert Center 行按钮相同的 Recovery 工作流、当前已加载数据范围和候选约束；不得在浮显中实现第二套恢复逻辑。已完成 Roster 不显示可执行 Recovery 入口。

### 6.5 8004 告警恢复入口

用户点击 Rule `8004` 告警的 `Recovery` 按钮后，系统应：

1. 读取告警关联的 Crew、Pairing、Roster、Duty 和受影响航班。
2. 自动分析可行的 Roster 直接转移和双向交换候选。
3. 自动分析当前执行 Standby 任务的 Crew 候选。
4. 分别生成两类恢复方案的预览结果。
5. 对每个候选方案执行模拟后的规则检查。
6. 只将满足方案约束的候选标记为可执行。

当用户选择多条告警时，上述步骤应对所有选中告警同时执行。系统不得先执行一条恢复再用结果继续计算下一条；必须在同一个候选组合中统一验证所有 Crew、Roster、Pairing 和时间约束。

若没有任何可行方案，系统应明确显示无可用候选及原因，例如无相邻 Roster、后续任务受影响、无时间覆盖的 Standby Crew 或模拟后仍存在 8004 告警。

系统应在一次 Recovery 分析中自动生成两类方案，并分别列出该方案下所有满足基础筛选条件的候选 Crew。每个候选 Crew 对应一个独立的“恢复选项”，不能只显示方案类型汇总或只返回单个推荐结果。

综合恢复时，每个方案下的一个顶层 `Option` 是一个完整 Crew 组合，而不是单个 Crew。一个组合 Option 内必须展开显示每条选中告警对应的子恢复选项，包括源 Crew、目标 Crew、完整原 Roster/新 Roster、方案类型、Rule 结果和成本。不同目标 Crew 组合视为不同 Option；如果任一子方案不可执行，或组合违反天然限制条件，则该组合不得进入可执行列表。

Recovery 候选查询范围严格限制为当前 Live 页面已经加载的 Roster、Pairing 及其关联 Crew、任务和 SBY 数据。系统不得为了生成候选而从数据库查询当前页面未加载的其他 Crew、Roster 或 Standby Crew；因此当前已加载范围内没有可行候选时，应明确显示“当前加载范围内无可用候选”。

方案生成应尽量并行执行。任何一类方案生成失败时，应单独显示该类方案的失败原因，不得将另一类已经生成的结果隐藏或误标记为无候选。

## 7. Recovery 方案

### 7.1 方案一：其他 Crew 转移或交换 Roster（8004）

该方案用于将待恢复 Roster 转移或交换给其他 Crew，使涉及的 Crew 在变更后均满足规则要求。方案一包含两类恢复选项：

- **直接转移 Roster**：仅将当前 Crew 的待恢复 Roster 转给具备执行资质的其他 Crew，不交换对方的 Roster。该选项在业务上归入方案一的部分交换，预期成本和排班影响最小。
- **双向交换 Roster**：当前 Crew 与其他 Crew 交换各自 Roster，交换后双方均需合规。

Roster 交换的最小粒度为完整 Roster，不允许只交换单个 Duty 或单个航段。一个 Roster 也不允许拆分给多个 Crew；直接转移和双向交换都必须保持一个 Roster 由一个 Crew 完整执行。

业务操作语义固定如下：

- 直接转移：原 Crew `Deassign` 待恢复的完整 Roster，再由目标 Crew `Assign` 该完整 Roster。
- 双向交换：原 Crew `Deassign` 自己的完整 Roster，目标 Crew `Assign` 该 Roster；同时目标 Crew `Deassign` 自己的完整 Roster，原 Crew `Assign` 该 Roster。
- 以上操作必须以完整 Roster 为单位执行，不能只处理一个 `roster_flight` 行；若现有接口只支持任务行，必须由 Recovery 包装层编排完整 Roster 的全部任务。

直接转移是方案一的优先候选类型：只要目标 Crew 具备执行该 Roster 的资质，且模拟后不产生任何新增告警，即可作为可执行恢复选项展示。

跨基地、跨岗位和跨机组类型恢复允许执行，但只允许降级使用 Crew：

- Rank 使用 `order` 表示级别，`order` 越小表示 Rank 越高。
- 目标任务要求的 Rank 为 `requiredRankOrder`，候选 Crew 的 Rank 为 `crewRankOrder`。
- 只有 `crewRankOrder <= requiredRankOrder` 时才允许分配，表示同 Rank 或由更高 Rank Crew 降级执行较低 Rank 任务。
- 不允许低 Rank Crew 执行高 Rank 任务，即 `crewRankOrder > requiredRankOrder` 的候选必须排除。
- 跨基地、跨岗位或跨机组类型本身不构成禁止条件，但应计入更高的直接成本或虚拟成本，并在方案详情中明确展示。
- 无论是否跨基地、跨岗位或跨机组类型，目标 Crew 仍必须通过资质、Ruleset 和新增告警检查。

处理逻辑：

1. 以当前告警 Crew 的 Roster 作为待恢复 Roster。
2. 仅在当前 Live 页面已经加载的数据范围内查询其他 Crew，先分析仅转移待恢复 Roster 的候选，再分析双向交换 Roster 的候选。
3. 对直接转移候选，模拟取消当前 Crew 的待恢复 Roster 分配，并将该 Roster 分配给目标 Crew。
4. 对双向交换候选，模拟两个 Crew 交换 Roster 后的完整任务序列。
5. 对涉及 Crew 的交换后 Roster、Duty、Pairing 及相邻任务执行 Rule 检查。
6. 排除会导致任一 Crew 后续任务产生新的合法性告警、任务冲突或无法衔接的候选。
7. 生成按优先级排序的可执行候选及不可执行原因。

最终候选过滤要求：

- 目标 Crew 必须对待恢复完整 Roster 中所有已加载航段的机型具备精确资格；不能用任意字符串包含关系替代机型代码匹配，例如仅具备 `7M` 资格不得视为具备 `7M8` 资格。
- 直接转移、双向交换和 Callout Standby 均必须检查恢复后目标 Crew 的完整 Roster 规则结果。
- 模拟 Rule 检查失败的候选不得继续显示为可选择或可执行项；界面可在方案汇总中显示“已过滤”数量，并展示失败原因。

时间相邻的计算方式：

```text
Roster 开始时间差值 = abs(待恢复 Roster 开始时间 - 候选交换 Roster 开始时间)
```

时间差值越小，表示两个 Roster 越相邻。该差值用于双向交换候选的排序和稳定性比较。本期不将 0 分钟或 30 分钟硬编码为固定门槛；默认按差值升序展示候选，并由规则检查结果决定是否可执行。若业务需要限制最大时间差，应将其配置化，而不是写死在页面逻辑中。

候选排序优先级：

1. 直接转移后目标 Crew 完全合规且不产生任何新增告警。
2. 直接转移的成本和影响最小。
3. 双向交换后两个 Crew 均完全合规。
4. 双向交换的 Roster 开始时间差值最小。
5. 转移或交换不影响任一 Crew 的后续任务，不产生新的合法性告警。
6. 其他成本、基地、岗位和运行条件相同或更优的候选。

“不影响后续任务”在本期 Recovery 候选评价中定义为：检查待恢复 Roster 结束时间之后，相关 Crew 的第一个任务。该第一个任务应满足衔接、休息、时间不冲突和当前 Ruleset 要求；不将更后续的任务纳入本项“是否影响后续 Roster”的时间窗口。除该评价窗口外，最终方案应用前仍需对受影响对象执行系统现有的最终 Rule 检查。

### 7.2 方案二：当前 Standby Crew 替换（8004）

该方案用于抓取当前正在执行 Standby 地面任务的 Crew，将待恢复 Roster 从原 Crew 转移给该 Standby Crew。

Standby Crew 的判定条件：

- Crew 当前存在地面任务。
- 该地面任务的 `Assignment Group = SBY`。
- 待恢复 Roster 的开始时间位于该 SBY 任务的开始时间和结束时间范围内，且包含开始和结束边界；例如 SBY 为 `10:00–18:00` 时，待恢复 Roster 开始时间为 `10:00` 或 `18:00` 均视为覆盖。该判断只使用待恢复 Roster 的开始时间，不判断 Roster 结束时间。

处理逻辑：

1. 读取待恢复 Roster 的开始时间。
2. 仅在当前 Live 页面已经加载的数据范围内查询 Crew 的地面任务，筛选 `Assignment Group=SBY` 的任务。
3. 保留 SBY 任务时间范围覆盖待恢复 Roster 开始时间的 Crew。
4. 校验 Standby Crew 的岗位、机型资格、工作限制和其他 Ruleset 条件。
5. 取消当前 Crew 对待恢复 Roster 的分配。
6. 将待恢复 Roster 分配给选定 Standby Crew。
7. 保留该 Crew 原有的 SBY 地面任务，不取消、不转换其原 SBY 任务状态；待恢复 Roster 与该 SBY 任务允许时间重叠。
8. 对 Standby Crew 的新 Roster、相邻任务及原 Crew 变更后的任务重新执行 Rule 检查。
9. 在 Live Gantt 和方案详情中，以图标和专用颜色将该 SBY 任务标注为 `Callout Standby`，并显示该任务与被恢复 Roster 允许重叠的例外状态。
10. 生成方案预览结果。

本方案中的重叠例外仅适用于已匹配的 `Assignment Group=SBY` 地面任务与被恢复 Roster。除该明确例外外，其他任务重叠仍必须按照当前 Ruleset 检查。`Callout Standby` 是界面和审计中的业务标识，不代表将原 SBY 任务从 Crew 排班中删除或改为其他任务类型。

Standby Crew 候选按以下顺序综合排序：

1. Rank 相同优先；若 Rank 不同，只保留满足降级规则的更高 Rank Crew。
2. 基地相同优先。
3. 不影响待恢复 Roster 结束时间之后第一个任务的 Crew 优先。
4. 本日历年累计总飞行时间较少的 Crew 优先；总飞行时间从候选 Crew 对应的 Manday 表 `blh` 字段读取。CC 和 FD 使用不同的 Manday 表，只能读取该 Crew 类型对应表中的 `blh`，不得跨表混合或汇总。
5. 在上述条件相同或接近时，优先总成本较低、Roster 稳定性较高的候选。

上述排序用于生成推荐顺序，不替代资质检查和 Rule 检查。原 SBY 任务保留，应用后不自动取消或转换状态。一个待恢复 Roster 只能分配给一个 Standby Crew，不允许多个 Standby Crew 共同完成同一个 Roster。

### 7.3 其他恢复方案

除 Rule `8004` 两种基础方案外，Cross-base Recovery 属于本期已纳入的扩展恢复能力；其他恢复方案仍作为后续扩展，不纳入本期自动生成范围。

#### 7.3.1 Cross-base Recovery

Cross-base Recovery 允许使用其他基地 Crew，通过两个 DHD 半环 Pairing 或复用待恢复 Pairing 已有的首尾 DHD，将目标 Crew 定位到待恢复 Roster 的执行基地。候选仍严格限制在当前 Live 已加载数据内，并且目标 Crew 必须通过完整 Roster 的机型、Rank、岗位和 Rule 检查。

本期包含以下三类 Cross-base 选项：

- **Cross-base Callout Standby**：其他基地 Crew 存在覆盖待恢复 Roster 开始时间的 `Assignment Group=SBY` 地面任务时，保留该 SBY，增加去程和回程 DHD 半环，并将完整待恢复 Roster 分配给该 Crew。
- **Cross-base Swap**：其他基地 Crew 与原 Crew 交换完整 Roster，并增加去程和回程 DHD 半环；除匹配的 Callout Standby 外，DHD 定位窗口内不得与已有任务重叠。
- **Cross-base Destination**：当待恢复 Pairing 的第一个和最后一个航段均为 `DHD`，且第一个 DHD 的目的地等于目标 Crew 的基地时，复用现有首尾 DHD，不再创建新的 DHD 半环，只将中间航段交给目标 Crew。

Cross-base Destination 的对象规则如下：

1. Recovery 不得将 Acting Rank 固定为 `CA`。拆分或修改后的 Pairing 的 Acting Rank 必须动态继承原 Crew 在该 Pairing 上的 `rosterActingRank`；缺失该字段时再使用同一 Roster 的 `flightActingRank`，仍缺失则候选无效。
2. 新建或修改后的目标 Pairing 对应该 Acting Rank 的配比为 `plan=1`。当原 Pairing 该 Acting Rank 的 `plan=1` 时，直接在原 Pairing 上移除首尾 DHD 并修改原 Pairing；当 `plan` 大于 1 或无法使用原单一位置时，创建只包含中间航段的新 Pairing，并写入该 Acting Rank、`plan=1` 的 Composition。
3. 第一个 DHD 的目的地必须与目标 Crew 在该航班时刻生效的基地一致；目标 Crew 不能与原 Crew 相同，且中间航段时间窗口内不能与其已有非 SBY 任务重叠。
4. 原 Pairing 的首尾 DHD 从目标 Crew 执行的 Roster 中移除；当创建新 Pairing 时，新 Pairing 的来源和审计信息必须标记为 Recovery。
5. 删除首段 DHD 后，调整后 Pairing 的 `base` 必须等于保留航段中第一个航班的起飞机场（`middle[0].depArp`）；无论是原 Pairing 原地修改还是创建新 Pairing，Pairing 记录和新建的所有 Roster 记录必须使用同一个调整后 base，不能继续沿用删除 DHD 前的旧 base。该字段必须由服务端从数据库航段重新计算，不能信任前端传入的 base。
6. 成本模型扣除被复用的首尾 DHD 成本；方案详情必须显示节省金额和被移除的两个 DHD 航班。
7. Preview 中原 Pairing 显示 `Modified`，新建 Pairing 显示 `Created`；同一 PairingID 原地修改时，Pairing Pane 同一行上半部显示修改前 Pairing 字段，下半部显示修改后 Pairing 的 base、时间范围和航段数；清除 Preview 时不保留新建 Pairing。正式保存仍复用 Gantt Draft/Save 事务链路。

Cross-base 所需参数为支持基地、恢复基地、去程/回程 DHD 航班（Destination 模式为空）、预留时间、最早起飞提前量、回程延后量、原 Crew Acting Rank 和目标 Pairing/Standby 标识。参数必须由服务端重新校验，不能信任前端候选结果。

以下能力仍属于后续扩展：

- 延误或调整任务时间。
- 拆分或合并 Roster。
- Crew deadhead。
- 取消部分 Duty。
- 增加定位航段。
- 多 Crew 联动恢复。

### 7.4 恢复方案选项与详细恢复内容

Recovery 结果按以下层级组织：

```text
Recovery
  ├─ 方案一：Crew Roster 转移/交换
  │    ├─ 恢复选项：候选 Crew A
  │    ├─ 恢复选项：候选 Crew B
  │    └─ ...
  └─ 方案二：Standby Crew 替换
       ├─ 恢复选项：Standby Crew C
       ├─ 恢复选项：Standby Crew D
       └─ ...
```

每个方案至少需要展示：

- 方案名称、方案说明和候选选项数量。
- 可执行、不可执行和规则检查中的选项数量。
- 每个候选 Crew 的 CrewID、当前任务摘要和候选排序依据。
- 每个恢复选项必须保持完整 Roster 由单一 Crew 执行，不得拆分 Roster 或让多个 Standby Crew 共同完成。
- 原 Roster 与新 Roster 的变化详情。
- 取消的 Roster 数量及明细。
- 新增的 Roster 数量及明细。
- 变化的 Roster 数量及明细。变化包括 Crew 归属、任务、时间、航班、机型或状态发生变化。
- 受影响的后续 Roster 数量。
- 方案的直接成本、虚拟成本、加权总成本和币种或成本单位。
- 模拟 Rule 检查结果、剩余告警和不可执行原因。
- Rule 检查失败并被过滤的候选数量、CrewID、失败 Rule ID 和失败原因；被过滤候选不得出现在可选择列表中。
- `Detail` 操作按钮。
- `Preview` 操作按钮。用户查看、切换方案或打开 Detail 时只改变当前 Recovery 工作流的浏览状态；只有用户明确点击 `Preview` 时，才更新 Live Gantt 的会话级预览。
- 可执行候选必须提供 Crew 勾选框。一次 Recovery 分析中只能勾选一个候选 Crew/恢复选项；勾选新 Crew 时系统自动取消此前勾选，未被勾选的 Crew 不得同时执行同一待恢复 Roster。不可执行或 Rule 检查未通过的候选不得勾选。

综合恢复时，勾选粒度调整为顶层组合 Option：用户只能勾选一个完整组合并执行，不能分别勾选来自不同组合的子 Crew。顶层组合的 Detail、Preview、Rule 检查和 Apply 必须覆盖其全部子恢复选项。

每个综合恢复 Option 必须满足以下天然限制：

- 一个完整 Roster 在同一 Option 内只能归属一个 Crew，不能被多个 Crew 同时执行。
- 一个 Crew 在同一时间内只能执行一个非 `Callout Standby` 的完整 Roster；组合生成阶段必须检查所有新增、交换、跨基地定位后的时间区间。
- 组合中的任一重复 Roster、同 Crew 时间重叠、接收后新 Rule 告警或仍存在的目标 `8004`，均使整个组合无效并过滤掉。

方案类型必须可交互选择。用户点击方案一或方案二所在的方案行后，具体恢复选项列表只展示当前选中的方案类型；不得将两类方案选项混在同一个列表中。切换方案类型时，系统应自动选中该类型下首个可执行恢复选项；若该类型没有可执行选项但存在候选，则选中首个候选并保留不可执行原因。

方案类型选择器必须使用整块可点击的方案卡，而不是仅依赖方案名称文字作为点击入口。每张卡应展示方案名称、方案说明、候选数量、可执行数量和代表性成本，并通过方案专属色带、边框、底色以及明确的 `Selected` 状态标识当前方案。点击卡片任意主要区域都应切换方案，并立即刷新下方候选列表；切换过程中应显示稳定的选中反馈，不得出现点击命中区域过小或点击后无可见变化的情况。

“原 Roster”和“新 Roster”必须以可比较的对象标识展示，至少包含 RosterID、CrewID、日期、开始结束时间、PairingID 和主要航段；无法匹配原新对象时，应明确标识为取消或新增。

### 7.5 Roster 整体稳定性评价

系统应为每个恢复选项计算 Roster 整体稳定性分数，用于同一告警下的方案排序和方案间比较。分数建议为 0 至 100，分数越高表示对现有排班的扰动越小。

推荐计算公式：

```text
影响率 =
  (0.35 × 影响后续 Roster 数量
 + 0.30 × 取消 Roster 数量
 + 0.20 × 新增 Roster 数量
 + 0.15 × 变化 Roster 数量)
 / max(1, 评估范围内原 Roster 总数)

Roster 稳定性 = round(max(0, min(100, 100 × (1 - 影响率))), 2)
```

计算约定：

- “评估范围”至少覆盖原 Crew、候选 Crew 及其受影响的后续排班；所有候选必须使用同一范围口径，才能横向比较。
- 同一个 Roster 同时属于多个影响类别时，按业务定义去重，默认优先计入取消或新增，再计入变化，避免重复累计。
- 影响后续 Roster 数量表示恢复任务结束时间之后的第一个任务因本次恢复而发生冲突、需要重新衔接或产生任务变化的 Roster 数量；本期不将更后续的任务计入该指标。
- 权重应配置化，初始权重采用上式；系统应在结果中保留各项原始数量和权重，便于解释评分。
- 如未来有正式业务评分模型，可替换该公式，但不得改变页面字段和比较结果的基本含义。

### 7.6 方案与恢复选项比较

系统应在两类方案生成后提供统一比较区域。比较至少包括：

| 比较维度 | 要求 |
|---|---|
| 恢复方式 | Crew 交换 Roster 或 Standby Crew 替换，并标识具体候选 Crew |
| 影响 Crew 数量 | 因方案发生 Roster 变更、取消或新增的去重 Crew 数量 |
| 影响 Roster 数量 | 取消、新增、变化以及受影响后续 Roster 的数量，需明确是否去重 |
| Roster 整体稳定性 | 按 7.5 统一公式计算，显示分数和构成明细 |
| 直接成本 | 机组替换、加班、交通、酒店等可直接计价成本 |
| 虚拟成本 | 稳定性损失、后续任务扰动、人工处理和运行风险等折算成本 |
| 总成本 | 直接成本与加权虚拟成本之和 |
| 规则结果 | 通过、仍有告警、阻断或检查失败 |

推荐成本公式：

```text
总成本 = 直接成本 + 虚拟成本 × 虚拟成本权重
```

虚拟成本权重必须配置化并在界面展示。初始演示模型可使用 `1.0`，正式业务模型上线后可按成本单位或运营策略调整。系统必须同时展示直接成本、虚拟成本、权重和总成本，不能只展示一个无法解释的总金额。

方案比较区域应同时提供表格视图和 Live Gantt 双态视图：

- 表格视图用于逐项比较候选 Crew、Roster 变化、稳定性、成本、影响数量和 Rule 结果。
- Live Gantt 双态视图用于并列或切换查看恢复前与模拟恢复后的 Crew、Roster、Duty、Pairing 和任务时间变化。
- 两种视图必须使用同一恢复选项模拟结果，切换视图不得重新产生不一致的数据。

方案比较表必须以稳定的视觉色彩区分恢复方式：Crew Roster 转移/交换方案使用蓝色系色带、圆点或边框；Standby Crew Callout 方案使用琥珀色系色带、圆点或边框。当前选中方案使用同一方案色系的加强状态，不得只使用文字或顺序区分。每个方案下的候选恢复选项也应继承对应方案色带，以便用户在筛选和切换方案后仍能辨识方案来源。

方法选择区只承担“按恢复方式过滤候选”的职责，不再同时提供一份可点击的重复汇总列表；方案比较指标集中在方法卡和候选详情中。候选较多时，候选列表必须在固定高度区域内滚动，保持方法选择、候选选择和 Apply/Preview 操作可见。

方案比较区域应支持按 Roster 稳定性、总成本、影响 Crew 数量和规则结果排序；系统可默认推荐“通过规则检查、Roster 稳定性最高且总成本较低”的选项，但推荐结果不能替代用户确认。

### 7.7 恢复选项 Detail 与 Live Gantt 预览

每个恢复选项必须提供 `Detail` 按钮。用户点击后，以表格展示该选项恢复前后的 Roster 变化，至少包括：

| 字段 | 内容 |
|---|---|
| 变化类型 | 保持、取消、新增、交换、变更 |
| RosterID | 原 Roster 或新 Roster 标识 |
| 原 CrewID | 应用前 Crew |
| 新 CrewID | 模拟应用后 Crew |
| 原日期/时间 | 应用前日期、开始结束时间 |
| 新日期/时间 | 应用后日期、开始结束时间 |
| PairingID | 关联 Pairing |
| 航班信息 | 航班号、航班日期及主要航段 |
| 变化原因 | 资格、衔接、SBY 替换或其他恢复原因 |
| Rule 结果 | 该行及相关 Crew 的模拟检查结果 |

Detail 表格必须使用固定且可识别的颜色区分前后状态：Before 使用蓝色系背景和边框，After 使用绿色系背景和边框；取消使用红色状态色，新增使用绿色状态色，保留或无变化使用中性灰色。表头或表格附近必须提供颜色图例，颜色不能只依赖文字或鼠标悬停才能识别。颜色规范应在表格视图和 Live Gantt 预览中保持一致。

用户在 Detail 中点击“在 Live Gantt 中预览”后，系统应：

1. 将该恢复选项的模拟结果加载到当前 Live Gantt 上下文。
2. 以明显的预览态标识显示原状态与模拟状态的差异，例如新增、取消、Crew 变更和时间变化。
3. 保留当前 Live 页面筛选条件，并定位到受影响 Crew、Roster 或 Pairing。
4. 允许用户返回方案比较或切换其他恢复选项。
5. 明确提示该操作仅为前端或会话级预览，不提交数据库、不更新正式 Roster、Pairing、Duty 或 Crew 数据。
6. 在用户点击正式应用前，不触发不可逆的排班变更或外部接口写入。

告警浮显交互要求：

- 带有可恢复告警的 Roster 浮显必须提供与 Alert Center 相同的 `Recovery` 入口。
- 浮显在首次显示时以当前 Gantt 指针位置作为锚点；鼠标从 Roster 移向浮显或 `Recovery` 按钮时，浮显位置不得继续跟随指针移动，避免按钮移动导致无法点击。
- 浮显操作区在非拖拽状态下必须接收鼠标事件；离开 Roster 后应保留足够的短暂隐藏延迟，使用户可以进入浮显并点击 `Recovery`。
- 浮显中的 `Recovery` 入口只负责打开统一 Recovery 工作流，不得复制候选生成、Rule 检查或 Apply 逻辑。

Preview 后不得关闭或丢失当前 Recovery 方案页面。Recovery 页面应收起为紧凑的非模态预览面板，使 Live Gantt 可见；面板必须提供返回完整方案页面的操作，用户返回后仍可切换方案、浏览 Detail、Preview 其他候选或选择执行 Crew。

每个恢复选项还必须提供 `Preview`。用户点击后，系统应在同一 Live Gantt 时间轴同时显示恢复前和恢复后的 Roster，并将原 Crew 与目标 Crew 置顶显示；不能调整当前 Live 筛选范围或查询未加载数据。恢复前受影响 Roster 使用蓝青色系和细虚线框，恢复后 Roster 使用绿色系和加粗虚线框，确保前后状态可同时辨识；未受影响 Roster 保持原始颜色。`Callout Standby` 仍保留黄色 `C` 图标和专用颜色。该动作只写入会话级预览，不得提交数据库。

Preview 的显示语义固定为双态叠加：Live Gantt 保留当前已加载的恢复前全量 Roster 作为基线，再叠加所选恢复选项中发生 Crew 归属、取消、新增、交换或 Callout 变化的恢复后 Roster。为避免同一时间段互相覆盖，Preview 自动启用重叠分道；恢复前与恢复后任务使用不同的内部预览标识，不得影响正式对象主键、选择或数据库数据。

Gantt Preview 模式下，每个受恢复方案影响的完整 Roster 左上角必须显示阶段文字：恢复前显示 `Before`，恢复后显示 `After`。`Before` 使用蓝青色文字和浅色背景，`After` 使用绿色文字和浅绿色背景，并与对应的填充色、虚线框颜色保持一致；当可视宽度不足以容纳完整文字时允许使用 `B`/`A`，但仍必须保持颜色和阶段含义可辨识。同一完整 Roster 只能显示一次阶段标签，不能在每个航段重复绘制。

Pairing Preview 与 Roster Preview 采用相同的前后态原则：

- 发生 Crew 归属变化的已有 Pairing 在 Pairing Pane 保留同一个 Pairing 行，上行显示 `Before` 及原 Crew，下行显示 `After` 及新 Crew；行背景、左侧状态线和时间轴边框使用与 Roster Preview 一致的状态色。
- Pairing 原地修改时，上行必须消费加载数据中的原始 Pairing 结构和航段，下行必须消费 Recovery 候选生成的实际 After Pairing 结构和航段，不能只切换 `Before`/`After` 标签或摘要文本。删除首尾 DHD 后，After 的航段数量、首航段起飞机场、Pairing base、开始/结束时间和航段顺序必须与候选结果一致；原 PairingID 不变时 Before/After 仍归并在同一行。
- Recovery 生成的 DHD 半环 Pairing 在 Pairing Pane 作为会话级临时行显示 `Created`，并自动置顶；该行只用于 Preview，不进入正式 Pairing 数据。
- Preview 后新增和修改的 Pairing 均优先显示在普通 Pairing 列表顶部，同时继续遵守现有冻结行优先规则。清除 Preview、关闭恢复流程或切换恢复选项后，临时 Pairing 行必须移除，表示未提交的新建 Pairing 已取消创建。
- Pairing Preview 不改变 PairingID、RosterID 或正式数据库记录；正式 Pairing 创建/调整仍随 Gantt Draft 和原有 Save 流程提交。

当用户切换恢复选项时，Live Gantt 应清除上一个选项的预览状态，或明确标识当前显示的是哪个选项，避免将不同候选的模拟结果混合展示。刷新页面或离开 Recovery 工作流后，预览状态可清除，正式数据库状态不得改变。

当 Recovery 页面处于紧凑预览状态时，方案结果仍保存在当前会话中。Live Gantt 必须以醒目的悬浮状态条标识当前处于 `Preview mode`，明确显示恢复前后状态正在同时展示且尚未保存，并提供独立的 `Clear preview` 按钮。该按钮只清除 Recovery 前后叠加预览，恢复当前已加载的正式 Live 数据，不得改变布局、筛选、缩放或正式数据库排班。主界面的 `Reset` 继续只执行原有的布局重置语义，不得隐式清除 Recovery Preview。

方案比较和 Detail 页面还必须保留表格视图。表格和 Live Gantt 双态视图均属于本期需求，不能以其中一种替代另一种。

### 7.8 方案预览

用户选择方案后，系统应先展示预览，不应在预览阶段直接写入正式排班。

预览至少展示：

- 方案名称和状态。
- 变更前 Crew/Roster 关系。
- 变更后 Crew/Roster 关系。
- 受影响 Flight、Pairing、Duty、Roster、Crew 数量。
- 新增、取消、替换、交换的任务数量。
- Rule 检查结果。
- 成本变化。
- 需要用户确认的风险或阻断项。

针对 8004 方案，预览还应明确展示：

- Roster 转移/交换方案的原 Crew、目标 Crew、转移或交换前后 Roster 以及各自后续任务影响。
- Standby 替换方案的原 Crew、Standby Crew、SBY 地面任务时间范围和被恢复 Roster 开始时间。
- SBY 地面任务与被恢复 Roster 的允许重叠标识；该 SBY 任务以图标和专用颜色标注为 `Callout Standby`。
- 方案是否仍存在 8004 或其他 Rule 告警。
- 不可执行候选的具体排除原因。

方案预览页面应同时展示“方案级汇总”和“恢复选项级详情”：方案级汇总用于比较两类恢复方式，恢复选项级详情用于选择具体 Crew。Detail 预览只读取模拟结果，正式保存仍遵循 7.9 的应用流程。

### 7.9 方案应用

用户必须在方案比较和预览后手工勾选一个候选组合 Option，并明确点击 `Apply`。一次 Recovery 分析中只能有一个被勾选的执行组合；该组合内的全部子恢复决策作为一个整体加入 Draft，任何其他组合不得同时执行同一批待恢复 Roster。

`Apply` 的语义是将恢复方案加入当前 Live Gantt 的未保存 Draft：Transfer 追加完整 Roster 的 `Deassign + Assign` Draft 操作，Swap 追加双方完整 Roster 的 Deassign/Assign Draft 操作，Callout SBY 追加原 Crew Deassign、Standby Crew Assign 和保留 SBY 的 Callout 标记 Draft 操作。Apply 完成后，Live Gantt 显示 Draft 结果，但不直接调用正式 Recovery 持久化接口、不写入正式数据库；用户仍可通过 Gantt 原有 Undo/Redo 或清除 Draft 调整结果。

用户点击 Gantt 原有 `Save` 按钮或使用 `Ctrl+S` 后，才正式提交当前 Draft。Save 统一执行现有锁校验、Rule 预检、事务提交、缓存/Pairing 刷新和最终 Rule 重检。Recovery 页面不得另设第二个数据库 Save 入口。

用户手工确认并执行方案后，系统应：

1. Save 时执行版本或并发校验，防止覆盖其他用户的最新修改。
2. 直接转移按完整 Roster 的 `Deassign + Assign` 语义执行；双向交换按两个 Crew 的完整 Roster 互换语义执行。
3. 优先复用系统已有的 `Swap`、`Assign` 和 `Deassign` 能力；如果现有接口只支持单个任务行或系统没有完整 Roster `Swap`，由 Draft 提交/后端 Recovery 包装层编排全部相关任务，不能由前端逐行直接写正式数据。
4. 由既有接口或包装层维护 Crew、Roster、Duty、Pairing 及其标识的更新行为；Recovery 页面不自行伪造正式对象。
5. Save 时记录原始状态、目标状态、操作人、操作时间、方案信息和所调用的操作类型；Apply 阶段只保留本地 Draft 操作和预览状态。
6. 保存成功后重新执行 Rule 检查。
7. 刷新 Live Gantt、Live Roster、Pairing 详情和告警列表。
8. 返回应用结果和最终合规状态。

本期一旦保存并执行成功，不支持用户撤销、回滚或恢复到执行前版本。该限制不影响既有 `Swap`、`Assign`、`Deassign` 接口自身的失败处理；接口调用失败时，系统必须返回明确错误并刷新为实际持久化状态，但 Recovery 不额外提供补偿性回滚流程。

## 8. 成本与影响比较

每个方案至少需要支持以下比较维度：

| 维度 | 说明 |
|---|---|
| 直接成本 | Standby、加班、任务替换等直接费用 |
| 运营成本 | 定位、交通、酒店或其他运行资源成本 |
| Crew 影响 | 受影响 Crew 数量及每人的任务变化 |
| Roster 影响 | 受影响 Roster 数量、取消和新增数量 |
| Duty 影响 | 受影响 Duty 数量及时间变化 |
| Rule 风险 | 阻断项、告警数量和严重级别 |
| 运行风险 | 后续衔接、资源或人工处理风险 |

本期由系统提供一个可解释的初始成本模型，用于恢复方案排序和方案比较；该模型不是最终财务结算模型，后续可根据业务数据和需求澄清持续优化。成本字段和计算方式应配置化，便于替换正式业务模型。

初始模型至少包括：

- 直接成本：Standby/Callout、加班、交通、酒店、定位、取消或延误处理，以及跨基地、跨岗位、跨机组类型带来的额外成本。
- 虚拟成本：Roster 稳定性损失、影响 Crew 数量、影响 Roster 数量、后续任务扰动和人工处理风险等折算成本。
- 总成本：按 7.6 节公式计算，同时展示直接成本、虚拟成本、虚拟成本权重和总成本。
- 本日历年累计总飞行时间：用于候选排序时，按 Crew base 本地日历年统计，并从候选 Crew 类型对应的 CC 或 FD Manday 表 `blh` 字段读取。

初始成本模型的金额、权重和折算参数应在方案结果中公开展示，避免用户只能看到无法解释的排序结果。

## 9. 界面和交互要求

- Roster Pane 条件工具栏必须提供唯一的 `Alert Center` 入口；Live 顶层工具栏不得再显示独立 `Violation` 按钮。
- `Violation` 列表必须展示当前 Roster、Pairing 界面数据范围内的告警。
- 告警行必须提供 `Recovery` 操作入口，并按 Rule ID 控制是否可用。
- Recovery 操作应从告警或相关排班对象上下文进入。
- 用户可以返回上一步，不应丢失当前查询和方案选择。
- 预览和正式应用状态应明显区分。
- Recovery 方案页面的告警上下文、恢复方式选择区和底部操作区必须保持可见；候选恢复选项在独立的固定高度区域内滚动，不能因候选数量增加而把上下文或 `Apply` 操作滚出视口。
- Crew / option 候选表必须使用固定列轨道，`CANCEL`、`ADD`、`Stability`、`Cost` 的表头与数据严格共用列宽；数值列右对齐并使用等宽数字，列分隔线和行边界应足以支持横向比较，不能仅依赖留白判断列归属。
- Alert Center、Recovery 工作流和告警浮显中的 `Recovery` 按钮均须提示 `Ctrl+R`（macOS 为 `Cmd+R`），按钮文字中的 `R` 使用下划线，按钮提供 `aria-keyshortcuts` 和悬停提示。Live Gantt 中按下快捷键时打开当前已加载告警中的第一个可恢复 `8004`，不得触发浏览器刷新；输入框、文本框和下拉框内不触发该快捷键。快捷键设置页和 Live Keyboard 帮助页必须同步列出该快捷键。
- `Apply` 必须支持 `Ctrl+Enter`（macOS 为 `Cmd+Enter`）快捷键；Recovery 页面打开且存在可执行、Rule 检查通过的已选恢复选项时，快捷键等价于点击 `Apply`，详情弹窗打开或方案不可执行时不得触发。
- `Apply` 按钮必须通过按钮悬停提示和可访问性快捷键属性明确提示 `Ctrl/Cmd+Enter`，并说明 `Apply` 只写入未保存 Gantt Draft，正式提交仍使用 Gantt `Save`/`Ctrl+S`。
- Preview 紧凑面板必须保留 `Apply` 操作；当候选仍在 Rule 检查中或检查失败时 Apply 禁用，并显示原因。
- Recovery Draft 应与普通 Gantt Draft 共用 Save、`Ctrl+S`、Undo/Redo、锁和 Rule 预检链路；Recovery 页面不得绕过 Gantt Save 直接落库。
- Roster 告警浮显必须提供与 Alert Center 相同的 `Recovery` 入口，点击后打开同一 Recovery 工作流。
- 方案应用按钮在存在阻断性 Rule 告警时应禁用，除非用户具备明确的强制覆盖权限。
- Soft Rule 允许具备对应权限的用户强制覆盖；Hard Rule 默认阻断，只有具备 Hard Rule 覆盖角色权限的用户才能强制覆盖。
- 页面应显示加载中、无候选、无方案、保存中、成功和失败状态。
- 方案比较必须同时提供恢复前后表格视图和 Live Gantt 双态视图；Live Gantt 的 `Preview` 必须同屏叠加恢复前和恢复后 Roster。
- Recovery 相关时间字段以 Crew base 本地时间显示和计算；跨基地候选必须保留各 Crew base 时区，不能将不同基地的本地时间当作同一无时区时间直接比较。
- 所有关键操作应显示操作结果，不能只依赖浏览器控制台错误。
- 8004 恢复候选生成过程中应显示加载状态，避免用户重复点击或误以为无候选。
- 方案应用后应返回告警列表，并定位或高亮原告警的最新状态。
- 本期方案确认后无需主管审批；具备应用权限的用户可直接提交并生效。
- 跨基地、跨岗位和跨机组类型候选允许生成，但必须符合降级 Rank 规则，并显示更高成本影响。
- 候选排序应显示 Rank、基地、后续任务影响和本日历年累计总飞行时间等排序依据。
- `Callout Standby` 必须同时使用图标和颜色标识，并提供文字或悬停说明，不能只依赖颜色区分。
- `Callout Standby` 原 SBY 地面任务在恢复方案预览和正式应用后均保留，不能被取消或自动转换状态。
- Recovery 应同时生成方案一和方案二，并在每类方案下按候选 Crew 组合展开多个恢复 Option；每个组合 Option 内展开所有选中告警对应的 Crew 子恢复方案。
- 每个单 Crew 子方案和组合 Option 都应展示原 Roster、新 Roster、取消、新增和变化 Roster 的明细及数量；组合汇总必须同时包含所有子方案的前后差异。
- 每个恢复选项应展示影响后续 Roster 数量、Roster 稳定性、直接成本、虚拟成本和加权总成本。
- 方案比较区域应同时比较恢复方式、影响 Crew 数量、影响 Roster 数量、Roster 整体稳定性和总成本。
- 每个恢复选项必须提供 `Detail` 按钮，并以表格展示恢复前后 Roster 差异。
- 用户从 `Detail` 进入 Live Gantt 预览时，系统只能显示模拟差异，不得提交数据库或修改正式排班。
- 切换恢复选项或离开预览时，系统不得混用不同选项的模拟数据。
- Recovery 候选只能从当前 Live 已加载数据中产生；范围内无候选时应明确提示，不得静默查询数据库全量 Crew 或 Roster。
- 用户未手工执行前只允许 Scenario/Sandbox 预览，不写入数据库；保存执行后本期不提供撤销或回滚操作。
- 每个综合恢复 Option 必须通过完整 Roster 单归属和 Crew 时间不重叠校验；校验失败的组合不展示为可执行方案。
- Preview 必须同时显示组合内所有 Crew 和所有受影响 Roster 的 Before/After；Detail 必须展示每个子方案的变化明细。
- 综合 Option 的 Rule 检查、可执行状态和失败原因必须在顶层聚合：系统以组合的全部受影响 Crew、Pairing 和 After Roster 一次性执行检查；任一子方案产生新告警或目标 `8004` 未消除时，整个顶层组合进入过滤结果，不允许只过滤子方案后继续执行部分组合。子方案状态仅作为明细展示，不能成为独立 Apply 对象。
- 组合 Option 的 Draft、Pairing Preview 和 Gantt Before/After 预览必须递归覆盖全部子方案；Apply 只能对一个顶层组合生成完整 Draft，不能因 UI 当前展开的子方案而漏掉其他 Crew 或 Roster。
- `Apply` 只创建未保存 Draft；只有 Gantt `Save`/`Ctrl+S` 才执行正式 `Swap`、`Assign`、`Deassign` 并落库。
- 本期不向 Crew 发送站内消息、WebSocket、邮件或其他外部通知；恢复后 Crew 通知能力仅保留后续扩展接口和审计数据。

### 9.1 技术实现细节基线

本节定义本期 Recovery 代码的接口、校验、异常、安全、日志和测试约束。它们是实现约束，不改变既有候选排序、稳定性公式、成本模型或接口成功响应字段。

### 17.1 接口契约

Recovery 方法服务按 Rule 无关的恢复能力提供接口；调用方可以来自 8004，也可以来自后续其他 Rule：

| 接口 | 用途 | 关键操作 |
|---|---|---|
| `GET /api/recovery/methods` | 返回可用恢复能力目录 | `roster-assignment`、`callout-standby`、`cross-base` |
| `POST /api/recovery/methods/roster-assignment` | 完整 Roster 转移或双向交换 | `transfer`、`swap` |
| `POST /api/recovery/methods/callout-standby` | 保留 SBY 并转移完整 Roster | `callout-standby` |
| `POST /api/recovery/methods/cross-base` | 跨基地定位、交换或目的地复用 | `standby`、`swap`、`destination` |
| `POST /api/draft/commit` | 提交 Gantt 未保存 Draft | `cross-base-recovery` 等既有 Draft 操作 |

`POST /api/recovery/methods/cross-base` 的公共字段包括 `sourceCrewId`、`sourcePairingId`、`targetCrewId`、`supportBase`、`recoveryBase`、`division`、`targetRosterActingRank`、定位时间参数和 `rulesetId`。其中：

- `standby` 必须提供 `standbyTaskId`、`outboundFlightId` 和 `returnFlightId`。
- `swap` 必须提供 `targetPairingId`、`outboundFlightId` 和 `returnFlightId`。
- `destination` 必须提供 `destinationSplit`；`outboundFlightId` 和 `returnFlightId` 必须为空。`destinationSplit` 包括 `destinationBase`、`middleFlightIds`、`removedDhdFlightIds`、动态 `actingRank` 和 `createsPairing`。

成功结果统一返回方法类型、操作类型、受影响 Crew/Pairing、删除数量和新增数量；正式保存后的 Rule 重检与 Manday 重算仍是既有异步后置流程。错误响应保留现有 `code/data/message` 包装，不向客户端返回数据库堆栈或凭据。

### 17.2 参数校验和防御逻辑

- 前后端均使用结构化 Schema 校验字符串长度、Crew/Pairing/Flight ID 类型、基地代码长度、时间参数非负和操作所需字段；不能用字符串拼接 SQL 或依赖前端禁用按钮保证安全。
- 服务端在事务中重新读取源 Roster、源 Pairing、Pairing Segment、Composition、Crew 生效基地和目标 Crew 占用任务；客户端的 `mockItems` 只用于 Draft/Preview 展示，不能作为正式写库依据。
- 源 Crew 与目标 Crew 必须不同；源 Roster 必须存在且不能是导入记录；目标 Crew、目标 Pairing、SBY Task、DHD 航班和所有关联对象必须仍然有效。
- Destination 必须再次确认首尾航段均为 DHD、第一个 DHD 目的地等于目标 Crew 生效基地、中间航段集合与源 Pairing 一致、首尾 DHD 集合与请求一致，并确认源 Crew Acting Rank 与请求一致。
- Destination 的 Acting Rank 只能来自源 Crew 在该 Pairing 上的 `rosterActingRank`，必要时回退到同一 Roster 的 `flightActingRank`；不得在 Recovery 服务中写死 `CA` 或其他 Rank。创建新 Pairing 时只插入该 Rank 的 `plan=1` Composition，并由事务完成后续 fill 刷新。
- 除明确允许的 Callout SBY 任务外，目标 Crew 在恢复或 DHD 定位时间窗口内不得存在重叠任务；跨基地的去程、回程航班必须满足基地、最早起飞、预留时间和回程延后条件。
- Preview 临时 PairingID 使用负数，仅允许存在于会话/临时规则检查数据中；正式数据库 PairingID 必须由数据库生成，接口不得接受负数持久化 PairingID。
- 新建临时 Pairing 进入规则预览时，规则引擎不使用正数 Pairing 限定过滤该临时对象，而使用受影响 Crew 范围并保留聚焦时间区间，避免漏检新 Pairing 的告警。

### 17.3 异常处理、事务和状态

| 场景 | 服务行为 | 前端行为 |
|---|---|---|
| Schema 参数错误 | 返回 400，不执行数据库写入 | 显示字段或请求错误，保留当前 Recovery 上下文 |
| 源/目标对象变化、资格失败、重叠或 Rank 不一致 | 返回 409，事务回滚 | 清除该选项的可执行状态，提示重新生成方案 |
| 数据库或内部服务错误 | 返回 500，事务回滚并记录错误日志 | 显示失败状态，不伪造成功结果 |
| Rule Preview 失败或产生新告警 | 选项标记 `failed`，保留 Rule ID 和详细原因 | 禁止勾选和 Apply，允许查看诊断信息 |
| Apply | 只写入 Gantt Draft，不正式落库 | 保留 Preview/Recovery 上下文，正式保存仍走 Gantt Save |
| Gantt Save | 在既有锁和事务中正式执行 | 成功后刷新 Roster、Pairing、告警和缓存；后置检查失败必须显示处理中/失败状态 |

跨 Crew、Pairing 和 Roster Flight 的正式修改必须在同一数据库事务中完成；事务外的缓存失效、Composition fill 刷新、Rule 重检和 Manday 重算失败不能反写已提交数据，必须记录日志并通过刷新/重试机制收敛到实际数据库状态。本期不提供 Recovery 专用回滚接口。

### 17.4 安全和权限

- 所有正式 Recovery 接口必须经过现有认证上下文，操作人从认证用户取得；客户端提交的用户名不能替代认证身份。
- 查看、Preview、Apply、Soft Rule 覆盖和 Hard Rule 覆盖使用独立权限；Hard Rule 覆盖默认阻断，具体 Role 编码和覆盖原因字段仍按 16.2 待确认项处理。
- 服务端重新校验对象归属、当前 Ruleset、Crew 资格、锁和 Draft 范围；前端的 `localExecutable`、复选框和按钮禁用只是交互保护，不是授权边界。
- 查询使用参数化 ORM/SQL；基地、Crew、Pairing、Flight 和 Ruleset 参数必须经过 Schema 约束，日志不得写入密码、Token 或完整敏感人员资料。
- 所有恢复写入必须保留 `created_by/created_at/updated_by/updated_at` 等现有审计字段；Recovery 专用审计实体、覆盖原因和版本签名属于后续生产化完善项。

### 17.5 结构化日志和可诊断性

Recovery 日志使用结构化字段记录 `requestId`、认证操作人、method、operation、sourceCrewId、targetCrewId、sourcePairingId、targetPairingId、目标临时/正式 Pairing 模式和结果状态。成功日志只记录对象摘要和数量；拒绝日志记录校验失败类别和安全可公开的原因；异常日志包含错误对象和事务阶段，但不包含凭据或完整 Crew 数据。

日志至少覆盖：Schema 拒绝、候选/Apply 业务冲突、事务失败、缓存失效失败、Pairing Composition 刷新失败、Rule 重检失败和 Manday 重算失败。日志不是前端成功状态的替代，页面必须根据接口结果和后续刷新显示状态。

### 17.6 自动化测试和代码注释

- 前端 Recovery 单元测试覆盖完整转移、完整交换、Callout SBY、跨基地 DHD、动态 Acting Rank、`plan=1` 原 Pairing 修改、`plan>1` 新 Pairing `plan=1`、DHD 成本节省、资格过滤、重叠过滤、已完成 Roster 过滤、Draft 编码和唯一候选选择。
- Rule Preview 单元测试覆盖正数 Pairing 的局部叠加、负数临时 Pairing 的插入、规则查询焦点降级到受影响 Crew 范围和预览告警归一化。
- 代码注释只解释事务边界、临时 ID、Rule 查询焦点、动态 Rank 继承和异常例外等非显而易见的约束，不重复描述普通赋值逻辑。
- 生产联调前必须补充带数据库事务的服务集成测试：首尾 DHD 校验、源 Rank 不一致、Composition 计划不一致、目标基地变化、并发修改和事务回滚；这些测试需要稳定的隔离数据库夹具，当前列为技术补充项而不改变本期业务计算结果。

### 17.7 当前技术待完善项

以下事项不影响本期已确认的业务计算逻辑和成功输出，但在生产化前必须补齐：Recovery 专用审计实体和版本签名、Hard/Soft Rule 覆盖接口、完整数据库集成测试、后置 Rule/Manday 状态模型、并发冲突提示、真实 CC/FD `blh` 查询统一、Callout SBY 例外传入 Rule Engine，以及 Redis/外部依赖的部署健康检查。

## 10. 权限与审计

建议权限拆分：

- 查看航班模拟接口。
- 编辑航班运营字段。
- 查看 Recovery 告警。
- 预览 Recovery 方案。
- 应用 Recovery 方案。
- 强制覆盖 Soft Rule 并应用方案。
- 覆盖 Hard Rule 并应用方案，仅授予明确配置的 Role。
- 查看 Recovery 操作历史。

审计记录至少包括：

- 操作人。
- 操作时间。
- 原始 Flight、Roster 和 Crew 状态摘要。
- 修改后的状态摘要。
- 触发原因。
- 使用的 Ruleset。
- 选择的方案。
- 被覆盖的 Rule ID、Rule 类型（Soft/Hard）、覆盖原因和用户 Role。
- 成本和影响范围。
- 最终 Rule 检查结果。
- 成功、失败或回滚状态。

覆盖策略：

- Soft Rule：允许具备“强制覆盖 Soft Rule”权限的用户覆盖；页面应展示覆盖提示并要求填写业务原因。
- Hard Rule：普通用户不得覆盖；只有具备“覆盖 Hard Rule”权限的 Role 才能覆盖，并要求填写原因、显示风险确认、记录 Role 和完整审计信息。
- 未通过权限校验时，方案应用按钮必须保持禁用，并明确提示所需权限。
- 无论覆盖 Soft Rule 还是 Hard Rule，系统都必须保留原始告警、覆盖后的状态和最终操作结果，不得将告警静默删除。

## 11. 数据一致性要求

航班变更和恢复方案应用必须保证相关对象之间的数据一致性：

- Flight 与 Pairing Segment 的航班号、日期、航线、机型和时间一致。
- Flight 与 Roster Flight 的日期、航线和时间一致。
- Duty 的时间锚点与其航段一致。
- Pairing 的整体开始结束时间与其航段一致。
- Crew 的 Roster 归属与实际任务一致。
- 缓存、WebSocket 通知和页面展示最终收敛到数据库状态。
- 正式 Recovery 应复用现有 `Swap`、`Assign`、`Deassign` 接口；预览 Scenario/Sandbox 与正式持久化状态必须隔离。
- 正式 Recovery 必须按完整 Roster 编排 `Deassign + Assign` 或完整 Roster `Swap`；现有单任务接口不足时必须由后端包装层实现。
- Recovery 时间、候选排序和日历年口径以 Crew base 本地时间计算；年度飞时数据来自候选 Crew 类型对应 Manday 表的 `blh` 字段，CC 与 FD 数据不得跨表混用。

## 12. 非功能要求

以下指标作为初始建议，最终数值待确认：

- 普通航班查询应在 2 秒内返回。
- 单航班变更后的影响分析应在 5 秒内返回预览结果。
- 方案预览应显示明确的处理进度或超时提示。
- 失败操作不能造成不可见的部分更新。
- 规则检查失败时应保留可诊断错误信息。
- 页面刷新后应能恢复到有效模块，不得因历史 Recovery 状态进入空白页面。
- 支持并发排班员编辑的版本冲突提示。

## 13. 当前技术实现基线

前端页面和配置：

- `gantt/src/components/system/interface-flight-simulation.tsx`
- `gantt/src/config/ops-flight-simulation-options.ts`
- `gantt/src/components/system/system-view.tsx`
- `gantt/src/config/system-tools.ts`
- `gantt/src/components/shell/shell-sidebar.tsx`

后端航班更新和传播：

- `live-server/src/routes/flight/flight.ts`
- `live-server/src/services/flight/flight-service.ts`
- `live-server/src/services/flight/flight-delay-propagation-service.ts`

Roster 分配和改派接口（已根据代码定位）：

- `live-server/src/routes/roster/roster.ts`：`POST /api/roster/swap`、`POST /api/roster/move`、`POST /api/roster/assign-pairing`、`POST /api/roster/assign-flight`、`DELETE /api/roster/:id` 及对应 POST 删除接口。
- `live-server/src/services/roster/roster-service.ts`：`rosterService.swap`、`rosterService.move`、`rosterService.assignPairing` 和 `rosterService.remove`。
- 当前 `rosterService.swap` 对两个指定 `roster_flight` 任务行交换 `crew_id`；当前 `rosterService.move` 对一个任务行更新目标 `crew_id`；当前 `assignPairing` 按 Pairing Segment 创建多条 `roster_flight`；当前 `remove` 执行软删除。
- 当前代码未发现名称为 `deassign` 的独立路由或服务方法；现有删除能力由 `remove` 及其路由提供，是否可作为完整 Roster Deassign 的底层能力需由包装层进一步编排和验证。
- Live Gantt 的 Roster 拖拽改派路径使用 `/api/roster/move`；该接口当前是单任务改派，不等同于 Recovery 要求的完整 Roster 转移。

当前 Recovery 已通过 Live Violation 工作流接入：候选生成严格使用当前已加载的 Live 数据，前端支持完整 Roster 转移、双向交换、Standby Callout、方案级比较、Detail 表格和 Live Gantt 前后预览。正式执行由 `POST /api/recovery/apply-option` 调用后端完整 Roster 编排，不再由前端逐行写入；后端事务执行原 Roster 软删除并按 Pairing Segment 创建目标 Crew 的完整 Roster，随后刷新 Pairing、Crew、Manday 缓存并触发 Live Rule 检查。旧的演示接口 `simulate-flight-change` 和内存 Session 接口仍保留用于 OPS 模拟页面，不代表 Live Recovery 的正式执行链路。

当前 Cross-base 已扩展为三个独立操作：`cross-base-standby`、`cross-base-swap` 和 `cross-base-destination`。Destination 模式由前端从首尾 DHD 航段和已加载 Pairing Composition 推导候选，服务端在同一数据库事务中重新读取源 Pairing、源 Crew Acting Rank、首尾 DHD、目标 Crew 生效基地和 Composition `plan`，拒绝不一致的客户端参数；`plan=1` 修改原 Pairing，其他情况创建新的单配比 Pairing，并写入动态继承的 Acting Rank 与 `plan=1`。临时负数 PairingID 只属于 Preview，规则预览在检测到该 ID 时改用受影响 Crew 范围，避免新 Pairing 被规则查询过滤。

当前实现仍属于本期可运行基线：成本参数（包括虚拟成本权重 1.0）和方案候选的前端模拟 Rule 检查按初始模型实现，持久化操作沿用现有 `updated_by`/`updated_at` 审计字段；正式成本模型、后端候选计算和 Recovery 专用审计实体可在后续迭代替换或补充。

Recovery API 当前保留在后端，独立顶层菜单入口已移除。后续应将 Recovery 工作流逐步接入 Live 告警和 System Interface，而不是重新恢复顶层菜单。

## 14. 验收标准

### 14.1 OPS 航班模拟

- 可以按航班号模糊匹配和航班日期查询。
- 查询结果包含约定的航班和运营字段。
- 航班号、日期、起飞机场、目的机场不可编辑。
- 机型和机尾号通过静态配置下拉框编辑。
- 当前值不在静态配置中时仍能正常显示和保存。

### 14.2 数据传播

- 修改航班运营字段后，关联 Pairing Segment、Duty、Pairing Head 和 Roster Flight 正确同步。
- 受影响缓存和实时页面正确刷新。
- 保存失败时有明确错误且不产生静默的部分更新。

### 14.3 规则和告警

- Roster Pane 的 `Alert Center` 可打开当前 Roster、Pairing 数据的告警列表，Live 顶层工具栏不再提供独立 Violation 入口。
- 告警列表展示 Rule ID、CrewID、PairingID、航班日期、航班号和详细内容。
- 告警列表提供 Recovery 按钮。
- 保存航班变化后自动检查受影响对象。
- 检查使用当前 Ruleset，而不是页面硬编码规则。
- 机型资格不合规能够生成告警。
- 告警包含对象、规则、级别和处理入口。
- Rule `8004` 告警可以进入已定义的两种恢复方案。
- Violation 列表只基于当前 Live 页面已经加载的数据生成，不重新查询未加载的数据库全量数据。
- Recovery 的直接转移、双向交换和 Standby 候选同样严格限制在当前 Live 已加载数据范围内。

### 14.4 8004 Recovery 方案

- 系统自动查询其他 Crew，并生成直接转移和双向交换候选。
- 系统自动生成方案一和方案二，并在每个方案下列出不同候选 Crew 对应的恢复选项。
- 每个恢复选项均展示 CrewID、原 Roster、新 Roster、取消 Roster、新增 Roster 和变化 Roster 的明细。
- Roster 交换按完整 Roster 执行，不允许只交换 Duty、航段或拆分给多个 Crew。
- 直接转移候选的目标 Crew 具备执行待恢复 Roster 的资质，且模拟后不产生任何新增告警。
- 跨基地、跨岗位和跨机组类型恢复允许执行，但仅允许同 Rank 或更高 Rank Crew 降级执行；低 Rank Crew 不得执行高 Rank 任务。
- Cross-base Destination 在首尾 DHD 条件满足时可复用首尾 DHD；目标 Pairing 的 Acting Rank 必须继承原 Crew 在该 Pairing 上的 Acting Rank，不得固定为 `CA`；对应 Composition 必须为 `plan=1`。
- 当原 Pairing 对应 Acting Rank 的 `plan=1` 时修改原 Pairing；当 `plan>1` 时创建只包含中间航段的新 Pairing，新 Pairing 对应 Acting Rank 的 `plan=1`。
- Cross-base Destination 删除首段 DHD 后，Pairing 和 Roster 的新 base 均取保留航段第一段的起飞机场；原地修改不得因复用旧 Pairing 对象而把旧 base 写回 Roster。
- 直接转移作为影响和成本较小的优先候选；双向交换后两个 Crew 的 Roster 均通过规则检查。
- 正式执行的业务语义为：直接转移执行完整 Roster 的 `Deassign + Assign`；双向交换相当于双方分别取消原完整 Roster 分配，再分配给对方。
- 如果系统没有完整 Roster `Swap`，或既有 `Swap` 仅支持单个任务行，必须由后端包装层实现完整 Roster 的转移/交换；前端不得逐行替代该业务操作。
- 双向交换候选按待恢复 Roster 与候选交换 Roster 的开始时间差值升序排序。
- “不影响后续任务”仅检查恢复任务结束时间之后的第一个任务；该任务不得新增冲突或 Rule 告警。
- 系统自动查询 `Assignment Group=SBY` 的地面任务。
- 仅保留待恢复 Roster 开始时间落在 SBY 任务时间范围内的 Standby Crew。
- 取消原 Crew 的 Roster 并分配给 Standby Crew。
- 被恢复 Roster 与匹配的 SBY 地面任务允许重叠，原 SBY 任务保留，并以图标和颜色标注为 `Callout Standby`。
- 一个待恢复 Roster 只能分配给一个 Standby Crew，不允许多个 Standby Crew 共同完成。
- 每个恢复选项均显示影响后续 Roster 数量、取消数量、新增数量、变化数量和按统一公式计算的 Roster 稳定性。
- Standby 候选按 Rank、基地、是否影响恢复任务结束后的第一个任务、本日历年累计总飞行时间综合排序。
- 方案比较明确展示恢复方式、影响 Crew 数量、影响 Roster 数量、Roster 整体稳定性、直接成本、虚拟成本、权重和总成本。
- 方案预览明确展示两种方案的前后差异、规则结果、候选和排除原因。
- 每个恢复选项提供 `Detail` 按钮，并可将选项模拟结果加载到 Live Gantt 预览；预览不写入数据库。
- 方案比较同时提供表格视图和 Live Gantt 双态视图，且两者展示同一恢复选项的模拟结果。
- 用户点击方案比较中的不同恢复方案类型后，具体恢复选项列表按方案类型过滤，只显示当前选中方案的选项；切换后 Detail 和 Live Gantt 预览同步使用当前方案选项。
- 方案切换使用整块方案卡，当前方案必须有明确的选中视觉反馈；不能只通过方案名称文字点击切换。
- Preview 后 Recovery 方案页面保留为可返回的紧凑面板；Live Gantt 提供独立悬浮 `Clear preview` 操作，主界面 `Reset` 仅执行布局重置。
- Detail 表格以蓝色系区分 Before、绿色系区分 After，并以红色、绿色和中性色分别区分取消、新增和保留状态，同时展示颜色图例。
- Gantt Preview 中受影响 Roster 左上角显示彩色 `Before`/`After` 阶段文字；阶段文字与填充、线框颜色一致，且不覆盖主航段识别信息。
- Rule 模拟失败的候选从可选恢复方案列表中移除，并在方案汇总或过滤区域保留失败 Crew、Rule ID 和原因；已完成 Roster（`end < Now()`）不提供 Recovery 操作。
- Violation 告警页不显示固定红色 `8004 Recovery` 标签；方案比较表以蓝色系显示 Crew Roster 转移/交换、以琥珀色系显示 Standby Crew Callout，方案下候选延续其方案色带。
- 每个可执行候选 Crew 提供勾选框；同一待恢复 Roster 在一次分析中只能勾选一个执行 Crew，Apply 仅对已勾选且 Rule 检查通过的选项可用。
- 每个恢复选项提供 `Preview`。点击后，在不落库的情况下将受影响的原/目标 Crew 置顶，并在同一 Live Gantt 时间轴同时显示恢复前和恢复后 Roster；恢复前受影响 Roster 使用蓝青色系细虚线框，恢复后使用绿色系加粗虚线框，其他 Roster 保持原有颜色，Callout Standby 保留黄色 `C` 标识。
- SBY 候选覆盖区间包含开始和结束边界；待恢复 Roster 开始时间等于 SBY 开始或结束时间均可成为候选。
- 恢复候选必须精确匹配待恢复 Roster 所有已加载航段的机型资格；模拟后残留 `8004` 或新增任意 Rule 告警的 Crew 不得进入最终可选列表。
- Roster 结束时间早于 `Now()` 时视为已完成，不生成 Recovery 方案；结束时间等于 `Now()` 不视为已完成。
- 年度飞时排序按 Crew base 本地日历年，并从对应 CC 或 FD Manday 表 `blh` 字段读取。
- Preview 状态下点击 `Apply` 只将选定方案追加到 Gantt 未保存 Draft，并退出双态叠加预览；正式提交复用 Gantt 原有 Save 或 `Ctrl+S`，Recovery 页面不直接落库。
- 告警 Roster 的鼠标悬浮浮显提供同一 `Recovery` 入口，不能形成独立恢复流程。
- 方法选择区域只用于过滤方案类型，候选区域采用固定高度可滚动布局；不重复呈现一份可点击的方案汇总列表。

### 14.5 Recovery 方案通用验收

- 至少提供 Standby Crew 替换和 Crew 交换任务两种方案。
- 每种方案下列出所有符合基础筛选条件的候选 Crew 恢复选项，并明确不可执行选项的原因。
- 用户可以查看每种方案的前后差异。
- 用户可以查看每个恢复选项的恢复前后 Roster 表格明细。
- 用户可以点击不同恢复方案类型，具体恢复选项列表只显示所选方案类型。
- 用户点击 `Detail` 后可以通过固定颜色图例清晰区分 Before、After 以及取消、新增、保留状态。
- Violation 页不显示固定红色 `8004 Recovery` 标签。
- 方案比较和方案下候选能够通过蓝色系（Crew Roster 转移/交换）与琥珀色系（Standby Callout）清晰区分。
- 用户一次只能勾选一个已通过 Rule 检查的候选 Crew 执行恢复；勾选其他 Crew 后，原勾选自动取消，未勾选候选不能执行同一待恢复 Roster。
- 每个候选提供 `Preview`；点击后涉及 Crew 置顶，在 Live Gantt 同屏显示恢复前/恢复后 Roster，受影响前后状态使用不同颜色和线框区分，其他 Roster 与 Callout Standby 标识保持可区分，且不写入数据库。
- Roster 交换和分配以完整 Roster 为单位，不允许拆分 Roster。
- 系统按统一公式计算每个选项的 Roster 稳定性，并保留各影响数量作为可解释明细。
- 用户可以比较成本和影响数量。
- 总成本按“直接成本 + 虚拟成本 × 虚拟成本权重”计算，并同时展示组成项。
- 用户可以将恢复选项以预览方式同步到 Live Gantt，且不会提交数据库。
- 方案预览不会直接修改正式数据。
- 用户确认后方案能够保存、生效并重新检查。
- 本期用户确认后无需主管审批即可保存、生效并重新检查。
- Soft Rule 可按权限强制覆盖；Hard Rule 仅具备对应 Role 权限的用户可覆盖，其他用户必须被阻断。
- Live Gantt、Roster、Pairing 和告警列表显示最终结果。
- 本期不向 Crew 发送恢复完成通知，Crew 通知能力保留后续扩展点。
- 用户未手工执行前，方案只在 Scenario/Sandbox 预览，不调用正式 `Swap`、`Assign`、`Deassign` 接口、不写入数据库。
- 用户手工执行后复用现有 `Swap`、`Assign`、`Deassign` 接口；执行成功后本期不支持撤销和回滚。
- 正式执行应验证：直接转移为原 Crew 完整 Roster `Deassign` 后目标 Crew 完整 Roster `Assign`；双向交换为双方完整 Roster 互换。
- Preview 中提供 `Apply`；Apply 只更新未保存 Gantt Draft，Gantt 原有 `Save`/`Ctrl+S` 才执行正式提交，保存前数据库不应发生变化。
- Roster 告警浮显中的 `Recovery` 按钮与 Alert Center 使用同一恢复工作流。

### 14.6 导航

- 顶部不显示独立 `Recovery` 菜单。
- `System → Interface` 可进入 OPS Flight Schedule Simulation。
- 浏览器存在旧 Recovery 本地状态时，系统自动回退到有效模块，不显示空白页。

## 15. 总体需求评审

### 15.1 当前需求基线结论

本需求已经形成一条完整的业务闭环：

```text
OPS 航班模拟变更
  -> Flight / Pairing / Duty / Roster 同步
  -> 当前 Live 已加载数据的 Violation
  -> Rule 8004 Recovery
  -> 自动生成两类方案及多个 Crew 恢复选项
  -> 表格 + Live Gantt 双态预览
  -> 用户比较并选择
  -> 权限校验、保存生效、最终 Rule 检查
```

当前已经明确的业务基线如下：

| 领域 | 已确认基线 |
|---|---|
| 本期接口 | 只实现本地 OPS 航班模拟接口，真实 OPS 接口后续开发 |
| Violation 数据范围 | 只使用当前 Live 页面已经加载的 Roster、Pairing 数据 |
| Recovery 候选范围 | 严格限制为当前 Live 页面已加载数据及其关联 Crew、任务、SBY 数据，不查询未加载数据库数据 |
| 自动恢复规则 | 本期只对 Rule `8004` 自动生成恢复方案 |
| 恢复方案 | 方案一为直接转移或双向交换完整 Roster；方案二为 Standby Crew 替换 |
| Roster 粒度 | 只能以完整 Roster 为单位转移或交换，不允许拆分 |
| Crew 数量 | 一个 Roster 只能由一个 Crew 执行，不允许多个 Standby Crew 共同完成 |
| 时间相邻 | 按待恢复 Roster 与候选交换 Roster 的开始时间绝对差值排序，不设固定 0/30 分钟门槛 |
| 后续任务 | 只检查恢复 Roster 结束时间之后的第一个任务 |
| Standby 边界 | 待恢复 Roster 开始时间落在 SBY 开始和结束时间的闭区间内，包含边界 |
| 时间与年度飞时 | 按 Crew base 本地时间；年度飞时读取对应 CC 或 FD Manday 表的 `blh` 字段，不跨表混用 |
| Callout Standby | 原 SBY 任务保留，以图标和专用颜色标识，并记录允许重叠原因 |
| Rank | `order` 越小表示 Rank 越高，只允许同 Rank或更高 Rank Crew 降级执行低 Rank 任务 |
| 候选排序 | 综合 Rank、基地、后续第一个任务影响、本日历年累计总飞行时间和成本/稳定性 |
| 审批 | 本期无需主管审批，具备应用权限的用户可直接生效 |
| Rule 覆盖 | Soft Rule 可按权限覆盖；Hard Rule 仅具备对应 Role 的用户可覆盖，并必须审计 |
| 方案比较 | 同时提供表格视图和 Live Gantt 双态视图 |
| 正式执行 | 用户手工选择后复用既有 `Swap`、`Assign`、`Deassign` 接口；执行前仅 Scenario/Sandbox 预览，不落库 |
| 撤销与回滚 | 本期执行成功后不支持用户撤销或回滚 |
| Crew 通知 | 本期不发送恢复后 Crew 通知，仅预留扩展能力 |

### 15.2 完整性评审

| 评审领域 | 当前状态 | 评审结论 |
|---|---|---|
| 业务目标和用户流程 | 已明确 | 可进入原型和接口设计；正式执行由用户手工触发 |
| 本期范围和排除项 | 已明确 | 真实 OPS、Crew 通知、主管审批均已明确延期或不实现 |
| Violation 入口和字段 | 已明确 | 可进入前端实现；需遵守“只基于已加载数据” |
| 8004 恢复方案 | 基本明确 | 两类方案、候选 Crew、Scenario/Sandbox 预览和既有接口执行流程已明确 |
| Roster 变更粒度 | 已明确 | 只能完整 Roster 转移/交换，不允许拆分 |
| Standby 规则 | 基本明确 | 闭区间、Callout Standby、原 SBY 保留已明确；候选数据和边界场景仍需补充 |
| Rank 和跨范围恢复 | 基本明确 | 降级原则已明确，Rank 映射和岗位资格数据仍需明确 |
| 成本与稳定性 | 有初始方案 | 稳定性公式和成本结构已有建议，但初始参数、币种和折算值未最终确定 |
| 规则覆盖和权限 | 基本明确 | Soft/Hard Rule 原则明确，具体 Role 和覆盖后的告警状态仍需定义 |
| 数据一致性 | 基本明确 | 完整 Roster 包装层和数据库事务已实现；并发冲突、审计实体和正式 Rule 覆盖状态仍需完善 |
| 预览与正式应用 | 已明确 | Gantt/表格预览不写库，确认后才保存 |
| 通知和实时刷新 | 边界明确 | Crew 通知延期；系统内部页面刷新、缓存和实时状态更新仍需区分实现 |
| 非功能要求 | 初步明确 | 性能指标和错误处理已有建议，需在技术方案阶段确认容量和超时策略 |

### 15.3 目前发现的需求边界风险

以下内容如果不先澄清，容易导致前后端实现不一致：

- **已加载范围可能造成候选不足。** Recovery 候选已确认严格限制为当前 Live 已加载数据；当范围内不存在可行 Crew 时，必须明确展示该限制和无候选原因，不能偷偷扩展查询范围。
- **业务语义与现有代码粒度存在差异。** 需求已确认 `Swap` 为完整 Roster 互换、直接转移为完整 Roster `Deassign + Assign`；当前代码的 `swap` 和 `move` 主要按单个 `roster_flight` 任务行处理，Recovery 必须增加完整 Roster 包装层，并使页面的“取消/新增/变化”与实际持久化结果一致。
- **候选排序存在同级候选的决胜规则缺口。** Rank、基地、后续任务影响和年度总飞时已经确定优先级，但相同条件下还需要稳定的最终排序字段。
- **最终 Rule 检查与“第一个后续任务”检查的关系需要明确。** 当前约定第一个后续任务用于候选排序/排除，但最终应用仍执行完整受影响对象规则检查；两者的失败提示需要区分。
- **成本模型可以计算，但尚未具备业务可复核的默认参数。** 如果直接成本、虚拟成本、跨范围附加成本和稳定性折算值没有初始配置，方案只能显示结构，无法可靠排序；年度飞时已明确来自对应 Manday 表 `blh`，但统计查询规则仍需实现确认。
- **SBY 重叠是业务例外，但 Rule Engine 是否识别该例外尚未明确。** 页面标注 `Callout Standby` 不等于规则引擎自动允许重叠，需要确定例外如何传入规则检查上下文。
- **Hard Rule 覆盖后的状态需要单独建模。** 覆盖不应等同于规则通过，应区分“已覆盖”“仍违规但允许生效”和“检查失败”。
- **内部实时刷新与 Crew 通知需要分离。** 本期不发送 Crew 通知，但 Live Gantt、Violation、Roster 和 Pairing 的页面刷新仍然是本期要求。

### 15.4 建议澄清优先级

- **P0：** 完整 Roster 包装层如何编排现有 `Swap`/`Assign`/`Deassign` 能力、接口事务/失败语义、最终 Rule 检查与覆盖状态、并发冲突策略。
- **P1：** Rank 和岗位资格映射、成本模型初始参数、SBY 例外传入 Rule Engine、年度飞时 `blh` 统计规则、候选同级排序。
- **P2：** 表格与双态 Gantt 的具体布局、告警生命周期细节、通知扩展接口、真实 OPS 接口切换方案。

### 15.5 开发启动评审

#### 15.5.1 结论

当前需求已具备本期可运行开发基线，可以进行联调和业务验收；距离完整生产上线仍有并发、权限覆盖、审计和外部依赖等收尾工作。

可以立即开始的开发内容：

- Roster Pane 唯一 `Alert Center` 入口和基于当前已加载数据的告警列表。
- Rule 8004 的两类方案页面、候选 Crew 选项、Detail 表格和成本/稳定性展示框架。
- Live Gantt 恢复前后双态 Scenario/Sandbox 预览，确保预览不写入正式数据库。
- 方案比较、候选排序展示、加载/无候选/检查中/失败等页面状态。
- 对既有 `Swap`、`Assign`、`Deassign` 接口的只读契约梳理、适配层和模拟数据测试。
- 完整 Roster 转移/交换包装层：已将单任务能力编排为完整 Roster 的 `Deassign + Assign` 或完整 Roster 交换事务。
- 初始稳定性公式和可配置成本模型框架，使用明确的“初始模型”标识。

暂不能直接作为完整生产功能交付的内容：

- 完整 Recovery 正式数据库执行的生产化闭环（本期完整 Roster 事务已实现，但并发、权限覆盖和审计仍需完善）。
- 依赖真实资质、Rank、岗位、SBY 例外和年度飞时数据的最终候选推荐。
- 需要保证失败不产生部分更新的正式保存流程。
- Hard Rule 覆盖后的正式状态、告警关闭和审计闭环。

#### 15.5.2 正式执行的开发前提

以下事项是正式执行功能的前置条件，未明确前可以做接口适配，但不应将正式执行标记为完成：

| 前置条件 | 必须明确的内容 | 未明确的影响 |
|---|---|---|
| Scenario/Sandbox 机制 | 既有操作接口是否支持 dry-run；不支持时采用内存模拟、数据副本还是其他隔离方式 | 预览可能误写正式数据，或模拟结果与正式执行不一致 |
| 完整 Roster 操作包装 | 现有单任务接口如何编排为完整 Roster `Deassign + Assign` 或 `Swap`；各接口入参、返回值、幂等性、对象更新范围和错误语义 | 直接使用现有单任务接口会造成只改部分 Roster 或前后差异失真 |
| 事务与失败处理 | 多接口调用是否原子；部分失败时如何确保不留下半成品 | 本期没有用户回滚，部分更新风险不可接受 |
| 并发控制 | Scenario 生成后数据变化时是否阻止执行、重新生成或锁定 | 可能覆盖其他排班员的修改 |
| 候选数据完整性 | 当前已加载数据是否包含候选生成和 Rule 检查所需的完整 Crew、Roster、Duty、SBY、资格字段 | 可能错误显示无候选或错误判定合规 |
| 恢复操作粒度 | 一条告警关联多个对象时处理一个 Roster 还是批量处理 | 影响按钮、Scenario 数据结构和接口调用次数 |
| Rule Engine 例外 | `Callout Standby` 如何传入检查上下文，哪些重叠被豁免 | Standby 方案可能始终被判定违规 |
| Rank/资格映射 | `requiredRankOrder`、岗位和机型资格的权威来源及缺失数据处理 | 无法安全筛选跨岗位或跨机组类型候选 |
| 覆盖状态 | Soft/Hard Rule 覆盖后的状态、Role 编码、告警和审计结果 | 无法正确控制正式执行按钮和告警生命周期 |

#### 15.5.3 可以先采用的开发假设

在不改变已确认业务规则的前提下，以下内容可以作为原型阶段临时假设，但必须在界面和文档中标记为“初始模型”或“待确认”：

- 一个 Violation 默认一次处理一个待恢复 Roster。
- Scenario 使用前端/后端内存快照，不调用会修改数据库的正式接口。
- 成本使用配置化演示值，币种、权重和跨范围附加成本暂不作为正式财务结算结果。
- 候选同级时暂按 CrewID 稳定排序。
- 页面先采用表格与 Gantt 标签页或联动方式中的一种，但必须保留两种视图能力。

正式执行前不得把上述临时假设当作最终业务规则，尤其不能用接口失败后的人工补偿代替本期明确“不支持用户撤销和回滚”的要求。

#### 15.5.4 开发门槛

- **原型开发门槛：已满足。** 可开始页面、Scenario 数据结构、差异展示和成本/稳定性计算框架。
- **Recovery 方案预览门槛：基本满足。** 需要确保当前已加载数据的字段完整，并明确模拟结果来源。
- **正式方案执行门槛：开发联调基线基本满足，生产化门槛未满足。** 完整 Roster 事务包装层、前端 Scenario/Sandbox 预览、候选资格筛选和执行后 Rule 检查链路已接入；仍需完成服务端并发/授权校验、Soft/Hard 覆盖权限、SBY 规则引擎例外、最终结果状态和完整审计实体。
- **生产上线门槛：未满足。** 还需要完成错误恢复、告警状态、审计、成本初始参数和性能容量验证。

> 代码复核修正：当前实现已满足开发联调和演示验证门槛，但不能据此认定正式生产执行门槛已经满足。当前仍存在数据口径、服务端授权、并发校验、异步检查结果、Rule 例外传递和运行依赖等待完善项。

### 15.6 代码开发后新增的需求不确定性和实现边界

以下事项是在当前代码落地后发现、且会影响验收或生产化的新增边界。它们不改变 16.1 已确认的业务原则；在没有明确结论前，应按“待确认/待完善”处理。

| 优先级 | 新增事项 | 当前代码表现 | 需要确认的需求边界或后续动作 |
|---|---|---|---|
| P0 | Violation 行的完整性 | `toViolationRows` 目前只生成同时具备 Crew、Pairing 且能在已加载 Roster 中找到首条任务的告警行；没有 Pairing 或没有 Roster 锚点的告警会被忽略 | 是否必须展示所有当前已加载的告警，并对缺失字段显示空值、Recovery 置灰；建议不要静默丢弃已加载告警 |
| P0 | Roster 身份与 Pairing 的关系 | 候选生成按 `CrewID + PairingID` 聚合；Detail 中使用 `R{PairingID}` 作为 Roster 展示标识 | 需要确认系统真实 RosterID 是否等同于 PairingID；若不等同，必须明确 Roster、Pairing、Duty、Roster Flight 的关联及展示/持久化主键 |
| P0 | 正式应用后的对象身份 | 当前完整 Roster 应用会软删除原 `roster_flight` 行，再依据 `pairing_segment` 新建行；PairingID 保留，但新建行的 Roster Flight ID 会变化，部分字段按 Pairing/Segment 重建 | 是否接受“原分配记录取消 + 新分配记录创建”的身份变化；哪些字段必须完整继承；审计中如何关联原记录和新记录 |
| P0 | 服务端应用授权和候选真实性 | 前端只允许通过本地 Rule 检查的选项点击 Apply；`POST /api/recovery/apply-option` 当前主要按请求中的 Crew/Pairing/Task ID 执行，未接收完整候选快照或候选签名 | 是否要求服务端再次校验原始 8004、资质、当前版本、候选来源和用户 Role；不能仅依赖前端禁用按钮作为权限控制 |
| P0 | 应用成功的定义 | Roster 数据库事务完成后，Rule 重检和 Manday 重算以异步任务启动；后台返回成功时，最终 Rule/指标结果可能尚未完成，失败主要记录日志 | “Apply 成功”是指 Roster 写入成功，还是必须等待最终 Rule 和 Manday 结果；页面如何显示“写入成功但检查处理中/失败” |
| P0 | 事务后的失败和一致性 | 删除/新建 Roster 在数据库事务中完成，但缓存失效、Pairing composition 刷新、Rule 重检、Manday 重算在事务后执行；本期又确认不提供用户回滚 | 需要定义各后置步骤失败时的告警、审计、重试和运维处理方式，避免用户看到成功但页面仍是旧状态 |
| P1 | 当前已加载 Crew 的定义 | 前端 Crew 候选快照从已加载 Roster item 中出现过的 Crew 过滤；仅加载了 Crew 但没有加载 Roster 的 Crew 目前不会进入候选 | “严格当前已加载数据”是否包含 Crew Pane 已加载但没有 Roster 的 Crew；直接转移到“无已加载 Roster 的 Crew”是否应允许 |
| P1 | 每个 Crew 的候选 Roster 数量 | 当前实现为每个目标 Crew 选择一个开始时间最近的 Roster 作为交换对象；同一 Crew 的其他可行 Roster 不会分别展开 | 方案选项粒度是“每个 Crew 一个推荐选项”，还是“每个 Crew × 每个可交换 Roster 一个选项”；若只展示推荐项，需要提供被省略候选的解释 |
| P1 | 后续任务实际范围 | 当前实现按 Pairing 级分组查找结束时间之后的首个 Roster，并按开始时间、PairingID 排序；地面任务、休假、取消任务等非 Pairing 任务可能不参与判断 | 需要确定“第一个任务”的完整对象类型、同一开始时间的决胜顺序，以及 SBY/地面任务/休假/取消状态是否计入 |
| P1 | 时间显示与计算口径 | 候选算法直接使用 `schStrDtUtc`/`schEndDtUtc` 的 UTC 时间戳；OPS Interface 页面当前文案也显示 Times are UTC，而已确认需求要求按 Crew base 本地时间 | 需要明确数据库存储、前端显示、候选排序、跨基地比较各自的时区转换规则；不能把 UTC 和不同基地本地时间混用 |
| P1 | 年度总飞时字段口径 | 已确认需求规定从对应 CC/FD Manday 表 `blh` 读取；当前前端候选快照使用 `crewStatsMap.ybh`，再回退到 Roster item 的 `ybh` | 需要确认 `ybh` 与 `blh` 的定义、单位和统计周期；在字段未统一前不得把当前排序结果视为正式推荐结果 |
| P1 | 机尾号资格与资格权威来源 | 当前候选筛选主要执行 Rank 和 `fleetQuals` 文本匹配；没有独立的 tail-number qualification 校验 | 需要确认机尾号是否属于资格判断维度，以及机型、机尾号、岗位、Rank 的权威表和缺失数据处理方式 |
| P1 | Callout Standby 的 Rule Engine 契约 | 预览对象使用前端 `isCalloutStandby` 标记，正式保存使用 `exceptionCode=CALLOUT_STANDBY`；当前候选 Rule 预检请求没有明确携带该例外上下文 | 需要定义 Rule Engine 接收的例外字段、豁免范围、审计原因和正式/预览两态的一致性；界面标记不能替代规则引擎判定 |
| P1 | SBY 多任务选择 | 同一 Crew 有多个覆盖时间的 SBY 任务时，当前实现选择开始时间最早的一条作为标记对象 | 需要确认选择最早、最短、最接近恢复开始时间，还是允许用户选择；所选任务必须可在审计中追溯 |
| P1 | Soft/Hard Rule 覆盖落地 | 业务原则已确认，但当前 Recovery Apply 请求没有覆盖标志、原因或 Role 参数，Rule 失败选项也会被前端禁用 | 需要补充服务端覆盖接口、Role 编码、覆盖原因、审计字段和告警状态；在此完成前不得宣称已实现强制覆盖 |
| P1 | 旧 Demo Recovery 链路 | `/api/recovery/simulate-flight-change` 和旧 `RecoveryView` 仍存在；该链路使用内存 session 和演示 Crew/成本，旧 Apply 只更新 session 状态，不执行正式数据库 Roster 变更 | 需要决定保留为测试夹具、改为明确 Demo 环境，还是删除；System Interface 和 Live Violation 必须使用哪条链路应唯一明确，避免误把 Demo 成功当作正式生效 |
| P2 | 预览快照的失效规则 | Preview store 保存前后 Roster item 快照；其他用户或外部刷新导致数据变化时，当前页面是否自动清除或标记过期尚未定义 | 需要定义外部数据变化、筛选条件变化、切换告警和关闭弹窗时的预览失效、重新生成和提示规则 |
| P2 | Redis 运行前提 | 后台在注册 Redis 插件时必须连接 `REDIS_URL`，成功后才会继续启动 HTTP listener；Redis 不可达时后台不会监听 3000 | 需要明确 Redis 是强依赖还是允许开发环境降级；生产部署必须定义网络、端口、认证、健康检查和启动失败告警，不得只依赖前端页面探活 |

代码实现阶段的建议处理顺序：先解决 P0 的对象身份、服务端校验、应用结果语义和后置失败处理，再统一 P1 的数据口径与 Rule/权限契约，最后完善 P2 的体验和运行治理。

### 15.7 Live 数据加载性能与请求韧性

本节记录 Live Gantt 与 Recovery/Violation 当前已加载数据范围之间的运行前提，避免页面加载失败后被误判为业务数据为空。

- `GET /api/roster?crewIds=...` 是 Live Roster 的**批量读取**契约：前端将当前已加载并筛选后的 Crew ID 以逗号连接后传入，读取指定日期范围内这些 Crew 的 Roster；它不是逐个 Crew 的异常调用。
- Roster 按有限 Crew 批次依次加载；Pairing 按有限日期窗口依次加载。读取型批次允许使用专用长超时，因正常的大响应在处理中不能被全局 30 秒 UI 超时提前取消。
- 当单批读取失败时最多做一次受控重试。禁止按 Crew 或日期窗口递归二分并并发重试，因为原请求若仍在后台执行，会产生重复查询、连接池争用和浏览器 Network 面板的请求风暴。
- Pairing 加载失败必须保留已成功加载的数据，并在 Pairing Pane 显示明确错误，不能把失败静默表现为空列表。
- `scenario/run-health` 仅在 Scenario 页面处于活动状态时发起轮询；服务端须短时缓存并合并同一时刻的探测，不能因后台依赖慢而与 Live 主加载竞争。
- Live 数据库部署必须包含以下支持索引：`roster_flight(crew_id, sch_str_dt_utc)`、`pairing(division, sch_str_dt_utc)`、Pairing Segment 的 `(pairing_id, duty_seq, seg_seq)` 与 Pairing Composition 的 `pairing_id`，并限定未删除记录。
- 验收标准：同一筛选动作中，不得因客户端超时引发递归倍增的 `/api/roster` 或 `/api/pairing` 请求；失败必须可见且可诊断；刷新后已加载的 Roster、Pairing 与 Violation 输入范围一致。

### 15.8 Rule 8004 本地重算与回归保护

本地开发环境可配置 `SKIP_RUST_BINS=true`，用于在未构建或未取得私有 Rust 发布二进制时启动 Live Server。该开关不得导致 Live 冷启动重算整体失败并将 Alert Center 错误表现为空告警。

- Live Server、直接执行 `live-legality.mjs` 和冷启动子进程必须一致识别 `live-server/.env` 中的 `SKIP_RUST_BINS`；父进程已加载环境变量与直接运行脚本的结果不得不同。冷启动子进程使用原始 Redis 客户端时，重算状态、错误和完成时间键必须使用与 Live Server 相同的 `REDIS_KEY_PREFIX` 命名空间；WebSocket 通知频道沿用现有无前缀频道契约。
- Live 前端的告警查询和 WebSocket 订阅必须使用 `LegalityStore.selectedId` 对应的当前生效 Ruleset ID。Ruleset 异步初始化完成前不得回退到历史/硬编码 ID（例如 `103`），也不得用旧字符串规则组查询 `rule_violation`；初始化完成后必须重新查询当前页面已加载 Crew 的告警并加入对应 WebSocket 频道。否则即使规则引擎已正确生成 8004，Alert Center 和 Gantt 仍可能显示为空。
- 当且仅当开发环境显式启用该开关、且未指定其他 Rule 范围时，冷启动可使用既有的本地 8004 检查降级路径，仅重算并持久化 Rule `8004`；不得继续执行依赖缺失 `check-7500-ref` 或其他 Rust 二进制的全量重算后静默失败。
- 用户明确指定 `--rules` 时必须保持指定范围；若指定的 Rule 没有可用实现或二进制，必须明确失败，不能伪造通过结果。
- 非开发环境不得启用 `SKIP_RUST_BINS`；生产、UAT、SIT 等部署仍必须使用完整、与源码匹配的 Rust 发布二进制，不允许以本地降级路径替代。
- 8004 降级路径和正式路径都必须按 `CrewID + PairingID + Rule Instance + Scope` 保持独立告警。不同 Pairing 的不合规结果不得因消息合并、批次重算或持久化冲突而减少数量；同一 Crew/Pairing/Instance 内的 Base 与 Fleet 说明可合并为一条完整告警。

固定回归样例与验收条件：

| 样例 | 输入 | 预期结果 |
|---|---|---|
| 1012 Fleet 资格 | Crew `1012` 执行 Pairing `135559`；Pairing 内 `FLY` 航段包含机型 `7M8`；Crew 只有 `737` Fleet 资格 | 当前生效 Ruleset 的 8004 Fleet 行必须生成一条 `8004`，消息包含 `Crew fleet 7M8 is not a valid qualification` |
| Fleet 资格有效期 | 与上例相同，但 Crew 在航段日期具备有效 `7M8` 资格 | 不生成该 Fleet 8004 告警 |
| 三条独立告警 | 同一 Crew 有三个不同 Pairing，均含无资格 `7M8` 航段 | 必须生成三条独立 8004 结果，分别对应三个 Pairing，不得合并为一条或零条 |

自动化测试至少覆盖上述三种情形，以及 `.env` 中 `SKIP_RUST_BINS=true` 在脚本进程环境变量未显式传入时仍能被识别。部署或重启后，应以 `rule_violation` 持久化记录和 Alert Center 查询结果共同验收，不能只以脚本退出码判断成功。

## 16. 已确认与待确认事项

### 16.1 已确认事项

- 时间相邻按待恢复 Roster 与候选交换 Roster 的开始时间绝对差值计算，差值越小越相邻；本期默认不设 0/30 分钟硬性门槛。后续如需最大允许差值，应配置具体阈值。
- “不影响后续任务”只检查待恢复 Roster 结束时间之后的第一个任务；该任务需要满足衔接、休息、时间不冲突和当前 Ruleset 要求。
- Standby Crew 候选按 Crew Rank、基地、是否影响恢复任务结束后的第一个任务、本日历年累计总飞行时间综合排序，优先 Rank 相同、基地相同、不影响后续第一个任务、日历年总飞行时间少的 Crew。
- 允许跨基地、跨岗位和跨机组类型恢复，但只允许降级使用 Crew：Rank 的 `order` 越小表示 Rank 越高，只允许同 Rank 或更高 Rank Crew 执行较低 Rank 任务；跨基地、跨岗位和跨机组类型成本更高。
- 本期由系统提供初始成本模型，作为方案比较和排序依据；后续迭代可继续优化成本字段、权重和计算公式。
- 本期 Recovery 方案不需要主管审批，具备应用权限的用户确认后可直接生效；后续迭代可增加审批流程。
- Soft Rule 允许具备对应权限的用户强制覆盖；Hard Rule 默认不允许覆盖，只有具备明确 Hard Rule 覆盖 Role 权限的用户才能覆盖，并必须记录原因和审计信息。
- SBY 地面任务与被恢复 Roster 重叠时，在界面以图标和专用颜色标注 `Callout Standby`，并记录允许重叠的特殊恢复原因。
- Standby Crew 接收 Roster 后，原 SBY 任务保留，不取消、不自动转换状态。
- Violation 列表只使用当前 Live 页面已经加载的 Roster、Pairing 数据，不查询未加载的数据库全量数据。
- Recovery 候选同样严格限制在当前 Live 页面已加载数据及其关联 Crew、任务和 SBY 数据范围内；范围内无候选时显示明确原因，不查询未加载的数据库全量数据。
- Roster 交换最小粒度为完整 Roster，不允许只交换 Duty 或航段。
- 一个 Roster 不允许拆分给多个 Crew，也不允许多个 Standby Crew 共同完成一个 Roster。
- 用户未手工选择并执行方案前，只在 Scenario/Sandbox 中生成、比较和预览恢复结果，不调用正式 `Swap`、`Assign`、`Deassign` 接口，也不写入数据库。
- 用户手工执行后，Recovery 复用系统既有 `Swap`、`Assign`、`Deassign` 接口完成直接转移或双向交换；本期不额外定义新的 Roster 持久化接口。
- 本期恢复方案保存并执行成功后不支持用户撤销、回滚或恢复到执行前版本。
- Recovery 时间计算、时间显示、候选排序和日历年边界均以 Crew base 本地时间为准；年度总飞时从对应 Crew 类型的 CC 或 FD Manday 表 `blh` 字段读取，不跨表混用。
- 本期不接入真实 OPS 接口，真实 OPS 接入留待后续开发和完善。
- 方案比较同时需要表格视图和 Live Gantt 双态视图，两者均为本期需求。
- 如果通知指恢复方案生效后通知 Crew，本期不实现站内消息、WebSocket、邮件等通知，仅预留后续扩展能力。
- SBY 任务时间边界包含开始和结束边界；待恢复 Roster 开始时间等于 SBY 开始或结束时间时，均认为该 SBY 任务覆盖待恢复 Roster。
- `Swap` 的业务语义为两个 Crew 的完整 Roster 相互交换；直接转移的业务语义为原 Crew `Deassign` 完整 Roster 后目标 Crew `Assign` 完整 Roster。
- Recovery 正式执行优先复用系统已有能力；如果现有 `Swap`、`Assign`、`Deassign` 仅支持单个任务行或没有完整 Roster `Swap`，必须包装实现完整 Roster 操作。
- Live Gantt 将 Roster 移动到另一个 Crew 的业务语义是取消原 Crew 的分配并分配给目标 Crew；当前代码的 `/api/roster/move` 只更新单个任务行，不能直接作为完整 Roster Recovery 执行接口。

### 16.2 待确认事项

2. **后续第一个任务的定义：** 如果多个任务拥有相同开始时间，如何确定“第一个任务”？是否按任务类型、原始排序或任务ID决定？取消/结束/休假等非执行任务是否计入第一个任务？
3. **Rank 与岗位资格映射：** `requiredRankOrder` 从哪个对象读取？如果 Roster、Duty、Pairing 或岗位数据的 Rank 要求不一致，采用哪一个？缺少 Rank 或岗位资格数据时，候选是排除还是进入人工确认？
4. **跨基地、跨岗位、跨机组类型的成本：** 各类跨范围附加成本如何计算，是否允许不同类型叠加？成本由固定值、距离/时长或其他业务数据决定？
5. **初始成本模型参数：** 直接成本、虚拟成本、稳定性权重、跨范围附加成本的默认值、币种和精度是什么？年度飞时已确认从对应 CC/FD Manday 表 `blh` 读取，但其统计周期、缺失值和汇总查询规则仍需明确。
6. **SBY 例外与 Rule Engine：** `Callout Standby` 例外如何传给 Rule Engine？是否只豁免 SBY 地面任务与被恢复 Roster 的重叠，其他规则仍正常检查？
7. **Hard Rule 覆盖后的状态：** 覆盖后告警显示为“已覆盖”“仍违规但允许生效”还是其他状态？Hard Rule 覆盖 Role 的具体角色编码和授权管理方式是什么？
8. **同级候选最终排序：** 当 Rank、基地、后续任务影响、年度总飞时、成本和稳定性均相同，使用什么稳定的最终排序字段？
9. **事务和并发：** Recovery 复用既有接口时，接口调用是否必须数据库事务；接口失败后的实际持久化状态如何返回；其他用户修改同一 Roster 时采用版本冲突、锁定还是最后写入？本期不提供用户撤销或回滚。
10. **Recovery 告警状态：** 告警需要哪些状态，例如待处理、预览中、已应用、已解决、已覆盖、失败、过期？状态由哪些事件触发？
11. **SBY 多任务场景：** 一个 Crew 同时存在多个覆盖待恢复 Roster 开始时间的 SBY 任务时，选择哪个任务作为 `Callout Standby` 标识和审计依据？
12. **跨基地时间比较：** Recovery 统一按各 Crew base 本地时间计算；当原 Crew 与候选 Crew 基地不同，两个本地开始时间如何换算为可比较的绝对时刻，并在界面中同时说明各自的本地时区？
13. **OPS 模拟字段校验：** ETD/ETA/ATD/ATA 为空、跨日、实际时间早于计划时间或航班已执行时，保存和同步规则是什么？
14. **视图布局：** 表格和 Live Gantt 双态视图采用并列、标签页还是可拖拽联动布局？是否需要在表格选中行后自动定位 Gantt？
15. **内部实时刷新：** 本期不通知 Crew，但 Live Gantt、Violation、Roster 和 Pairing 更新采用轮询、WebSocket 还是手动刷新？
16. **Violation 非完整锚点告警：** 当前实现会忽略缺少 Crew、Pairing 或已加载 Roster 首条任务的告警；是否必须展示这些告警并将缺失字段留空，还是只展示可定位到完整 Roster 的告警？
17. **已加载 Crew 的范围：** 严格限制是否包括 Crew Pane 已加载但没有已加载 Roster 的 Crew？这直接影响无现有 Roster 的直接转移候选。
18. **Roster 主键：** 业务 RosterID 是否等于 PairingID？如果不是，候选聚合、Detail 展示、Apply 入参和审计关联应使用哪些真实主键？
19. **候选展开粒度：** 每个目标 Crew 只展示一个最优交换 Roster，还是每个可行的 Crew-Roster 组合都要作为独立恢复选项？
20. **后续任务对象：** “第一个任务”是否包括地面任务、SBY、休假、取消任务和无 Pairing 任务？多个任务同一时刻时的排序字段是什么？
21. **时间口径落地：** 页面显示和候选算法是否统一使用 Crew base 本地时间；数据库中的 UTC 字段如何转换，跨基地比较使用哪个绝对时刻和时区展示方式？
22. **年度飞时字段冲突：** 需求确认使用 CC/FD Manday 的 `blh`，当前代码读取 `ybh`；请确认两个字段的业务含义、单位、年度统计窗口及缺失值处理，并统一唯一来源。
23. **机尾号资格：** 机尾号是否参与 Crew 资格判断？机型、机尾号、岗位和 Rank 的权威资格来源分别是什么，缺失数据时是排除、告警还是人工确认？
24. **Callout Standby 例外协议：** Rule Engine 是否接收 `CALLOUT_STANDBY` 例外上下文？仅豁免匹配的 SBY-Roster 重叠，还是还影响其他工作/休息规则？
25. **应用后置步骤：** Apply 返回成功前是否必须等待 Rule 重检、Manday 重算、缓存失效和 Pairing composition 刷新？各步骤失败时用户看到的最终状态是什么？
26. **Apply 服务端校验：** 服务端是否必须重新验证当前 8004、Crew 资格、候选方案、版本号和用户权限，还是允许信任前端已完成的候选计算？
27. **完整 Roster 身份变更：** 当前实现软删除旧 `roster_flight` 并新建记录；是否允许 Roster Flight ID、来源字段及部分派生字段变化，还是必须保持既有对象身份？
28. **强制覆盖实现：** 已确认 Soft Rule 可由有权限用户覆盖、Hard Rule 仅特定 Role 可覆盖；具体 Role 编码、覆盖原因、接口字段、告警状态和审计保留期是什么？
29. **旧 Demo 链路生命周期：** 旧内存 Recovery session 接口是否继续保留作为测试夹具，还是必须从可部署版本移除；System Interface 和 Live Violation 的正式入口必须如何隔离？
30. **预览失效：** 当其他用户修改同一 Crew/Roster、Live 数据刷新或用户改变筛选范围时，当前 Scenario/Sandbox 预览应清除、标记过期、重新计算还是禁止 Apply？
31. **Redis 启动策略：** Redis 不可达时，后台是否必须拒绝启动，还是开发环境允许无 Redis 降级运行？正式部署的 Redis 连接、健康检查、重试和故障告警标准是什么？

## 18. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| 0.1 | 2026-09-05 | 建立机组恢复功能需求基线，记录当前实现和待确认事项 |
| 0.2 | 2026-09-05 | 增加 Live Violation 入口和 Rule 8004 的 Roster 交换、Standby Crew 恢复需求 |
| 0.3 | 2026-09-05 | 增加双方案自动生成、按 Crew 展开恢复选项、Roster 稳定性评分、成本比较和 Live Gantt 非落库预览 |
| 0.4 | 2026-09-05 | 明确按 Roster 开始时间差值计算相邻度，增加低成本直接转移 Roster 选项，并确认 Callout Standby 标识及原 SBY 任务保留规则 |
| 0.5 | 2026-09-05 | 明确后续任务检查窗口、Standby 候选排序、降级恢复规则、初始成本模型和本期无需主管审批 |
| 0.6 | 2026-09-05 | 明确 Soft Rule 和 Hard Rule 的覆盖策略、Role 权限要求及覆盖审计要求 |
| 0.7 | 2026-09-05 | 确认 Violation 使用已加载数据、完整 Roster 交换、不允许 Roster 拆分及多个 Standby Crew 共用，并细化 SBY 边界问题 |
| 0.8 | 2026-09-05 | 确认真实 OPS 接口延期、方案比较同时支持表格与 Live Gantt 双态视图，并暂不实现恢复后 Crew 通知 |
| 0.9 | 2026-09-05 | 确认 SBY 时间范围包含边界，完成全量需求评审，补充需求边界风险、澄清优先级和待确认问题 |
| 1.0 | 2026-09-05 | 明确 Recovery 候选严格限制为已加载数据、Scenario/Sandbox 预览与既有接口执行边界、本期不支持撤销回滚，以及 Crew base 本地时间和 CC/FD Manday `blh` 年度飞时口径 |
| 1.1 | 2026-09-05 | 增加开发启动评审，区分可立即开发内容、正式执行前置条件、临时开发假设和开发门槛 |
| 1.2 | 2026-09-05 | 确认 Swap、Assign、Deassign 的完整 Roster 业务语义，定位现有代码接口并明确单任务接口到完整 Roster 包装层的实现差距 |
| 1.3 | 2026-09-05 | 更新代码开发基线，记录 Live Recovery 正式执行链路、方案级比较、前后 Gantt 预览和初始成本权重实现 |
| 1.4 | 2026-09-05 | 根据代码开发复核新增实现边界和待澄清项，补充 Violation 数据完整性、Roster 身份、服务端校验、异步结果、时间/飞时口径、旧 Demo 链路及 Redis 运行前提 |
| 1.5 | 2026-09-05 | 明确恢复方案类型可点击过滤具体恢复选项，并明确 Detail 中 Before/After 及取消、新增、保留状态的颜色区分和图例要求 |
| 1.6 | 2026-09-05 | 移除 Violation 页固定红色 8004 标签；增加方案和候选的蓝色/琥珀色区分、唯一 Crew 勾选执行机制，以及 Show in Live 的 Crew 置顶和受影响 Roster 橙色高亮要求 |
| 1.7 | 2026-09-05 | 补充 Live Roster 加载完整性要求：Crew 完整历史不得阻塞 Roster 首屏；筛选成功后必须以已加载 Crew ID 请求 Roster，并增加自动化回归保护。 |
| 1.8 | 2026-09-05 | 补充 Live 数据加载韧性要求：Roster `crewIds` 为已加载 Crew 的批量读取契约；Roster/Pairing 重型读取必须使用有界串行批次和专用读取超时，超时后最多重试一次且不得递归拆分放大请求；Pairing 加载失败必须在界面明确展示；Scenario 运行健康检查仅在 Scenario 页面激活时轮询，服务端必须缓存并合并并发探测；Live Schema 必须具备 Crew+开始时间、Division+开始时间及 Pairing 明细关联索引。 |
| 1.9 | 2026-09-06 | 将告警列表统一到 Roster Pane 的 Alert Center，废弃顶层 Violation 入口；Recovery 入口从 8004 告警行直接进入恢复方案。 |
| 2.0 | 2026-09-06 | 将恢复方案的 Show in Live 统一更名为 Preview，并明确会话级预览不落库。 |
| 2.1 | 2026-09-06 | Preview 改为 Live Gantt 同屏叠加恢复前后 Roster；恢复前后使用不同颜色、线框和自动重叠分道显示。 |
| 2.2 | 2026-09-06 | 优化方案切换交互：使用整块方案卡和明确 Selected 状态，扩大点击区域并保留方案比较表；Preview 后 Recovery 页面收起为可返回的紧凑面板；主界面 Reset 清除 Recovery Live Gantt 预览。 |
| 2.3 | 2026-09-06 | 解耦主界面 Reset 与 Recovery Preview：Reset 恢复原有布局重置语义；Live Gantt 增加醒目的 Preview mode 悬浮状态条和独立 Clear preview 按钮，清除预览不改变布局、筛选和缩放。 |
| 2.4 | 2026-09-06 | 增加 Gantt Preview 左上角 Before/After 彩色阶段标签；收紧 Recovery 机型资格为精确代码匹配并覆盖完整 Roster 航段；模拟 Rule 失败候选移出可选列表并保留诊断原因；明确 `Roster end < Now()` 的已完成 Roster 不进入恢复流程。 |
| 2.5 | 2026-09-06 | 明确 Preview 中 `Apply` 只写入 Gantt 未保存 Draft，正式提交复用 Gantt Save/`Ctrl+S`；增加 Roster 告警浮显 Recovery 入口；收敛方法选择与候选区域职责，并固定大量候选时的滚动布局。 |
| 2.6 | 2026-09-06 | 复核方案入口与候选 Crew 选择不存在重复功能后保持两层职责；优化大量恢复选项的布局：恢复方式和告警上下文固定可见，候选列表在独立固定区域内滚动，底部 Apply 操作不随候选列表滚出视口，并增强小屏幕下的响应式分栏。 |
| 2.7 | 2026-09-06 | 明确告警上下文和 Apply 操作持续可见；增加 `Ctrl/Cmd+Enter` Apply 快捷键及按钮提示；修复告警浮显跟随鼠标移动导致 Recovery 按钮无法点击的问题，浮显改为首次显示位置锚定并支持进入操作区。 |
| 2.8 | 2026-09-06 | 优化 Crew / option 候选表的固定列宽和数值对齐；增加 `Ctrl/Cmd+R` Recovery 快捷键及设置页提示；将 Pairing 新建、修改和清除 Preview 后取消创建纳入 Pairing Pane 前后态预览，并自动置顶新增/修改 Pairing。 |
| 2.9 | 2026-09-06 | 纳入 Cross-base Destination 能力；明确不固定 `CA`，动态继承原 Crew 的 Acting Rank；`plan=1` 时修改原 Pairing，其他情况新建 `plan=1` Pairing；补充临时 Pairing Rule Preview、异常处理、安全、参数校验、事务、日志、接口契约、代码注释和自动化测试技术基线。 |
| 3.0 | 2026-09-06 | 修复 Cross-base Destination 原地修改时旧 Pairing base 被写回 Roster 的缺陷；明确调整后 base 统一取保留航段首个航班起飞机场，并明确同一 PairingID 在 Pairing Pane 同行展示 Before/After。 |
| 3.1 | 2026-09-07 | 修复本地 `SKIP_RUST_BINS` 未传递给冷启动规则脚本、导致缺少 Rust 二进制时全量重算失败而 8004 告警消失的问题；补充 Crew 1012 / Pairing 135559 Fleet 资格和三条独立 8004 告警的自动化回归要求。 |
| 3.2 | 2026-09-07 | 修复 Pairing Preview 仅显示 After 标签但仍消费原始 Pairing 结构的缺陷；明确原地修改时 After 必须使用候选生成的实际航段、航段数和调整后 base，并补充 135950 首尾 DHD 删除后的结构回归测试。 |
| 3.3 | 2026-09-07 | 完善多告警组合执行一致性：顶层组合统一承担 Rule 检查、过滤、Preview 和 Apply；子方案仅用于明细展示；补充组合 Rule 状态聚合、失败整体过滤及全量 Draft/Pairing/Gantt 预览覆盖要求。 |
| 3.4 | 2026-09-07 | 修复 Live 告警显示缺失：告警查询和 WebSocket 订阅改用当前异步加载完成的 Ruleset ID，移除历史 `103`/旧字符串回退；固定加入 Crew 1012 + Pairing 135559 + 7M8 资格缺失的 8004 自动化回归验证。 |
| 3.5 | 2026-09-07 | 增加独立 `test:8004-regression` 回归命令，固定验证 Crew `1012` 执行 Pairing `135559` 且无 `7M8` 资格必须产生 `8004`，并验证补充有效资格后告警消失；后续涉及规则、告警查询、Ruleset 选择或 Live 数据加载的代码修改必须先通过该用例。 |
