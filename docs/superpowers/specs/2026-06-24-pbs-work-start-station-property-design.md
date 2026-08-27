# PBS Work Start Station Pairing 条件设计

## 背景

June 2026 CLASS bid 导入 dry-run 中出现一条未支持的 pairing criterion：

```text
Award Pairings If Any Landing In GDL, LAX, SFO, YWG If Work Start Station YVR
```

现有系统可以识别并导入 `Any Landing In Airport`，但不能识别 `Work Start Station`，因此该 preference 被归类为 `unsupported_pairing_criterion`。

## 目标

新增一个 Pairing 条件 `Work Start Station`，让系统可以：

- 在 PBS Portal Pairing 页面手工配置该条件。
- 在组合条件中与其他 Pairing 条件一起使用，例如 `Any Landing In Airport` + `Work Start Station`。
- 在 crew bid import 中识别 `If Work Start Station YVR`。
- 在 Search Pairings / count 刷新中按真实 pairing 数据过滤。
- 在算法导出中保留该 property 和参数，供算法侧消费。

## 非目标

- 不改变 `Departure Date / Day` 语义。
- 不改变 `Departure Time` 语义。
- 不把 `Work Start Station` 混入 `Any Landing In Airport`、`Any/Every Layover In Airport` 或 `base`。
- 不在本次实现算法内部如何使用该条件，只负责 PBS 条件存储、导入、页面配置、搜索计数和导出。

## 业务语义

`Work Start Station` 表示整个 pairing 开始工作的站点。

匹配口径：

- 使用 pairing 第一个 duty 的 `duty_str_arp`。
- 第一个 duty 定义为同一 `pairing_id` 下 `duty_seq` 最小的 duty。
- 如果同一 duty 有多段 segment，取该 duty 的 `duty_str_arp`，不是任意 segment 的 `dep_arp`。

示例：

```text
Award Pairings If Any Landing In GDL, LAX, SFO, YWG If Work Start Station YVR
```

导入为同一个 tier 下的组合条件：

- `Any Landing In Airport` = `GDL, LAX, SFO, YWG`
- `Work Start Station` = `YVR`

搜索语义为：

```text
pairing 有任意落地机场在 GDL/LAX/SFO/YWG 中
AND
pairing 第一个 duty 的 duty_str_arp = YVR
```

## 方案比较

### 方案 A：新增独立 Pairing Property（推荐）

新增 `Work Start Station` property，参数类型为机场/站点代码，多选，支持 `Award/Avoid` + `In`。

优点：

- 语义清晰，不污染现有条件。
- UI、导入、搜索计数、算法导出都能保持一致。
- 后续如果 CLASS 文件继续出现同类条件，可以稳定映射。

缺点：

- 需要改 contract、seed/migration、portal UI、live-server mapper/search、测试。

### 方案 B：复用 `Departure Date / Day` 或 `Departure Time`

把 `Work Start Station` 作为出发相关条件的扩展参数处理。

优点：

- 表面上新增 property 少。

缺点：

- 日期/时间条件表达“什么时候开始”，不是“从哪里开始”。
- 会让 UI 和导入数据语义混乱，不推荐。

### 方案 C：复用 `base`

把 `Work Start Station YVR` 近似当成 pairing base 为 YVR。

优点：

- 搜索实现最简单。

缺点：

- `base` 是 pairing/crew 的基地范围，不等于 pairing 工作开始站点。
- 会产生错误匹配，不推荐。

结论：采用方案 A。

## 数据设计

新增一条 `pbs_bid_property`：

- `bid_type`: `Pairing`
- `property_name`: `Work Start Station`
- `award_or_avoid`: `["award","avoid"]`
- `any_or_every`: `null`
- `operator_options`: `["In"]`
- `validation_json`: `{"type":"airport","format":"IATA","label":"Work Start Station","multi":true}`
- `is_active`: `1`
- `is_visible_in_portal`: `1`
- `source_type`: `legacy`

`property_code` 需要在实现时基于当前 catalog 选择一个未占用的 pairing code，避免与现有 `101-164`、line/reserve/days-off property 冲突。建议实现前用数据库和 `packages/contracts/pbs-pairing-bids.js` 双重确认。

## 导入设计

在 `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts` 中新增 criterion 识别：

```text
Work Start Station YVR
Work Start Station YVR, YYZ
```

映射为新增 property：

- `operator`: `In`
- `paramA`: 逗号分隔站点代码
- `paramB`: `null`
- `paramC`: `null`

