# PBS Pairing Check-In / Check-Out Time：Jen 对齐合并设计

日期：2026-07-12
状态：原型已确认，待用户审阅正式方案
范围：`pbs-portal`、`pbs-server`、`packages/contracts`、`sql/migration`、PBS 自动化测试与 QA 用例

## 1. 已确认的业务方向

来源：

- `init-docs/Bidding Options V1(2).xlsx` 的 Pairing 第 6 行；
- `init-docs/Jenife_Bidding_Type_Clarification_20260707.docx` 的 Pairing bids 说明。

Jen 要求将当前两个独立入口合并为一个：

`Pairing Check-In / Check-Out Time`

它用于按一条 pairing 的报到（Check-In / report）或释放（Check-Out / release）时间 Award / Avoid pairing。用户在同一条 bid 内选择其中一种时间类型，不再分别创建 Check-In 与 Check-Out property。

该条件必须支持：

1. `Check-In` / `Check-Out` selector；
2. 现有时间比较能力：`= / < / > / Between`；
3. `Specific Date` 或 `Date Range` 的可选日期限制；
4. `AM` 与 `PM` 快捷范围：
   - AM → `03:00–11:00`；
   - PM → `14:00–22:00`；
5. 快捷范围写入后仍可编辑为任意自定义时间。

用户已确认原型的 Portal 风格与交互方向；原型文件是忽略的 brainstorm 辅助文件，不属于产品实现。

## 2. 当前状态与数据影响

当前 catalog 有两条旧 property：

| Code | 当前名称 | 当前 payload | 当前搜索时间来源 |
| ---: | --- | --- | --- |
| 103 | Pairing Check-In Time | `time-condition-list` | pairing 所有有效 segment 的最早 `brief_start_utc` |
| 111 | Pairing Check-Out Time | `time` / `time-range` | pairing 所有有效 segment 的最晚 `debrief_end_utc` |

远端 PBS schema `f8_pbs` 的只读盘点结果：

| Property | 直接 group | condition row | configured favorite | simple favorite |
| --- | ---: | ---: | ---: | ---: |
| 103 | 469 | 0 | 2 | 0 |
| 111 | 43 | 0 | 0 | 0 |

用户已明确：这些旧数据不再有用，采取与 Airport Preference（168）相同的破坏性替换策略，不做 payload 兼容、自动转换或旧 UI 回退。

## 3. 方案比较

### A. 保留两个旧 property，只为它们加日期与 AM/PM

改动较小，但仍会让用户面对两个入口，直接违背“one bid with selector”的要求。

不采用。

### B. 新增第三个合并 property，保留 103 / 111

可避免变更旧 contract，但三个相似入口会持续造成选择歧义，也需要长期兼容三种 payload。

不采用。

### C. 保留 103 的稳定身份并完整替换；退役 111（推荐）

将 103 改名为 `Pairing Check-In / Check-Out Time`，采用一个明确的新 JSON payload；111 从 Portal catalog 退役。受控 migration 清除 103 / 111 的旧 bid 与 favorite。

优点：一个入口、一套语义，搜索、保存、summary 和 solver export 都不会保留双轨。代价是一次有意的数据清理，已获用户确认。

采用方案 C。

## 4. 产品交互契约

### 4.1 弹窗与默认状态

