# PBS Redeye Preference 设计确认

## 背景

Jen 在 `Bidding Options V1(2).xlsx` 中将旧的 `Any Leg Is Redeye` 收敛为新的 `Redeye Preference`：

- `Final Bid Option`: `Redeye Preference`
- `Purpose`: Crew bids for or avoids redeye flights.
- `Required Fields / Inputs`: Award/avoid, date, date range
- `Rules / Defaults`: Redeye definition must appear in the bid option. Suggested: flight operating between 0330-0530.
- `Notes for Developers`: Definition must be configurable if company definition changes.

当前系统已有 Pairing property `117 Any Leg Is Redeye`：

- 前端和 contracts 中使用 `{ type: "flag" }`
- 支持 `award` / `avoid`
- quantifier 固定为 `any`
- 后端 Pairing Search 当前按“到达机场本地日期晚于出发机场本地日期”判断 Redeye

本次设计目标是把 `117` 升级为 `Redeye Preference`，并纳入已建立的 preference 条件 UI 标准。

## 目标

1. 将用户可见名称从 `Any Leg Is Redeye` 升级为 `Redeye Preference`。
2. 在配置弹窗中显示 Redeye 定义，原型文案为 `03:30-05:30 local time`。
3. 支持 `Any date` / `Specific date` / `Date range`，默认 `Any date`。
4. Redeye definition 第一版由数据库配置/seed 固定，后续管理端再维护。
5. 兼容旧的 `{ type: "flag" }` 存量 bid。

## 非目标

- 不在 crew 配置弹窗中允许用户编辑 Redeye time window。
- 不实现管理端配置页面。
- 不引入新的数据库业务表，除非实现时确认当前 property config 无法承载 definition。
- 不改变其他 Redeye 法规、Gantt 标签或 fatigue rule 逻辑。
- 不处理 `Counting Deadhead Legs` 的扩展语义。

## UI 设计

原型文件：

`pbs-portal/.superpowers/redeye-preference-v1.html`

弹窗结构：

1. `Configure Redeye Preference`
2. `TIERS · REQUIRED`
3. `PREFERENCE`
   - `Award`
   - `Avoid`
4. `REDEYE`
   - `03:30-05:30 local time`
5. `DATE`
   - `Any date`
   - `Specific date`
   - `Date range`
6. Footer
   - `Cancel`
   - `Save Favorite`
   - `Add Bid`

UI 必须复用：

- `PreferenceConditionSection`
- `PreferenceSegmentedControl`
- `PbsDatePicker`
- 既有 `TierToggleGroup`
- 既有 `PairingPropertyDialogFooter`

不使用自定义 switch，因为 Redeye 日期限制采用三段式 `Any date / Specific date / Date range`。

## 默认值和验证

- `tiers`: 默认空；保存前必填。
- `preference/action`: 默认 `award`。
- `dateMode`: 默认 `Any date`。
- `Redeye definition`: 只读展示，默认 `03:30-05:30 local time`。
- `Specific date`: 必须选择一个有效 bid period 内日期。
- `Date range`: 必须选择 from/to，且 `from <= to`。
- 切回 `Any date` 后，payload 不保留旧 dateScope。
- 切出 `Specific date` 后，payload 不保留旧 specific date。
- 切出 `Date range` 后，payload 不保留旧 from/to。

## Payload 设计

新增前端/后端 bid value：

```ts
type RedeyePreferenceBid = {
  type: "redeye-preference";
  dateScope: null | {
    mode: "specific_date";
    date: string;
  } | {
    mode: "date_range";
    from: string;
    to: string;
  };
};
```

存量兼容：

- 旧 `{ type: "flag" }` 继续视为有效。
- 打开旧 bid 时回显为 `Redeye Preference`，`dateScope = null`。
- 保存新 bid 时使用 `{ type: "redeye-preference", dateScope: ... }`。
- 后端 validation 和 search builder 同时接受旧 flag 与新 bid。

## Definition 配置

第一版定义：

- `startTime`: `03:30`
- `endTime`: `05:30`
- timezone：以 flight operating local time 判断。

配置来源建议：