组合条件继续沿用现有拆分逻辑：主条件 + `If ...` 子条件分别写入同一 tier，不新增“复合 property”。

## 搜索和 Count 设计

在 pairing search condition builder 中支持新 property。

正向匹配 SQL 语义：

```sql
exists (
  select 1
  from live_schema.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq = (
      select min(first_s.duty_seq)
      from live_schema.pairing_segment first_s
      where first_s.pairing_id = p.id
        and first_s.is_deleted = 0
    )
    and upper(s.duty_str_arp) = any($values)
)
```

`Avoid` 使用现有 `wrapIntent` 反转逻辑。

## Portal UI 设计

`Work Start Station` 使用现有 airport/tag-list 控件，不新增特殊 UI。

页面表现：

- 属性列表显示 `Work Start Station`。
- 配置弹窗显示 `BID Work Start Station`。
- 支持输入/选择机场代码。
- 保存后在 Existing Pairing Properties 中显示类似：

```text
Award · YVR
```

组合条件显示仍沿用已有多行/tier 机制。

## 导出设计

算法导出应通过现有 `pbs_bid_group` / `pbs_bid_condition` 读取新增 property code 和参数。除非当前导出层存在 property allowlist，否则不需要为导出新增特殊逻辑。

实现时需要检查：

- `pairing-score-export.ts`
- 任何 property code allowlist / metadata mapping

如果存在 allowlist，需要加入新 property code。

## 失败报告设计

新增后，June dry-run 中 crew `1555` 的这条 preference 不应再进入 `Unsupported`：

```text
Award Pairings If Any Landing In GDL, LAX, SFO, YWG If Work Start Station YVR
```

如果 `YVR` 不在当前 period/base/rank 的 pairing work start station 集合中，应归类为数据匹配问题，而不是 unsupported。

## 测试计划

### Unit / Integration

- `crew-bid-property-mapper.test.ts`
  - `Work Start Station YVR` 映射为新 property。
  - `Award Pairings If Any Landing In ... If Work Start Station YVR` 映射为组合条件。

- crew bid import service tests
  - dry-run 不再把该 preference 归为 unsupported。
  - 保留原有组合条件顺序和 tier 分配逻辑。

- pairing search condition tests
  - `Work Start Station YVR` 生成按第一个 duty `duty_str_arp` 过滤的 SQL。
  - `Avoid Work Start Station YVR` 走反向过滤。

### Portal Component Tests

- property catalog 能识别 `Work Start Station` 的 airport/tag-list 控件。
- 配置弹窗能输入/保存 `YVR`。
- Existing Properties 正确展示。

### Playwright

- 在 Pairing 页面新增 `Work Start Station` 到某个 tier。
- 输入 `YVR` 并保存。
- 点击 Search Pairings / 自动刷新 count 后，确认该条件参与筛选。
- 与 `Any Landing In Airport` 组合时，两个条件都存在且 count 按组合刷新。

## 验收标准

- `CLASS-BidsReport_June2026.txt` dry-run 中 `Work Start Station YVR` 不再显示为 `Unsupported`。
- 对应 preference 被完整导入为组合条件。
- Portal 可手工新增、编辑、删除该条件。
- Search Pairings / count 按第一个 duty 的 `duty_str_arp` 过滤。
- 现有 `Departure Date / Day`、`Departure Time`、`Any Landing In Airport` 行为不变。
- 新增和相关回归测试通过。

## 风险与注意事项

- 必须确认新 `property_code` 未被 DB、contract、算法侧占用。
- 不要把 `Work Start Station` 错实现为 pairing `base`。
- 不要用任意 `dep_arp` 代替第一个 duty 的 `duty_str_arp`。
- airport autocomplete 当前可能按 landing/layover 集合过滤，需要确认是否能覆盖 work start station 集合；如果不能，需要扩展选项来源或允许文本输入。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动跨 contract、数据库 seed/migration、live-server mapper/search、Portal UI 和测试，但核心 property code 与 bid value 格式必须严格一致，拆分并行容易产生契约偏差。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 串行修改 contracts、DB migration、mapper、search condition、portal UI、测试。
- Conflict risk: 中等，主要在 `packages/contracts/pbs-pairing-bids.js`、`pbs-portal/src/features/pairing/` 和 `live-server/src/services/pairing-search/`。
- Execution gate: 本 spec 经用户确认后，再进入实现。
