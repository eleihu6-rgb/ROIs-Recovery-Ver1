# PBS Pairing Departing On 日期 / 星期控件设计

## 背景

用户在 Pairing 配置弹窗中发现 `Departing On` 当前页面形态不对：它被渲染成通用 tag 输入框，提示用户输入 code 并按 Enter 添加。

只读核对后确认：

- 当前 contract 中 `propertyCode=106` 为 `Departing On`，但默认使用 `{ type: "tag-list" }`。
- 前端因此走了通用 `TagListControl`，不符合该 property 的业务语义。
- 后端 pairing search 当前没有看到 `propertyCode=106` 的专门 SQL 条件处理，存在“可保存但搜索不生效 / 语义不清”的风险。
- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 是旧库对照来源，`bid_properties` sheet 中 `id=106` 的定义为：
  - `remastered_property`: `Departing On`
  - `operator`: `["Between", "In"]`
  - `validation_json`: `{"type": "date_or_dow", "label": "Date / Day", "label_from": "From Date", "label_to": "To Date", "multi": true}`
  - `notes`: `A = dates or day-of-week names`
- `sql/seed/10-pbs-bid-property.sql` 中 legacy catalog 也已将 `106` 定义为 `date_or_dow`。

因此，`Departing On` 的正确含义不是“时间点”，也不只是“星期几”，而是：

> 按 pairing 的出发 / origin date 筛选，支持具体日期、星期几，或日期范围。

## 目标

- 将 `Departing On(propertyCode=106)` 从自由 tag 输入改为专用的 `date_or_dow` 控件。
- 前后端 contract、校验、摘要、搜索 SQL 保持同一套语义。
- 不兼容明显错误的旧时间值，例如旧数据中少量 `09:10 - 09:20` 被放到 `Departing On` 的情况。
- 不影响其它仍然合法使用 `tag-list` 的 Pairing property，例如机场、pairing number、机型等。

## 范围

本次修复只处理 `Pairing / Departing On / propertyCode=106`。

包含：

- `packages/contracts` 中新增或调整 106 的 bid value 结构。
- `pbs-portal` 中新增专用控件、完整性校验、operator 切换、summary。
- `pbs-server` 中新增 route schema / bid value 校验、序列化反序列化、pairing search SQL。
- 自动化测试和 QA 测试案例。

不包含：

- 全局替换所有 `date_or_dow` property。
- 处理 `Any/Every Duty On Date / Day(propertyCode=110)` 或 `Any/Every Layover On Date / Day(propertyCode=123)`。
- 迁移历史 Excel 中的 552 条旧 bid 数据。
- 兼容旧数据中与定义冲突的时间值。

## 业务语义

`Departing On` 判断的是 pairing occurrence 的开始日期。

后端取值建议与现有 Pairing Number occurrence 逻辑保持一致：

```sql
coalesce(
  (
    select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
    from <live_schema>.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
  ),
  p.sch_str_dt_utc
)
```

该时间转 UTC date 后作为 `origin_date / departing_date` 参与判断。

## 数据结构建议

新增 Pairing 专用 bid 类型，避免继续复用自由 `tag-list`：

```ts
type PbsPairingDateOrDowBid =
  | {
      type: "date-or-dow-list";
      dates: string[];
      daysOfWeek: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">;
    }
  | {
      type: "date-range";
      from: string;
      to: string;
    };
```

说明：

- `date-or-dow-list` 对应 operator `In`。
- `date-range` 对应 operator `Between`。
- `dates` 使用 `YYYY-MM-DD`。
- `daysOfWeek` 使用稳定英文三字母大写码。
- `date-or-dow-list` 中 `dates` 和 `daysOfWeek` 至少有一个非空。
- `date-range.from` 和 `date-range.to` 必填，且 `to >= from`。

如果现有 `date-range` 类型已被其它 Pairing bid 使用，可复用现有类型；但 106 的 `In` 不再复用自由 `tag-list`。

## 前端交互设计

### Operator

- 仍显示 mode：`Award / Avoid`，且必选。
- operator 支持：
  - `In`
  - `Between`

### In 控件

显示两个区域：

- Date：日期选择输入，可添加多个具体日期。
- Day：星期多选按钮，固定显示 `Mon Tue Wed Thu Fri Sat Sun`。

交互规则：

- 用户可以只选日期。
- 用户可以只选星期。
- 用户可以同时选日期和星期。
- 日期和星期之间是 OR 关系：命中任意一个即可。
- 不显示自由文本输入，不允许用户手输任意 code。
- 新增默认值为空，保存前必须至少选择一个日期或星期。

### Between 控件

显示两个日期输入：

- From Date
- To Date