1. 在 `sql/seed/10-pbs-bid-property.sql` 的 property `117` `validation_json` 或 tooltip/config 字段中写入默认 definition。
2. contracts/catalog 从服务端 property definition 或本地 catalog 暴露该 definition。
3. 前端 editor 只读取并展示，不硬编码业务定义。

如果当前 property API 暂时没有稳定字段承载 definition，第一版允许在 shared constant 中保底默认值，但必须用 TODO/注释标明后续由管理端配置替换；优先级仍是数据库配置。

## Redeye 判定语义

推荐语义：

> 单个有效 leg 的本地 operating time 与 `03:30-05:30` 窗口有重叠，则该 leg 命中 Redeye。

示例：

- `02:50-05:10`：命中
- `04:00-06:20`：命中
- `22:30-05:10`：命中
- `23:00-02:30`：不命中
- `05:40-08:00`：不命中

日期过滤语义：

- `Specific date` / `Date range` 按 Redeye leg 的本地 operating date 判断。
- 如果 leg 跨午夜且与 Redeye window 重叠，建议使用 Redeye window 所在的本地日期作为过滤日期。
- 第一版实现应在测试中固定 `22:30-05:10` 这类跨夜案例，确保日期归属可解释。

## 后端实现影响

预计涉及：

- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `sql/seed/10-pbs-bid-property.sql`
- `pbs-server/src/routes/pairing-bid-route-schemas.ts`
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- lineholder rule bid serialize / clone / format 相关文件

核心变化：

- `117` 的 name 更新为 `Redeye Preference`。
- validation 支持 `flag` 和 `redeye-preference`。
- Search SQL 从旧的“本地跨日”改为“operating time overlaps configured window”。
- `award` 使用 `exists`；`avoid` 继续用 `not (exists (...))`。

## 前端实现影响

预计涉及：

- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/redeye-preference-editor.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- 相关测试文件

UI editor 需要：

- 使用统一 preference primitives。
- 支持旧 flag 回显。
- 输出新 payload。
- 控制 Save Favorite / Add Bid disabled 状态。
- summary 可读，例如：
  - `Award Redeye`
  - `Avoid Redeye on Jun 10, 2026`
  - `Award Redeye Jun 10-Jun 18, 2026`

## 测试要求

Vitest：

- editor 初始态：无 tier、Award、Any date、definition 展示。
- date mode 切换清理隐藏 payload。
- specific/date range validation。
- 旧 `{ type: "flag" }` 回显和保存升级。
- validation 接受旧 flag 与新 redeye payload，拒绝非法 dateScope。
- search builder 覆盖 operating window overlap。
- search builder 覆盖 avoid intent。
- search builder 覆盖 dateScope。

Playwright：

- Pairing 页面打开 `Redeye Preference`。
- 默认无 tier，选择 T1 后可保存 Any date。
- Specific date / Date range 主路径。
- definition 文案可见。

回归：

- 旧 `Any Leg Is Redeye` 存量 bid 不应失效。
- NPBS import 映射到 property `117` 仍可工作。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该条件横跨 contracts、server validation/search、portal editor 和测试，但改动耦合在同一个 property contract 上，拆多人容易产生 payload/schema 冲突。
- Suggested split: 不建议并行实现；可以先后端 contract/search，再前端 editor，最后测试。
- Write boundaries: 单 agent 顺序处理，避免与正在进行的 Flight Number Preference 改动互相覆盖。
- Conflict risk: Medium。当前工作区已有 Flight Number 相关 dirty 文件，Redeye 实现前必须先确认这些改动的归属和状态。
- Execution gate: 用户确认本 spec 后再开始实现；实现过程中不得覆盖无关 dirty 文件。

## 验收标准

1. 用户可以在 Pairing 条件中配置 `Redeye Preference`。
2. 弹窗显示 `03:30-05:30 local time`。
3. 用户可以选择 `Any date` / `Specific date` / `Date range`。
4. Search Pairings preview 按 Redeye window 命中，而不是简单本地跨夜。
5. 旧 flag bid 仍能回显、保存、搜索。
6. `npm test`、`npm run lint -- --quiet`、`npm run build`、`npm run check:ui`、相关 Playwright 通过。
