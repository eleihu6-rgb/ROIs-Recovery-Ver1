# PBS Dashboard Message Center 预占展示设计

## 背景

当前 Dashboard 右侧 `MESSAGE CENTER` 只展示了很少的信息，例如 `BASE LINE AVERAGE`、`FLEET / SUB-FLEET`，视觉层级和业务价值都比较弱。

业务上已经确认：`预占` 是在 Award 发布前就已经确定的 crew 占用信息，不应该受 Award 发布状态控制。Award 页面读取发布后的 `roster_publish` 是合理的，但 Dashboard 右侧展示预占时，如果复用 Award 逻辑，会导致未发布时看不到本来已经存在的预占。

因此，Dashboard 需要新增一条独立的数据读取和展示逻辑：直接从当前 roster 输入数据中读取当前登录 crew 在当前 PBS period 内的预占。

## 目标

- 在 Dashboard 右侧 `MESSAGE CENTER` 中展示当前 crew 当前 PBS period 的预占信息。
- 预占展示不依赖 Award 是否发布。
- 页面展示要比现在更清晰，不再像占位数据堆在右侧。
- 只影响 Dashboard 右侧信息面板，不改变 Bid、Award、Reserve、Standing Bid 等页面行为。
- 保持前端展示为英文 UI 文案。

## 非目标

- 不修改 Award 页面读取发布结果的逻辑。
- 不修改发布流程，也不要求生成新的 `roster_publish` 数据。
- 不做数据库 schema migration。
- 不处理历史脏数据兼容，例如旧快照里的 `source = PA`。
- 不把完整排班明细表做成新的 roster viewer；Dashboard 右侧只展示当前 crew 当前 period 的预占明细，并通过面板内部滚动控制高度。
- 不做分页接口或虚拟滚动；当前 crew 单月预占数量通常较小，完整返回后在前端局部滚动即可。

## 数据源选择

### 推荐数据源

Dashboard 预占应读取 live schema 下的 `roster_flight`。

原因：

- `roster_flight` 是当前排班输入层，发布前已经存在。
- 预占属于“当前 period 已确定占用”，不是“已发布 Award 结果”。
- `roster_publish` 只有发布后才可靠，不能用于未发布 Dashboard 预占。

### Source 范围

第一版只统计：

- `source = 'IMP'`

不统计：

- `source = 'CR'`：优化器计算结果，不属于提前确定的预占。
- `source = 'MA'`：Gantt 人工创建/调整的数据，是否算预占语义不够稳定，先不混入。
- `source = 'PA'`：历史旧值，当前 live 标准已经迁为 `IMP`，不做脏数据兼容。

如果后续产品确认 Gantt 人工锁定/人工预分配也要纳入，可以再单独把 `MA` 纳入，并在 UI 文案上区分 `Imported` 和 `Manual`。

## 后端设计

### Contract 扩展

扩展 `PbsDashboardMessageCenter`，新增 `preAssignments`：

```ts
type DashboardPreAssignmentSummary = {
  totalDuties: number
  daysTouched: number
  categories: Array<{
    code: string
    label: string
    count: number
  }>
  details: Array<{
    id: string
    type: "pairing" | "ground"
    code: string
    label: string
    startDate: string
    endDate: string
    timeText: string | null
  }>
}
```

`messageCenter.preAssignments` 没有数据时返回空摘要，而不是返回 `null`，方便前端稳定渲染 empty state。

字段命名使用 `details`，不再使用 `upcoming` 作为契约字段名。原因是本需求要展示当前 period 的完整预占明细，不只是业务时间之后的 upcoming duty；继续叫 `upcoming` 会误导后续维护和测试。

### 查询范围

使用 Dashboard 当前登录 crew 和当前 PBS period：

- `crew_id = 当前登录 crew`
- `is_deleted = 0`
- `source = 'IMP'`
- 时间与 period 有交集：

```sql
sch_start_time < :periodEndExclusive
and coalesce(sch_end_time, sch_start_time) >= :periodStart
```

这里使用 period 的 roster start/end，不使用 Award Publish 时间，也不使用当前真实月份推断。

### 去重和归类

`roster_flight` 中 flying duty 可能按 flight leg 存多行，所以不能直接按行数统计。

统计规则：

- `pairing_id` 有值：按 `pairing_id` 聚合为一个 pairing duty。
- ground / non-pairing：按 `assignment_group + assignment + label + start/end` 聚合。
- `daysTouched` 按 duty 覆盖的本地日期去重计算。

分类建议：

| 分类 | 规则 |
| --- | --- |
| Pairing | `pairing_id` 有值 |
| Days Off | `assignment` 为 `DO / GDO / OFF` |
| Reserve | `assignment` 为 `RES` 或 label 表达 reserve |
| Training | `assignment` 为 `SIM / SFT / CBT` |
| Deadhead | `assignment` 为 `DHD` |
| Unavailable | `assignment` 为 `VAC / ILL` |
| Other | 其他占用 |

`details` 返回当前 crew 当前 period 内的完整预占 duty 明细，不做 `.slice(0, 5)` 截断。

排序规则：

- 按 duty `startUtcMs` 升序。
- 同一开始时间下，pairing 和 ground duty 保持后端聚合后的稳定顺序。

完整返回的原因：

- 右侧摘要里的 `totalDuties` 可能是 30，但如果明细只给 5 条，用户会认为数据没有展示完整。
- 前端只靠滚动无法补足被后端截掉的数据。
- 当前查询范围是单个 crew + 单个 period，数据量可控，不需要分页接口或虚拟滚动。

### 性能

