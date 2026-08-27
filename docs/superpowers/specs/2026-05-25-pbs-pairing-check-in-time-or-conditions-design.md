# PBS Pairing Check-In Time 多条件 OR 设计

## 背景

`Configure Pairing Bid / Pairing Check-In Time` 每次只配置一个时间条件，例如 `= 09:00` 或 `Between 10:00 - 11:00`。实际用户需要能在同一 tier 下添加多条 `Pairing Check-In Time` bid，并且这些行之间按 OR 关系解释，例如：

- `Between 10:00 - 11:00`
- `= 14:00`
- `> 13:00`

语义为：满足其中任意一个 Check-In Time 条件即可。

## 目标

- `Pairing Check-In Time` 弹窗一次只配置一条时间条件，保持原有 `ADD BID` 流程。
- 用户可在同一 tier 下添加多条 `Pairing Check-In Time` 行。
- 每条子条件支持 `= / < / > / Between`。
- 多条 `Pairing Check-In Time` 行之间按 OR 解释。
- Existing / Favorite / Rule 展示能够显示每条 Check-In Time 条件。
- 搜索 preview 后端能把多个子条件转换为 OR SQL。
- `Pairing Check-In Time` 的唯一合法 bid 结构收敛为 `time-condition-list`。
- 清理 `Pairing Check-In Time` 旧 `time` / `time-range` 兼容逻辑，避免数据库、汇总、搜索和展示出现双轨语义。
- 保存、编辑、收藏沿用现有 `Configure Pairing Bid` 弹窗 loading 体验。

## 非目标

- 不修改其他 Pairing 时间条件，例如 `Report Between`、`Release Between`、`Pairing Check-Out Time`。
- 不新增数据库表。
- 不在弹窗 `BID` 区域增加二级 `ADD` 按钮或 chip/list 子条件列表。
- 不修改 Days Off / Line 模块。
- 不全局删除 `time` / `time-range` bid 类型；其他合法时间类 property 仍可继续使用。
- 不为未上线开发期旧数据保留兼容分支。

## 数据结构

新增 Pairing bid 类型：

```ts
type PbsPairingTimeCondition =
  | { operator: "=" | "<" | ">"; value: string }
  | { operator: "Between"; from: string; to: string };

type PbsPairingTimeConditionListBid = {
  type: "time-condition-list";
  conditions: PbsPairingTimeCondition[];
};
```

`Pairing Check-In Time` 的新增默认 bid 改为：

```ts
{ type: "time-condition-list", conditions: [] }
```

`Pairing Check-In Time` 不再接受以下旧结构：

- `{ type: "time", value, operator }`
- `{ type: "time-range", from, to }`

这些结构仍可以作为其他 Pairing / Line / Days Off 时间类 property 的合法 bid 类型存在，但不能再用于 `propertyCode=103` 的 `Pairing Check-In Time`。如果开发库或 mock / fixture 中存在 `propertyCode=103` 的旧结构，应在开发数据层清理或重建为 `time-condition-list`，不要在常驻服务代码中保留兼容转换。

## 前端交互

`PairingBidControl` 对 `time-condition-list` 使用单条件控件：

- 上方为 operator selector。
- `= / < / >` 显示一个 time input。
- `Between` 显示 from/to 两个 time input。
- 不显示额外 `ADD` 按钮。
- 不显示 chip/list 子条件列表。
- 每次点击弹窗底部 `ADD BID` 只新增一条 `Pairing Check-In Time` 行。
- 同一 tier 可新增多条不同的 `Pairing Check-In Time` 行；完全相同条件仍按重复条件拦截。
- 当前行 `conditions.length === 0` 或第一条 condition 不完整时不可保存。

展示规则：

- 单条：`= 14:00`
- 多条：页面上展示多条 `Pairing Check-In Time` 行；规则表达 / 搜索语义按 OR 组合。

## 后端搜索

`propertyCode 103` 支持：

- 仅支持 `time-condition-list`。
- 将同一 tier 下多条 `Pairing Check-In Time` 行转为对应 time compare SQL，并用 OR 包裹。
- 如果收到 `propertyCode=103` 但 bid 不是 `time-condition-list`，不应继续按旧 `time` / `time-range` 解释；应通过校验失败、空条件或明确错误暴露未清理数据，具体实现按现有 route / service 分层选择最一致的处理方式。

示例：

```sql
(
  check_in_time between $1::time and $2::time
  or check_in_time = $3::time
  or check_in_time > $4::time
)
```

## 测试要求

- 前端控件测试：`Pairing Check-In Time` 弹窗只编辑单个 `= / < / > / Between` 条件，不出现内嵌 `ADD` / chip list。
- Pairing 页面测试：同一 tier 下允许保存多条不同 `Pairing Check-In Time` 行。
- 后端搜索条件测试：`time-condition-list` 生成 OR 条件。
- 后端反序列化 / route / search 测试：删除旧 `propertyCode=103 + time/time-range` 兼容用例，新增旧结构不再被合法解释的回归用例。
- mock、fixture、测试数据中 `propertyCode=103` 只保留 `time-condition-list`。
- `pbs-portal` build 和 Pairing 相关测试通过。
- `pbs-server` Pairing search 相关测试通过。

## 清理范围

- 文档：删除 `Pairing Check-In Time` 兼容旧 `time` / `time-range` 的设计目标。
- Contract：`Pairing Check-In Time` 的 default bid 保持 `time-condition-list`；全局 bid union 中的 `time` / `time-range` 不因本需求删除。
- Contract：`propertyCode=103` 需要按 multi-use property 处理，同一 tier 下不同 Check-In Time 条件允许共存。
- 前端：`Pairing Check-In Time` 的 mapper、summary、完整性校验、mock 和测试数据只按 `time-condition-list` 处理，但 UI 每次只编辑单条 condition。
- 后端 route：提交 `Pairing Check-In Time` 时只接受 `time-condition-list` payload。
- 后端 serialize / deserialize：`Pairing Check-In Time` 不再把旧 `time` / `time-range` 反序列化为单条 condition。
- 后端 search：`propertyCode=103` 不再走旧 `time` / `time-range` SQL 分支。
- 测试：删除旧兼容断言，补防回归断言，避免后续重新引入双轨语义。

## 验收标准

- 新增 / 编辑 / 保存 / 展示 / 搜索 `Pairing Check-In Time` 时，后端唯一结构为 `time-condition-list`。
- 弹窗 `BID` 区域不出现二级 `ADD` 按钮或 condition chip。
- 用户可在同一 tier 下看到多条 `Pairing Check-In Time` 行。
- `propertyCode=103` 的旧 `time` / `time-range` bid 不再被系统解释为合法 Check-In Time 条件。
- 其他 property 的合法 `time` / `time-range` 行为不受影响。
- 文档、测试和实现口径一致，不再出现“兼容旧 Check-In Time bid”的残留描述。
- 若开发数据库已有旧 `propertyCode=103` 数据，后续单独确认是否执行一次性清理；不在常驻业务代码中保留兼容转换。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是 contract、前端控件、后端搜索 SQL、序列化和测试的收敛闭环，接口结构需要一致，单 agent 集成更稳。
- Suggested split: 不拆分。
- Write boundaries: Pairing contract、Pairing bid control/summary、Pairing search time conditions、Pairing route / serialize 相关测试。
- Conflict risk: 中等，重点是只清理 `propertyCode=103`，不要影响其他仍然合法的 `time/time-range` 条件。
- Execution gate: 用户已确认后实施。
