# PBS Flight Number Preference 设计说明

> 状态：已批准实施
>
> 日期：2026-07-13
>
> 范围：PBS Portal Pairing 条件 `116`

## 1. 目标

将现有 `Any Flight Number` 条件升级为 `Flight Number Preference`。机组可以对包含指定航班号的 Pairing 表达 `Award` 或 `Avoid`，并按命中航段的运营日期以及命中数量加以限制。

本次不新增第二个 property；继续使用 property code `116`，避免 Pairing 与 Search Pairings 出现重复入口。

## 2. 已确认的业务语义

| 项目 | 规则 |
| --- | --- |
| 条件名称 | `Flight Number Preference`，替换 `Any Flight Number` |
| 航班号 | 至少选择一个，可通过现有航班号自动完成控件多选 |
| Preference | `Award` / `Avoid`，默认 `Award` |
| Tiers | 必填，默认不选中任何 Tier |
| Flight date | `Any date` / `Specific date` / `Date range`，默认 `Any date` |
| 日期含义 | 命中航段的实际运营日期，即 `pairing_segment.flt_dt`；不是 Pairing 的开始日期 |
| Minimum / maximum required | 统计同一个 Pairing 内，航班号命中所选集合、且符合可选日期限制的航段数量 |
| 数量规则 | 至少填写 minimum 或 maximum 之一；两者都有时 minimum 不得大于 maximum；用户输入使范围倒置时，以刚编辑的值为准，自动同步另一端 |
| 旧数据 | 上线 migration 清除所有 property `116` 旧 bid 和 favorite；不做兼容读取、回显或转换 |

示例：选择 `0601, 0609`，指定 minimum 为 `2`，表示只有同一 Pairing 内至少两段航段的航班号为 `0601` 或 `0609` 时，才命中该规则。若选择日期范围，只有运营日期在范围内的命中航段才计数。

## 3. UI 设计

配置弹窗遵循 `docs/modules/pbs/pairing-condition-ui-standard.md`：使用 `PbsDialogFrame`、`TierToggleGroup`、标准分段控件、`PbsDatePicker` 和 `PairingPropertyDialogFooter`。Pairing 页面与 Search Pairings 必须复用同一个 editor 与同一个 payload 映射。

字段顺序如下：

1. `TIERS`：`T1`–`T7`，初始为空；footer 在未选择时阻止保存。
2. `PREFERENCE`：`Award`（默认）/ `Avoid`。
3. `FLIGHT NUMBERS`：搜索并添加一个或多个航班号，以 tag 展示已选值。
4. `FLIGHT DATE`：`Any date`（默认）/ `Specific date` / `Date range`。
   - Any date：不显示日期输入，payload 不保存日期值。
   - Specific date：一个标准单日 `PbsDatePicker`。
   - Date range：一个标准范围 `PbsDatePicker`，显示 `Start date · TO · End date`，共用同一日历浮层。
5. `MATCHING FLIGHTS`：`Minimum` 与 `Maximum` 两个可选正整数输入框；至少一个必填。使用共享 `PreferenceNumberRange`，只显示简洁字段标签，不显示重复的规则解释小字。
6. Footer：`Cancel`、`Save Favorite`、`Add Bid` / `Update Bid`。

有效性：未选择 Tier、没有航班号、没有填写任何数量、日期模式缺少所需日期或数字非正整数时，保存按钮必须禁用。编辑 Minimum 使其高于当前 Maximum 时，Maximum 自动同步为该值；编辑 Maximum 使其低于当前 Minimum 时，Minimum 自动同步为该值。因此 UI 不产生倒置范围；后端仍必须拒绝绕过前端提交的倒置 payload。

切换日期模式时清除已离开的模式数据，防止草稿中残留旧日期字段；`Any date` 永不提交具体日期值。

## 4. 契约与数据映射

property `116` 的默认 bid 从旧 `tag-list` 改为下列专用结构（字段名以实现时既有类型命名为准，语义不得改变）：

```ts
{
  type: "flight-number-preference",
  flightNumbers: ["0601", "0609"],
  dateScope: null
    | { mode: "specific_date", date: "2026-07-03" }
    | { mode: "date_range", from: "2026-07-03", to: "2026-07-10" },
  minimumRequired: 2 | null,
  maximumRequired: null,
}
```