实现复用 Portal 的 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PbsDatePicker` 与现有 footer，不引入独立视觉系统。

- 标题：`Configure Pairing Check-In / Check-Out Time`；
- 新增时所有 Tier 都不选，并显示 `TIERS · REQUIRED`；
- `Award` 默认选中，`Avoid` 可切换；
- `Check-In` 默认选中；
- 时间 operator 默认 `Between`，但起止时间均为空；
- 日期限制默认关闭，`dateScope: null`，不预填日期；
- 未选 Tier 或未填完整时间时，`SAVE FAVORITE` 和 `ADD BID` 禁用；
- 编辑新 payload / favorite 时严格回显已保存值，不套用新增默认值。

### 4.2 时间类型与时间窗口

- `Check-In` 匹配 pairing 的最早 report time；`Check-Out` 匹配最晚 release time；
- `= / < / >` 显示一个 `HH:MM` 输入；`Between` 显示起止两个 `HH:MM` 输入；
- 点击 `AM` 或 `PM` 时强制选择 `Between` 并分别写入 Jen 指定范围；
- 用户手动修改任何时间后，AM / PM 的高亮状态取消；
- `Custom` 清空两个时间输入并进入无快捷范围的手动状态；
- 时间字段为必填，日期字段不是必填。

### 4.3 日期限制

- `LIMIT TO PAIRING DATE` 关闭时，payload 必须为 `dateScope: null`，不保留隐藏缓存日期；
- 开启后可选择 `Specific Date` 或 `Date Range`；
- Specific Date 使用现有单日 `PbsDatePicker`；Date Range 使用现有 range picker；所有日期均为 `YYYY-MM-DD`；
- 未完成的日期范围、格式错误日期或 `from > to` 均不可提交；关闭开关后清除整个 `dateScope`。

### 4.4 不在范围内

- 不处理 `164 Departure Time`。Jen 倾向不要同时提供 Check-In 与 Departure Time，但本轮用户只确认合并 103 / 111，164 的退役需单独确认；
- 不添加 minimum / maximum required、quantifier、enroute time 或跨时区的新业务语义；
- 不改 `PbsDialogFrame`、Tier 通用组件或基础日期 picker；
- 不兼容或显示任何旧 103 / 111 payload。

## 5. 新 payload 与服务端搜索语义

103 改为唯一 payload：

```ts
type PairingCheckTimeType = "check_in" | "check_out";

type PairingCheckTimeDateScope =
  | { mode: "specific_date"; date: string }
  | { mode: "date_range"; from: string; to: string }
  | null;

type PairingCheckTimeBid =
  | {
      type: "pairing-check-time";
      timeType: PairingCheckTimeType;
      operator: "=" | "<" | ">";
      value: string;
      dateScope: PairingCheckTimeDateScope;
    }
  | {
      type: "pairing-check-time";
      timeType: PairingCheckTimeType;
      operator: "Between";
      from: string;
      to: string;
      dateScope: PairingCheckTimeDateScope;
    };