- Dashboard summary 只增加一次按 crew + period + source 的轻量查询。
- 不做全员扫描，不按所有 crew 聚合。
- 不在前端二次请求明细，避免 Dashboard 首屏多一条网络瀑布。
- 如发现远端 `roster_flight` 缺少适合的索引，再单独评估 SQL 优化；本需求第一版不直接加 migration。

## 前端设计

### Message Center 结构

右侧面板调整为更清晰的工作台信息区：

1. Section header: `MESSAGE CENTER`
2. 主区块：`Pre-assigned Duties`
   - 显示 `totalDuties` 和 `daysTouched`
   - 展示分类明细，例如 `Pairing 9`、`Days Off 20`、`Unavailable 1`，用于解释 `totalDuties`
   - 展示当前 period 完整预占明细
3. 辅助区块：保留 `FLEET / SUB-FLEET` 这类已有信息，但弱化层级
4. 如果 `BASE LINE AVERAGE` 仍无权威数据来源，隐藏或改为低优先级，不再占据面板第一视觉焦点

### 明细区滚动

预占明细标题从 `UPCOMING DUTIES` 调整为：

`DUTY DETAILS`

原因：

- 展示范围是当前 period 完整预占，不是只展示未来 upcoming。
- 避免用户误解列表只代表未来几天。

布局规则：

- `Pre-assigned Duties` 摘要区固定显示，不参与内部滚动。
- `DUTY DETAILS` 列表设置 `max-height`，超过高度后只在列表内部垂直滚动。
- 右侧整个 `MESSAGE CENTER` 面板不因为 30 条明细无限变高，也不裁切列表尾部。
- 列表内部滚动必须可通过鼠标滚轮/触控板滚动，键盘焦点进入列表时也应可滚动。
- `Bid Package` 保持在明细列表下方；当明细很多时，用户可以在右侧面板内继续看到或滚动到该区块。

不采用分页：

- 预占明细是一个月的线性占用记录，分页会打断时间顺序。
- 飞行员需要快速扫完整个月，内部滚动比分页更直接。

不采用虚拟滚动：

- 单 crew 单 period 明细一般几十条，虚拟滚动收益很低。
- 虚拟滚动会增加测试复杂度和可访问性风险，不符合本次小范围修复目标。

### 空状态

没有预占时展示：

`No pre-assigned duties for this period.`

不要用 `-` 或空白表格。

### 样式原则

- 右侧面板保持 Dashboard 三栏布局，不改左侧 user panel 和中间 calendar。
- 不继续使用硬凑的表格外观。
- 使用轻量 section、summary chips、紧凑 list item。
- 文案和数字对齐，避免右侧面板看起来像临时 debug 输出。

## 错误处理

- Dashboard summary API 失败时沿用现有 Dashboard 页面级 loading/error 逻辑。
- 如果只有预占查询失败，后端应记录安全日志；前端不展示原始异常。
- 不把 SQL、schema、异常栈或内部 source 字段暴露给用户。

## 测试计划

### 后端

- 为 dashboard summary service 增加测试：
  - 未发布 period 仍能从 `roster_flight` 返回预占。
  - `pairing_id` 多 leg 只统计 1 个 duty。
  - `source = CR` 不计入预占。
  - 空数据返回空摘要。

### 前端

- mapper 测试：
  - contract 的 `preAssignments` 能正确映射到右侧面板数据。
  - 空摘要显示 empty state。

- 组件测试：
  - 有预占时显示总数、天数、分类和完整明细。
  - 明细超过可视高度时，列表容器具备内部滚动样式。
  - 无预占时显示英文空状态。

### Playwright

- 打开 `/pbs/dashboard`：
  - 右侧 `MESSAGE CENTER` 不裁切。
  - `Pre-assigned Duties` 可见。
  - `DUTY DETAILS` 能展示超过 5 条记录，最后一条可通过内部滚动看到。
  - 中间 calendar 不受影响。
  - 页面在 1920x1080 和较小缩放视口下布局正常。

### QA 文档

新增 Dashboard 人工测试用例：

- 未发布 period 可见预占。
- 已发布 period 仍可见预占。
- 当前 crew 无预占时显示 empty state。
- 当前 crew 有超过 5 条预占时，右侧明细可滚动查看完整列表。
- 右侧面板样式和中间 calendar 布局不互相影响。

## 验收标准

- Dashboard 右侧可以看到当前 crew 当前 period 的预占摘要。
- 不发布 Award 也能看到预占。
- Pairing 多 flight leg 不重复计数。
- 右侧明细不再只显示前 5 条，当前 period 内的预占记录可以完整查看。
- 明细区域通过内部滚动控制高度，不把 Dashboard 页面撑坏，也不裁切尾部。
- 预占不混入优化器计算结果。
- 右侧 `MESSAGE CENTER` 视觉层级明显改善。
- 不影响 Award 页面、Bid 页面和中间 Dashboard calendar。
- 相关后端测试、前端测试、Playwright 验证和 UI 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这个需求会同时触碰 Dashboard summary contract、后端 service、前端 mapper 和右侧面板，同一个数据契约贯穿前后端，拆给多个 agent 容易出现契约不一致。
- Suggested split: 不建议并行拆分；由一个实现者按 contract -> backend -> frontend -> tests 顺序推进。
- Write boundaries: 主要文件集中在 `packages/contracts`、`pbs-server/src/services/dashboard-summary`、`pbs-portal/src/features/dashboard`、`docs/test-cases/pbs/dashboard`。
- Conflict risk: Medium，主要风险是和 Dashboard 布局、summary mapper、现有测试产生冲突。
- Execution gate: 用户确认本 spec 后再进入实现；实现前先做 GitNexus impact 分析。