`dateScope: null` 即 `Any date`。当前 bid period 的唯一来源是当前草稿响应的 `draftMeta.periodCode`，并原样传给 `PbsDatePicker`；新选择的日期只能落在该 period。既有 bid / favorite 的日期按其已保存值完整回显，不能因客户端当前日历月份变化而丢失或被静默改写；用户再次保存时，Portal 必须要求日期符合该草稿的 `draftMeta.periodCode`。号码需要规范化（trim、统一大小写），去重后保存。

所有使用 Pairing bid 的路径必须理解此结构：Portal catalog / draft mapper / summary / favorites / lineholder 序列化与 clone、路由 schema、后端 validation、Pairing Search 条件构造。旧的 `tag-list` 结构不再被 property `116` 接受。

## 5. 后端匹配与搜索

匹配基于 `pairing_segment`：

1. 关联到当前 Pairing 的有效航段（`pairing_segment.is_deleted = 0`）。
2. `upper(flt_num)` 在请求的航班号集合内。
3. 如果指定日期范围，`flt_dt` 必须等于指定日期或落在闭区间内。
4. 按 Pairing 对以上命中航段 `count(*)`。
5. 有 minimum 时应用 `count >= minimumRequired`；有 maximum 时应用 `count <= maximumRequired`。
6. `Award` 使用匹配集；`Avoid` 对完整条件取反。

不得把 minimum / maximum 解释成匹配 Pairing 的数量，也不得要求每一段航段都匹配所选航班号。

## 6. 数据迁移

新增受版本控制的 migration：

1. 删除当前 PBS 范围内 property code `116` 的已保存 bid 与 favorite / template 记录（按实际 schema 及关联表顺序删除，保持 FK 完整性）。
2. 更新 property catalog 的显示名称、默认 bid 与支持的操作 / operator 元数据。
3. 不迁移、不转换旧 `tag-list` 数据；旧数据被明确视为废弃。

migration 必须可重复运行，且只影响 property `116` 的旧数据。实施前先依据远端权威数据库 schema 与现有 migration 约定确认实际表和删除顺序。

## 7. 测试与验收

### 自动化

- Contract / Portal unit tests：初始默认值、日期模式切换清空、数字边界、footer 禁用态、summary、favorite / edit 回显。
- Server validation tests：接受合法专用 payload；拒绝旧 tag-list、空航班号、空数量、非法日期、越界或倒置数量。
- Pairing Search 条件 tests：航班号过滤、`flt_dt` 单日/范围过滤、minimum / maximum 的聚合、Award / Avoid 反向语义。
- Playwright：真实 Pairing 页面创建及编辑一条 Flight Number Preference；Search Pairings 复用 editor 并正确回显；验证请求 payload 与 UI 选择态一致。
- migration test 或受控数据库验证：property `116` 的旧 bid / favorite 已清除，其他 property 不受影响。

### 手工 QA

新增 `docs/test-cases/pbs/pairing/` 中的功能测试案例，覆盖上述创建、编辑、日期、数量、迁移后旧数据不可见、桌面弹窗焦点与日期浮层不裁切。

### 交付命令

至少运行相关 Vitest、目标 Playwright、`pbs-portal` 的 lint 和 build、`npm run check:ui`、`git diff --check`。涉及后端路由 / schema 时，同时运行最小相关 `pbs-server` 测试；若共享契约影响范围扩大，再运行仓库的 PBS 验证命令。

## 8. 范围外

- 不修改用户正在独立开发的 `Pairing Length`。
- 不新增新的航班号搜索接口；复用现有 `/pairing-search/flight-numbers` 自动完成能力。
- 不改变其它 Pairing 条件的历史 bid 数据。
- 本次不提交 Git；提交须由用户另行明确授权。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: Portal payload、后端 validation、SQL 条件和 migration 共用 property `116` 契约，写入边界高度耦合。
- Suggested split: 不适用；由单一实现线保证契约一致性。
- Write boundaries: 不适用。
- Conflict risk: 高；当前工作区已有用户正在进行的 Pairing Length 改动，且也涉及 Pairing property catalog 与同一类文件。
- Execution gate: 用户审阅本 spec 并明确批准后，才开始实现；实施前先隔离和核对现有未提交改动。
