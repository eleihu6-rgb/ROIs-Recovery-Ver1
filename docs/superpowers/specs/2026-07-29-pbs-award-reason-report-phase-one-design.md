# PBS Award Reason Report 第一阶段设计

日期：2026-07-29

状态：设计已确认，待书面 Spec Review

## 1. 背景

PBS Award 页面已经完成以下能力：

- 只读取正式发布快照 `roster_publish`。
- 展示整月 Calendar、Roster Details、Selected Duty、Credit 和 Fleet。
- 从受控 `roster_publish.comments` 解析已获 Pairing 的简短
  `explanation`。
- 在 Selected Duty 中展示单个 Pairing 的 `Award Explanation`。

当前页面仍有两个占位入口：

- 顶部 `View Reason Report`。
- 右下角 `Reason Report Preview`。

目前 `reasonReport.available` 由 `pbs_award_result / pbs_award_item` 是否存在控制，
Preview 只有占位文案，按钮没有真实打开行为。第一阶段算法只能提供“为什么获得这个
Pairing”，尚不能提供“为什么没有获得其他 Pairing”。

## 2. 目标

第一阶段把现有已获 Pairing explanation 组织成真实、可阅读的整月 Reason Report：

1. Preview 显示当前周期前 3 条真实 Pairing explanation。
2. `View Reason Report` 打开页面内弹窗，展示整月全部真实 explanation。
3. Reason Report 是否可用只由有效 explanation 数量决定。
4. 不依赖 `pbs_award_result / pbs_award_item` 是否存在。
5. 继续以 `roster_publish.comments` 为唯一运行时原因来源。
6. 为未来第二阶段“未获得原因”保留可扩展的数据结构，但本阶段不展示或推断失败原因。

## 3. 范围

### 3.1 包含

- 扩展共享 Award Contract 的 `reasonReport`。
- PBS Server 从已经严格校验过的 Pairing `explanation` 生成报告条目。
- Preview 显示前 3 条。
- Portal 使用项目统一 `@rois/ui` `AppDialog` 显示完整列表。
- 空报告、加载失败和无效 comments 的安全处理。
- Contract、PBS Server、Portal、Playwright 和 QA 测试。

### 3.2 不包含

- 不解释为什么没有获得候选 Pairing。
- 不解析 `bid_explanation_report.csv`。
- 不在 Award 请求期间读取 Scenario、Engine 文件或 Live 工作态
  `roster_flight`。
- 不展示普通人工 comments。
- 不为 Day Off、ILL、VAC、CGS 等地面任务编造原因。
- 不把没有 explanation 的 Pairing 或地面任务列入 Reason Report。
- 不新增数据库字段或 migration。
- 不修改 PBS Engine。
- 不修改 `roster_publish.comments` 的现有受控协议和 provenance 校验。
- 不新增独立 Reason Report HTTP endpoint。
- 不提供 PDF、CSV 下载或打印版。

## 4. 数据来源和所有权

数据链保持：

```text
PBS Engine explanation
  → scenario.roster_flight.comments
  → live.roster_flight.comments
  → roster_publish.comments
  → PBS Server Award mapper
  → /award/current reasonReport
  → Portal Preview / Dialog
```

运行时规则：

- `roster_publish.comments` 是唯一权威来源。
- PBS Server 继续复用现有 `PBS_AWARD_V1` 严格解析器。
- 只有满足现有 provenance 条件的 Pairing 才可能产生 explanation：
  `source='CR' AND request_source='SCENARIO' AND request_id IS NOT NULL`。
- 多航段 comments 必须全部一致且合法；否则 Pairing explanation 为 `null`，不进入
  Report。
- Portal 不解析原始 comments，也不重新推导原因。

## 5. 方案选择

### 5.1 方案 A：扩展 `/award/current`（采用）

PBS Server 在现有 Award mapper 内从最终 Pairing items 生成 `reasonReport.items`。
Preview 和弹窗共用同一份响应。

优点：

- 一次请求，数据口径一致。
- 复用现有 comments 解析和 Pairing 聚合。
- 不增加接口、缓存和第二套错误状态。
- 未来第二阶段可扩展 report item，而不需要替换页面入口。

### 5.2 方案 B：新增 `/award/reason-report`

点击按钮后单独加载报告。能够延迟加载，但会增加 endpoint、缓存、鉴权、加载和错误
状态。本阶段数据量小且已包含在 Award items 中，不采用。

### 5.3 方案 C：Portal 从 Award items 自行拼装

改动较少，但会把业务过滤、排序、去重和可用性规则放到前端，未来第二阶段容易重复实现，
不采用。

## 6. Contract

扩展 `PbsAwardCurrentResponse.reasonReport`：

```ts
type PbsAwardReasonReportItem = {
  id: string;
  kind: "awarded_pairing";
  pairingId: string;
  pairingCode: string;
  startDate: string;
  endDate: string;
  explanation: string;
};

type PbsAwardReasonReport = {
  available: boolean;
  disabledReason?: string;
  items: PbsAwardReasonReportItem[];
};
```