```

服务端必须使用当前已验证的 pairing-level表达式：

| timeType | 时间表达式 | 日期表达式 |
| --- | --- | --- |
| `check_in` | 有效 segment 的 `min(brief_start_utc)`，按既有 UTC time-of-day 规则 | 同一最早 `brief_start_utc` 的 UTC date |
| `check_out` | 有效 segment 的 `max(debrief_end_utc)`，按既有 UTC time-of-day 规则 | 同一最晚 `debrief_end_utc` 的 UTC date |

日期限制与时间比较必须为同一 selector 的 AND 条件：Specific Date 为 `selector_utc_date = date`；Date Range 为 `from <= selector_utc_date <= to`（首尾均包含）。`Between` 也包含上下界。新的 103 在同一 tier 中仍沿用现有 multi-use 能力，可添加多条不同的合并时间条件；每一条各自选择 Check-In 或 Check-Out。

## 6. 数据库 migration

新增一个事务化 migration，目标 schema 为 `f8_pbs`：

1. 用 `pbs_bid_property.property_code in (103, 111)` 的 stable id，同时识别历史直接写入 property code 的记录；
2. 找出 103 / 111 作为主 group 或作为 `pbs_bid_condition` 附加条件时的整个 `property_group_key`；命中的 group 必须整体删除，避免只删一条子条件而意外扩大原规则。若该 group 内还有其他 property，它们也属于被废弃的完整规则并有意删除；
3. 清除两个 code 命中的 `pbs_bid_pairing_configured_favorite` 与 `pbs_bid_pairing_favorite`；
4. 删除这些 group 的条件、group 行，以及因此变为空的 bid container；同一 `pbs_bid` 内但属于**其他 `property_group_key`** 的 property 必须保留；
5. upsert 103 catalog：新名称、`pairing_check_time` validation metadata、Award/Avoid、`= / < / > / Between` 与 Portal 可见；
6. 将 111 标为 inactive 且不在 Portal 可见，不删除其 catalog identity；
7. 输出 group、bid、condition、两类 favorite 和空 container 的删除计数，作为部署回执。

不会在实现阶段自行执行远端 migration；代码、测试和提交完成后，单独向用户报告预检计数并等待执行指令。

## 7. 实现边界

### Contracts、Portal

- 在 `packages/contracts/pbs-pairing-bids.*` 定义上述 bid union，并把 103 catalog 改成统一默认草稿；删除 111 在 Portal 可见 catalog 中的有效入口；
- Portal 新增 feature-local `PairingCheckTimeEditor`，由 `PairingPropertyConfigDialog` 的 103 专用分支调用；
- 更新 clone、draft mapper、完整性校验、existing/favorite restore、summary 与可读 rule expression；
- Search Pairings 的条件 picker 与编辑弹窗只能使用合并后的 103。

### PBS Server

- 更新 route schema、normalization、serialize / deserialize、payload validation 与 current-draft / favorite API；
- 103 payload 仅接受新 `pairing-check-time`；111 不再接受新增或编辑；
- 将 preview SQL 改为按 `timeType` 分派 report / release 的时间与日期表达式；
- 更新 lineholder / solver export summary，使其写出 Check-In 或 Check-Out、时间条件和可选日期范围。

## 8. 验收与测试

### 自动化

1. Portal 组件测试覆盖默认空 Tier、Award、Check-In、空时间和关闭日期限制；
2. Portal 组件测试覆盖 `= / < / > / Between`、AM / PM 填充、Custom 清空、手动编辑取消 preset；
3. Portal 测试覆盖日期开关、single / range picker、`YYYY-MM-DD` 与 `from <= to` 校验、关闭后 `dateScope: null`、Award / Avoid 保存与 favorite 回显；
4. Catalog / Portal 测试断言 103 只显示一次且名称为合并入口，111 不可见且不能新建；
5. Server validation / route 测试拒绝旧 103 `time-condition-list`、旧 111 以及不完整的新 payload；
6. Server preview SQL 测试覆盖两个 timeType、四种 operator、specific date、首尾包含的 date range；
7. migration integration 测试覆盖：命中 target 的完整 group 被删除、同一 bid 的其他 group 保留、仅空 bid container 删除；并分别断言两类 103 / 111 favorite 被清除、其他 code 的 favorite 保留；
8. Playwright 从真实 Pairing 页面完成：选 T1、Award / Avoid、Check-Out、AM 或 PM、日期限制、提交并刷新回显；
9. 新增 QA 手工用例，明确 103 / 111 历史 bid/favorite 需要重建。

### 最小验证命令

实施后至少运行受影响 Portal / Server 定向 Vitest、相应 Playwright、`npm run check:ui`、`npm run lint`、`npm run build`；跨模块 contract 改动最终运行 `npm run verify:pbs`。最终交付列出实际命令与 PASS / FAIL。

## 9. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 合并 payload 使 report / release 日期混用 | timeType 同时选择时间和日期 expression；以 SQL 回归测试锁定。 |
| 清除子 condition 扩大原 rule | migration 以完整 `property_group_key` 删除。 |
| 已保存旧数据被新 editor 错读 | 迁移先清除，服务端拒绝旧结构，不留 runtime fallback。 |
| AM / PM 变成不可见魔法值 | 始终显示明确范围，写入后仍可编辑。 |
| 103 仍沿用旧 multi-condition list 语义 | 新 payload 和 validation 只允许一条 selector / time window；多条时间条件通过同 tier 的多条 property group 表达。 |
| 误扩展至 Departure Time（164） | 明确列为非目标，后续单独设计。 |

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 新 payload 同时影响 contract、Portal editor、保存/恢复、Server validation、搜索 SQL、migration 和 solver export；写入边界高度重叠。
- Suggested split: 不拆分实现；先完成统一 contract 和 migration，再串行完成前端、后端与测试。
- Write boundaries: 由同一实现者控制 `packages/contracts`、`pbs-portal`、`pbs-server`、`sql/migration`、测试与 QA 文档。
- Conflict risk: High。
- Execution gate: 用户审阅本方案并明确批准实施后，才创建实施计划和开始代码修改。
