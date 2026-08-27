# PBS Pairing 116「Any Flight Number」设计确认

## 背景

用户在 Pairing 条件配置中检查到 `Any Flight Number`，当前页面 Bid 是普通 tag 输入框。用户判断它也应该像可搜索业务对象一样做下拉搜索，并要求核对旧库和数据库。

本设计只覆盖 Pairing property `116`，不扩展到其他航班号、Pairing Number 或 Flight 类条件。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `116`：

- 名称：`Any Flight Number`
- bid 类型：`flight`
- action：`award` / `avoid`
- quantifier：仅 `any`
- operator：空
- 参数：`param_a = 航班号列表`

因此当前页面中：

- `MODE` 显示 `Award / Avoid` 是正确的。
- 不显示 `Every` 是正确的，因为旧库只有 `Any`。
- 不显示 operator 是正确的，因为旧库没有额外 operator。
- Bid 应表达“航班号列表”，但普通手输 tag 输入体验不够，且后端搜索 SQL 需要补齐。

## 当前数据库核对

当前 live schema 中存在两类可用航班号来源：

- `f8.flight.flt_num`
  - 航班主表。
  - 当前约 5550 行，约 1072 个 distinct `flt_num`。
  - 范围更全，但不保证每个航班号都出现在 Pairing 中。
- `f8.pairing_segment.flt_num`
  - Pairing leg 冗余航班号。
  - 当前约 11532 行，约 322 个 distinct `flt_num`。
  - 与 Pairing 搜索结果直接相关，适合作为 116 的候选项来源和过滤字段。

结论：

- UI 下拉候选优先使用 `pairing_segment.flt_num`，只展示真正出现在 Pairing leg 中的航班号。
- 后端过滤也使用 `pairing_segment.flt_num`，因为 116 的语义是“任意 leg 是否为指定航班号”。
- 不需要 join `flight` 表才能实现 116；`pairing_segment` 已冗余 `flt_num`。

## 业务语义

`Any Flight Number` 表达：

> 筛选出任意有效 leg 的航班号命中所选航班号列表的 Pairing。

示例：

- `Award + [1993]`：Pairing 中只要任意一个有效 leg 的 `flt_num = 1993`，该 Pairing 符合。
- `Avoid + [1993]`：排除任意有效 leg 的 `flt_num = 1993` 的 Pairing。
- `Award + [1993, 1600]`：任意有效 leg 的航班号是 `1993` 或 `1600` 即符合。

有效 leg 应排除 `pairing_segment.is_deleted = 1`。

## 当前实现问题

当前 contract 中 `116` 的大方向基本符合旧库：

- `supportedActions: ["award", "avoid"]`
- `supportedQuantifiers: ["any"]`
- `defaultBid.type: "tag-list"`

但当前仍有缺口：

- UI 是普通 tag 输入，不是 Flight Number 下拉搜索。
- 后端 pairing search 未发现 `propertyCode 116` 的 SQL 分支，保存后很可能不能真正按航班号过滤。
- 默认值当前可能带示例航班号，容易让用户误以为已配置；应改为空列表，由用户主动选择。

## 设计方案

推荐方案：新增 Flight Number 多选搜索控件，并将 116 后端过滤落到 `pairing_segment.flt_num`。

### 前端控制

- 116 的 bid 值继续保存为 `tag-list`，值为航班号字符串数组。
- UI 从普通 tag 输入升级为 Flight Number 多选搜索。
- 下拉展示建议格式：
  - `1993`
  - `1600`
- 实际保存值：
  - `["1993", "1600"]`
- 输入框文案使用 `Search Flight Number`。
- 保留手动输入/粘贴航班号能力作为降级路径，但保存前需要去空、去重、统一大小写。

### 后端接口

新增或复用 PBS Server 只读 Flight Number 搜索接口：

- 建议 route：`GET /api/pairing-search/flight-numbers`
- 查询来源：`<liveSchema>.pairing_segment`
- 搜索字段：`flt_num`
- 返回字段：
  - `value`
  - `label`
- 结果限制：
  - 默认 20 条。
  - 最大 50 条。
- 空 query 直接返回空 options，避免全量扫描。

### Pairing Search SQL

116 的搜索条件应基于：

- pairing 主表：当前 pairing search 已有的 `pairing p`
- leg 表：`<liveSchema>.pairing_segment s`

匹配关系：