字段规则：

- `id`：使用稳定、确定的 Award Pairing item id；同一响应内唯一。
- `kind`：第一阶段固定为 `awarded_pairing`，为第二阶段扩展
  `unawarded_pairing` 等类型保留边界。
- `pairingId`：非空 Pairing 业务 id。
- `pairingCode`：使用现有 Award item 的 Pairing Code；若源值缺失，使用 Pairing ID
  作为安全展示回退，不使用 `Missing`。
- `startDate / endDate`：继续使用 crew base local date。
- `explanation`：只使用已经剥离 `PBS_AWARD_V1|` 前缀的安全正文。
- 第一阶段不在 Report item 中单独返回 `matchedTier`。安全 explanation 正文已经包含算法
  提供的 Tier；避免把可能陈旧的 `pbs_award_item.matched_tier` 与 comments 中 Tier
  同时展示并产生矛盾。Portal 不从正文反向解析 Tier。

兼容规则：

- `items` 必须始终存在；无报告时为 `[]`。
- `available === (items.length > 0)`。
- `items.length === 0` 时设置：
  `disabledReason = "No award explanations are available for this period."`
- `items.length > 0` 时不得返回 `disabledReason`。

## 7. PBS Server 组装规则

在 `buildAwardCurrentResponse` 完成 Award items 后生成 report：

1. 只读取最终 `items`，不重新查询 comments。
2. 只保留：
   - `item.type === "pairing"`
   - `item.pairingId !== null`
   - `item.explanation !== null`
3. Day Off、ILL、VAC、CGS、其他 Activity 和无 explanation 的 Pairing 不进入报告。
4. 一个 Pairing item 生成一个 report item；多航段不会重复。
5. 按以下稳定顺序排序：
   - `startDate`
   - `pairingCode`
   - `pairingId`
   - `id`
6. Report id 直接复用已经完成 Pairing 聚合的唯一 Award item id，不增加第二套去重、
   warning 或 logger 依赖。
7. Report 可用性不再由 `awardRows.length` 或
   `pbs_award_result / pbs_award_item` 决定。
8. `summary.tier`、单个 Award item 的 `matchedTier` 等现有 Award Result 语义保持不变。

性能：

- Report 只对当前响应内的 Award items 做一次 O(n) 过滤和 O(k log k) 排序。
- 不增加数据库查询和网络往返。
- 不阻塞 Award 页面已有数据加载路径。

## 8. PBS Portal 设计

### 8.1 Reason Report Preview

- 标题继续使用 `Reason Report Preview`。
- `items.length > 0` 时显示前 3 条：
  - 日期或日期范围。
  - Pairing Code。
  - explanation 正文。
- 超过 3 条时显示：
  `+ N more explanations`。
- Preview 与完整弹窗使用同一 `data.report.items`，不得各自重新过滤。

### 8.2 View Reason Report

- `data.report.available=true` 时启用按钮。
- 点击后使用项目统一 `@rois/ui` `AppDialog`，不得使用 raw `DialogContent`、Modal、
  Drawer、Popover 或自行实现弹窗。
- 使用受控 `open / onOpenChange` 状态。
- 弹窗内容：
  - 标题 `Award Reason Report`。
  - 当前 period。
  - 按稳定日期顺序展示全部报告条目。
  - 每条展示日期、Pairing Code 和 explanation；Tier 已包含在受控 explanation 正文中，
    不再单列。
- 内容超出可用高度时，列表内部滚动。
- Dialog 必须具备 `role="dialog"`、可访问标题 `Award Reason Report`、可访问名称明确的关闭
  按钮和焦点陷阱。
- 支持右上角关闭、`Esc` 关闭和 `AppDialog` 标准允许的关闭方式。
- 关闭后焦点返回 `View Reason Report` 按钮。
- 本阶段只读，不提供编辑、下载、打印或复制按钮。

### 8.3 空状态

`items=[]` 时：

- `View Reason Report` disabled。
- 按钮 title 使用 `disabledReason`。
- Preview 显示：
  `No award explanations are available for this period.`
- 不显示 `Missing`。
- 不打开空弹窗。

## 9. 错误处理和安全

- Award API 整体失败时继续使用现有页面级错误状态；本阶段不新增 Retry 或恢复控件。
- 不为 Report 创建单独重复 toast。
- 不向用户展示原始 comments、协议前缀、数据库异常、Solver 内部字段或堆栈。
- 单个 Pairing comments 无效、来源错误或航段冲突时，该 Pairing 不进入报告，Award API
  仍成功。
- Portal 只渲染 Contract 的安全字段。
- 无 explanation 是正常业务空状态，不是错误。

## 10. 第二阶段兼容

未来算法提供“为什么没有获得”后：

- 扩展 `kind`，例如 `unawarded_pairing`。
- 为 report item 增加第二阶段经过审查的候选 Pairing、失败类别和用户可见原因字段。
- 仍由 PBS Server 统一组装，Portal 根据 `kind` 展示不同条目。
- 第一阶段 `awarded_pairing` Contract 和展示保持兼容。