交互规则：

- 只表达日期范围，不表达星期范围。
- 不显示小时、分钟、秒。
- `To Date` 不能早于 `From Date`。

### Summary

示例：

- `In Dec 1, 2025, Dec 2, 2025, Mon, Tue`
- `Between Dec 1, 2025 - Dec 13, 2025`
- `Award Departing On In Mon, Tue`
- `Avoid Departing On Between Dec 1, 2025 - Dec 13, 2025`

具体日期格式可以沿用项目现有 summary 风格，但内部值必须保持 `YYYY-MM-DD`。

## 后端 SQL 设计

构造 `departingDateExpression`：

```sql
(
  coalesce(
    (
      select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
      from <live_schema>.pairing_segment s
      where s.pairing_id = p.id
        and s.is_deleted = 0
    ),
    p.sch_str_dt_utc
  ) at time zone 'UTC'
)::date
```

### In

如果有 `dates`：

```sql
departing_date = any($dates::date[])
```

如果有 `daysOfWeek`：

```sql
extract(isodow from departing_date) = any($dow::int[])
```

其中：

- `MON=1`
- `TUE=2`
- `WED=3`
- `THU=4`
- `FRI=5`
- `SAT=6`
- `SUN=7`

日期和星期条件用 OR 包裹。

### Between

```sql
departing_date between $from::date and $to::date
```

### Award / Avoid

沿用现有 `wrapIntent` 逻辑：

- `award` 使用正向条件。
- `avoid` 使用 `not (<正向条件>)`。

## 旧数据与兼容策略

项目仍处于开发阶段，不要求迁移历史 Excel 数据。

策略：

- 新接口只接受新的 `date-or-dow-list` / `date-range` 结构。
- 不再允许 106 保存自由 `tag-list`。
- 不兼容旧数据中明显错误的时间值，例如 `09:10`、`05:00`。
- 如后续需要导入旧库 `crew_bids`，应在导入脚本中把 `param_a` 日期 / 星期解析为新结构；脏数据应进入导入错误报告，而不是污染运行时 contract。

## 测试要求

### 前端自动化测试

- `Departing On` 不显示自由 tag 输入。
- `In` 可选择多个日期和多个星期。
- `In` 空值时不能保存。
- `Between` 显示日期范围输入。
- `Between` 缺少起止日期或结束早于开始时不能保存。
- operator 从 `In` 切到 `Between`、再切回 `In` 时结构保持可控，不产生旧 `tag-list`。

### 后端自动化测试

- route schema 接受 `date-or-dow-list` 和 `date-range`。
- route schema 拒绝 106 的旧 `tag-list`。
- route schema 拒绝时间字符串。
- search SQL 对日期列表生成 `any($n::date[])`。
- search SQL 对星期列表生成 `extract(isodow ...)`。
- search SQL 对日期 + 星期组合生成 OR 条件。
- search SQL 对日期范围生成 `between $from::date and $to::date`。
- `avoid` 包裹为 `not (...)`。

### QA 人工测试案例

新增：

`docs/test-cases/pbs/pairing/2026-05-25-pairing-departing-on-date-or-dow-control.md`

覆盖：

- Award + In + 日期
- Award + In + 星期
- Award + In + 日期和星期混合
- Avoid + Between + 日期范围
- 空值无法保存
- 非法范围无法保存
- Search Pairings / Current Rules 汇总语义一致

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务是一个小闭环，涉及同一个 property 的 contract、前端控件、后端 SQL 和测试。拆分多 agent 容易让 bid shape 和校验规则出现歧义。
- Suggested split: 不拆分。
- Write boundaries: 主 agent 统一修改 `packages/contracts`、`pbs-portal` Pairing 控件/校验/测试、`pbs-server` Pairing route/search/测试、QA 文档。
- Conflict risk: Medium。当前 Pairing 相关文件已有未提交改动，需要在现有改动基础上小心增量修改，不能回滚无关内容。
- Execution gate: 用户确认本 spec 后再开始实现。

## 验收标准

- `Departing On` 页面不再出现自由 tag/code 输入框。
- 用户能明确选择日期、星期或日期范围。
- 后端保存结构不再与普通 tag-list 混淆。
- Search Pairings / Current Rules 能按 106 正确过滤结果。
- 旧库 Excel 的 `date_or_dow` 定义、seed、contract、前后端行为一致。
- 自动化测试和 QA 测试案例完成。

## 待用户确认

请确认是否按本 spec 实现：

- `In` 支持日期多选 + 星期多选，二者 OR。
- `Between` 只支持日期范围，不支持星期范围，也不支持时间。
- 106 不再兼容旧 `tag-list` 或错误时间值。