- `s.pairing_id = p.id`
- `s.is_deleted = 0`
- `upper(s.flt_num) = any(<selected flight numbers>)`

`Award` 语义：

- `exists` 至少一个有效 leg 命中所选航班号。

`Avoid` 语义：

- 复用现有 `wrapIntent`，即 `not (exists ...)`。

### 校验

- 116 只允许 `award` / `avoid`。
- 116 只允许 `tag-list`。
- 116 必须至少包含一个非空航班号。
- 116 不接受 `Every`。
- 116 不新增 operator。
- 不保留旧默认示例航班号作为实际 bid 值。

## 可选方案与取舍

### 方案 A：推荐，候选和 SQL 都使用 `pairing_segment.flt_num`

优点：

- 与 116 的 Pairing leg 语义直接一致。
- 用户只会搜到能命中 Pairing 的航班号。
- SQL 简洁，不需要 join `flight`。

缺点：

- 如果未来希望提前配置“还没被放入 Pairing 的航班号”，此方案不会出现在候选中。

### 方案 B：候选使用 `flight.flt_num`，SQL 使用 `pairing_segment.flt_num`

优点：

- 候选航班号更全。

缺点：

- 用户可能选到当前 Pairing 中不存在的航班号，导致预览无结果。
- 搜索候选和实际过滤来源不一致，容易误解。

### 方案 C：保持手输 tag，只补 SQL

优点：

- 改动最小。

缺点：

- 用户体验差，容易输错航班号。
- 与当前对业务对象类条件做搜索控件的方向不一致。

推荐采用方案 A。

## 接受标准

- 116 配置窗口中可以搜索并多选 Flight Number。
- 116 初始 Bid 为空，不带示例默认航班号。
- `Award + [flight numbers]` 能筛出任意有效 leg 航班号命中的 Pairing。
- `Avoid + [flight numbers]` 能排除任意有效 leg 航班号命中的 Pairing。
- 空航班号列表不能保存为有效 bid。
- 116 不显示 Every，不显示额外 operator。
- 不影响 Pairing Number、Airport / City、Employee Number 搜索控件。

## 测试要求

自动化测试：

- `pbs-portal`：
  - Flight Number autocomplete 配置测试。
  - `PairingBidControl` 选择 flight number 后保存 `tag-list.values`。
  - 116 仍只显示 `Award / Avoid`，不显示 `Every`。
- `pbs-server`：
  - Flight Number search route/service 测试。
  - 116 route validation 测试：拒绝空列表、拒绝非 tag-list。
  - pairing search SQL 测试：覆盖 Award / Avoid。
- contract：
  - 116 默认 bid 为空列表。

回归验证：

- `npm --prefix pbs-portal test -- pairing-bid-control flight-number-autocomplete pairing-service pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-server test -- --test-reporter=spec pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts pbs-server/src/services/pairing-search/pairing-search-service.test.ts pbs-server/src/routes/pairing-search.test.ts pbs-server/src/routes/pairing-bids.test.ts pbs-server/src/services/lineholder/rule-bid-value.test.ts`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

人工 QA 文档：

- 新增 `docs/test-cases/pbs/pairing/2026-05-26-pairing-any-flight-number-control.md`
- 覆盖 Flight Number 搜索、多选、Award、Avoid、空值校验和回归范围。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在单个 property，且需要保持 contract、前端 autocomplete、route validation 和 SQL 语义一致。并行拆分容易造成接口字段或搜索来源不一致。
- Suggested split: 不建议拆分。由一个实现者顺序完成 contract、后端 search route/service、SQL、前端接入、测试和 QA 文档。
- Write boundaries: 若后续必须并行，可只拆一个只读 reviewer 检查 SQL 语义；不建议多个 agent 同时写 pairing search 相关文件。
- Conflict risk: Medium。`pbs-search-pairings` contract、`pairing-search-service`、`pairing-search-condition-builder`、`pairing-property-config-dialog` 都是近期高频改动区域。
- Execution gate: 需要用户确认本 spec 后才进入实现。

## 待确认事项

请确认以下设计是否正确：

1. 116 的 Flight Number 候选来源使用 `pairing_segment.flt_num`，不使用更全但可能不命中的 `flight.flt_num`。
2. UI 改为 Flight Number 多选搜索，展示和保存航班号字符串。
3. 后端 116 SQL 使用 `pairing_segment.flt_num` 判断任意有效 leg 是否命中。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