本阶段不得提前增加未使用的失败原因字段，不得从 Bid、Score 或法规结果猜测第二阶段原因。

## 11. 测试与验收

### 11.1 Contract

- `reasonReport.items` 类型完整。
- `kind` 第一阶段只接受 `awarded_pairing`。
- 空报告始终返回 `items=[]`。

### 11.2 PBS Server

- 合法 explanation 进入 Report。
- 普通 comments、无效协议、错误 provenance、航段冲突不进入。
- 无 `pbs_award_result` 但有 explanation 时 Report 仍可用。
- 有 `pbs_award_result` 但没有 explanation 时 Report 不可用。
- `pbs_award_item.matched_tier` 与 comments 正文 Tier 不一致时，Report 只展示安全
  explanation，不返回或展示单独 Tier 字段。
- Day Off 和 Activity 不进入。
- 多航段 Pairing 只生成一条。
- 多 Pairing 按稳定规则排序。
- `available`、`disabledReason` 和 `items` 始终一致。
- Award 查询数不增加。

### 11.3 PBS Portal

- Preview 最多显示 3 条。
- 第 4 条起通过 `+ N more explanations` 提示。
- 点击按钮打开完整弹窗。
- 弹窗显示全部条目并可关闭。
- 日期、Pairing Code、正文正确，Tier 只在安全 explanation 正文中出现。
- 无 explanation 时按钮禁用，Preview 使用新空状态，不出现 `Missing`。
- 选中 Roster Duty 的现有 `Award Explanation` 保持不变。
- `/award/current` 加载失败时沿用既有 Award 页面级错误状态，不渲染 Preview 或弹窗，
  不产生重复 toast，不暴露响应异常或原始 comments；本阶段不新增 Retry 或恢复控件。
- 弹窗具有可访问名称 `Award Reason Report`，关闭按钮具有可访问名称，关闭后焦点返回入口。

### 11.4 Playwright

真实 Portal 流程覆盖：

1. 登录 crew 账号并打开 `/award`。
2. 拦截或准备含至少 4 条真实 explanation 的 Award 响应。
3. 验证 Preview 只显示 3 条及 `+ 1 more explanation`。
4. 点击 `View Reason Report`。
5. 验证弹窗包含 4 条完整原因。
6. 使用 `Esc` 或关闭按钮关闭，并验证焦点返回。
7. 验证空报告状态按钮禁用且不出现 `Missing`。
8. 模拟 `/award/current` 失败，验证既有页面级错误状态；不得渲染 Report
   Preview/弹窗、重复 toast 或原始异常。

### 11.5 QA 人工测试

新增：

`docs/test-cases/pbs/award/2026-07-29-award-reason-report-phase-one.md`

覆盖有效报告、空报告、非法 comments、来源错误、多航段一致性、排序、弹窗滚动和第二阶段
未启用边界。

## 12. 验收标准

- 只要当前周期至少有一条有效 Pairing explanation，Reason Report 按钮可用。
- Preview 最多 3 条，完整弹窗包含全部真实原因。
- 没有 explanation 的任何项目均不列入报告。
- Ground、Day Off、ILL、VAC、CGS 不因缺少原因显示在报告中。
- Report 不依赖 `pbs_award_result / pbs_award_item` 是否存在。
- 不增加数据库查询、字段或 migration。
- 不读取 Engine 文件、Scenario 或 Live 工作态 roster。
- 不泄漏普通 comments、协议标识或内部错误。
- Contract、PBS Server、Portal、Playwright 和 QA 验证通过。

## 13. 影响范围

预计修改：

- `packages/contracts/pbs-award-results.d.ts`
- 必要的共享 Contract 测试
- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/award-results-mapper.test.ts`
- `pbs-portal/src/features/award/components/award-right-panel.tsx`
- 必要的 Award 类型、mapper 和页面测试
- `e2e/tests/pbs-portal/award-reason-report.spec.ts`
- `docs/test-cases/pbs/award/2026-07-29-award-reason-report-phase-one.md`

不修改：

- `pbs-engine`
- `engine-server`
- `live-server`
- 数据库 schema / migration
- Award roster 查询
- 当前 comments 受控协议
- Standing Bid 相关文件

## 14. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：共享 Contract、PBS Server mapper 和 Portal 展示按顺序依赖，整体规模不大；
  当前工作区还有 Standing Bid 并行修改，增加 agent 会提高冲突风险。
- Suggested split：单一实现者按 Contract → PBS Server → Portal → Playwright → QA 顺序完成。
- Write boundaries：只写第 13 节 Award 相关文件，不触碰 Standing Bid。
- Conflict risk：低到中；共享 Contract 和 Award 文件集中，但与当前 Standing Bid 写边界分离。
- Execution gate：本 spec 完成独立 review、用户审阅批准并生成 implementation plan 后才能实施。
