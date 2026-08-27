# PBS Prefer Off 移除 Fulfilment 设计

## 背景

我们正在用 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 作为 F8 PBS 条件的对标标准。该项目的 `DAYSOFF.csv` 只表达具体 day-off 时间窗口和 Tier：

- `Crew_ID`
- `DayOff_Start_Time_UTC`
- `DayOff_End_Time_UTC`
- `T1_Award_Counter` 到 `T7_Award_Counter`

它没有 `Fulfilment`、`Minimum required`、`Maximum required` 或 flexible quantity 语义。Jen 后续也明确说 `Minimum required / Maximum required` 先不要，因此当前员工端 `Prefer Off` 弹窗中的 `FULFILMENT` 分区已经不应继续展示。

## 目标

1. Days Off `Prefer Off` 配置弹窗不再显示 `FULFILMENT` 分区。
2. 不再显示或允许用户选择：
   - `All selected periods`
   - `Flexible quantity`
   - `Minimum required`
   - `Maximum required`
3. 用户选择多个 dates / date range / weekdays / weekends 时，系统默认理解为全部 selected periods 都是 Prefer Off。
4. 新增、编辑、收藏、从收藏添加、calendar 派生的 `Prefer Off` 行为保持一致。
5. 导出到算法侧时继续按每个具体 day off window 展开，不引入 flexible quantity。

## 非目标

1. 本次不删除数据库字段：
   - `all_or_nothing`
   - `minimum_n`
   - `limit_n`
   - `maximum_n`
2. 本次不做旧线上数据兼容迁移；项目尚未上线，后续如果需要可单独清理历史 draft/favorite 中的旧字段值。
3. 本次不改变 `Long Stretch Off / Compressed Flying`。
4. 本次不改变 Pairing 条件里独立存在的 run 数量 / fulfilment 逻辑；只处理 Days Off `Prefer Off`。Pairing 条件中的 `FULFILMENT`、`Minimum required`、`Maximum required` 仍按各自条件需求保留。

## 推荐方案

采用“UI 隐藏 + 保存标准化”的小步方案：

1. 前端移除 `Prefer Off` 编辑器中的 `FULFILMENT` 整块 UI。
2. `Prefer Off` editor value 不再把 fulfilment 作为用户可编辑状态。
3. 生成保存 payload 时统一写成：
   - `allOrNothing: true`
   - `minimumN: null`
   - `maximumN: null`
4. 后端 Prefer Off 归一化 / 校验同步收敛：
   - 新写入的 Prefer Off 统一按 all selected periods 处理。
   - 如果 API payload 带来旧的 `minimumN / maximumN`，服务端应忽略或标准化为 `null`，不要继续暴露 flexible quantity 语义。
5. 旧字段继续保留在 contract / DB schema 中，避免本次变更扩大成 schema 改造。

## 备选方案

### 方案 A：只移除前端 UI，后端保持不变

优点：改动最小。

缺点：API 或导入路径仍可能写入 flexible quantity，隐藏行为会继续存在，不利于后续按标准答案收敛。

### 方案 B：UI 移除 + 后端标准化（推荐）

优点：员工端和服务端语义一致，后续不会再产生新的 min/max Prefer Off 数据；不需要数据库 migration。

缺点：需要更新前后端测试，改动比纯 UI 稍大。

### 方案 C：删除字段和历史逻辑

优点：最彻底。

缺点：牵动 schema、contract、历史测试、导入路径和 favorite/draft 查询，当前不值得。

## 前端设计

影响范围：

- `pbs-portal/src/features/days-off/components/prefer-off-editor.tsx`
- `pbs-portal/src/features/days-off/components/prefer-off-editor-value.ts`
- `pbs-portal/src/features/days-off/components/prefer-off-editor.test.tsx`
- `pbs-portal/src/features/days-off/days-off-calendar-prefer-off.ts`
- `pbs-portal/src/features/days-off/days-off-calendar-mutation.ts`
- 相关 Days Off / portal QA 文档与 E2E 测试

行为要求：

1. `Prefer Off` 弹窗只保留：
   - Tiers
   - Selection Type
   - 对应日期 / 星期 / weekend 配置
   - 可选 time window（如果当前仍保留）
   - 底部 action buttons
2. 当选择结果覆盖多个 periods 时，不新增任何 fulfilment UI。
3. 新建 `Prefer Off` 默认按 all selected periods 保存。
4. 编辑历史 flexible quantity bid 时：
   - UI 不显示旧 min/max。
   - 保存后标准化为 `allOrNothing=true, minimumN=null, maximumN=null`。
5. Favorite 保存 / Add Favorite / Existing 编辑都使用同一套标准化结果。
6. Calendar 派生 / calendar mutation 生成或更新 `Prefer Off` 时，不再沿用 hidden `allOrNothing=false`、`minimumN`、`maximumN`；target 和 diff 都按标准化结果处理。

## 后端设计

影响范围：

- `pbs-server/src/services/days-off/prefer-off-property.ts`
- `pbs-server/src/services/days-off/days-off-validation.ts`
- `pbs-server/src/services/days-off/days-off-draft-mappers.ts`
- `pbs-server/src/services/days-off/days-off-persistence-mappers.test.ts`
- `pbs-server/src/services/days-off/days-off-validation.test.ts`
- `pbs-server/src/services/days-off/prefer-off-property.test.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts`
- `pbs-server/src/services/crew-bid-import/*test.ts`
- `pbs-server/src/services/algorithm-export/days-off-export.test.ts`

服务端行为：

1. Prefer Off 的规范化结果统一为：
   - `allOrNothing=true`
   - `minimumN=null`
   - `maximumN=null`
2. 校验不再要求 flexible quantity 的 min/max。
3. 对旧 payload：
   - 如果带 `allOrNothing=false`、`minimumN`、`maximumN`，归一化阶段强制覆盖为 all selected periods。
   - 不再因为缺少 `minimumN / maximumN` 报 `Flexible quantity requires minimum and maximum values`。
4. 数据库写入仍使用现有字段，但写入值固定为：
   - `all_or_nothing = 1`
   - `minimum_n = null`
   - `limit_n / maximum_n = null`
5. Crew bid import 路径中如果解析到旧文本里的 `Minimum N`、`All or Nothing` 或其他 Prefer Off quantity 语义，也必须标准化为无 flexible quantity 的 Prefer Off；不能绕过 Days Off normalize 继续写入 `minimum_n`。

## 算法导出设计

`DAYSOFF.csv` 导出继续以实际展开出来的日期 / 时间窗口为准。

示例：

用户选择 `Weekends`，bid period 内有 12 个 Friday/Saturday/Sunday 日期，则导出 12 行 `DAYSOFF.csv`，每行对应一个 day-off window 和对应 Tier counter。

不会导出 “至少满足 N 个” 或 “最多满足 N 个” 的额外约束。

## 测试要求

### 前端单元测试

更新 `prefer-off-editor` 相关测试：

1. 多个 selected periods 时不显示 `FULFILMENT`。
2. 不存在 `Flexible quantity`、`Minimum required`、`Maximum required`。
3. `getPreferOffEditorResult` 对多日期 / weekday / weekend 返回：
   - `allOrNothing=true`
   - `minimumN=null`
   - `maximumN=null`
4. 编辑旧 flexible quantity property 时，UI 值仍能打开并保存为标准化结果。
5. Calendar 派生的 Prefer Off target 不携带旧 `minimumN / maximumN`，calendar mutation 不会因为旧 hidden min/max 产生不必要 diff。

### 后端单元测试

更新 Days Off validation / normalize 测试：

1. Prefer Off 多日期不需要 `minimumN / maximumN`。
2. 旧 flexible quantity payload 被标准化，不再报错。
3. 写入 mapper 输出固定 all-or-nothing 语义。
4. Crew bid import 中包含 `Prefer Off ... Minimum N` 或旧 all-or-nothing 表达时，最终导入结果标准化为 `allOrNothing=true, minimumN=null, maximumN=null`。
5. `DAYSOFF.csv` 导出回归：即使源数据来自旧 min/max Prefer Off，导出仍只按具体日期 / 时间窗口生成 rows，不出现 quantity 相关列或规则。

### E2E / QA

更新或新增 PBS Portal QA，并运行真实 UI Playwright 回归用例。优先更新现有 `e2e/tests/pbs-portal/days-off-prefer-off.spec.ts`；如果该文件不存在或已拆分，则使用等价的 PBS Portal Days Off Prefer Off Playwright 用例覆盖相同行为。

1. 打开 `Add Prefer Off`。
2. 选择多个 specific dates，确认不显示 `FULFILMENT`。
3. 选择 date range，确认不显示 `Minimum required / Maximum required`。
4. 选择 weekdays / weekends，确认保存成功。
5. 保存后重新编辑该 bid，确认仍不显示 fulfilment 且日期选择回显正确。

需要同步修正文档：

- `docs/test-cases/pbs/days-off/2026-07-08-days-off-prefer-off-entry-simplification.md`：该文档仍描述旧的三入口 `Dates / Days of Week / Date Range` 行为，应标记为历史废弃或改写为当前统一 `Prefer Off` 入口。
- `docs/test-cases/pbs/days-off/2026-05-21-configured-favorites-regression.md`：该文档仍覆盖 `Save Favorite / Add Favorite` 并提到 `All or Nothing / Minimum required` 与 `minimumN` payload，应更新为 favorite 不展示 fulfilment/min/max 且保存标准化 payload。
- `docs/test-cases/pbs/days-off/2026-07-10-prefer-off-unified-condition.md`
- `docs/test-cases/pbs/days-off/2026-07-13-preference-condition-standard-batch-3.md`
- `docs/test-cases/pbs/portal/2026-07-12-preference-interaction-consistency.md`
- 全仓库其他仍直接要求 Days Off `Prefer Off` 展示或保存 `FULFILMENT`、`All selected periods`、`Flexible quantity`、`Minimum required`、`Maximum required`、`minimumN`、`maximumN` 的历史 QA 文档，也应同步更新或明确标记为被当前 spec 取代。

## 验收标准

1. Days Off `Prefer Off` 弹窗完全不出现 `FULFILMENT` 文案。
2. Days Off `Prefer Off` 弹窗 / Days Off `Prefer Off` 流程中不出现：
   - `All selected periods`
   - `Flexible quantity`
   - `Minimum required`
   - `Maximum required`
   Pairing 条件中的同类 fulfilment UI 不属于本次验收范围。
3. 多日期、多 weekday、weekend、date range 都能正常保存。
4. 保存 payload / 后端落库不再产生新的 flexible quantity Prefer Off 数据。
5. `DAYSOFF.csv` 导出仍按具体 day off rows 展开。
6. 相关前端测试、后端测试、`npm run check:ui`、PBS Portal Days Off Prefer Off Playwright 回归通过，并在实现总结中报告命令与结果。

## 风险与注意点

1. 现有测试中有不少旧语义断言，需要同步更新，而不是简单删除。
2. `allOrNothing` 字段名保留但产品语义不再对用户展示，后续代码注释要避免把它解释成一个仍可配置的 UI 功能。
3. 如果 crew bid import 仍解析旧文本里的 minimum/flexible 表达，应在本次实现中明确丢弃或标准化，否则会产生隐藏数据。
4. 数据库历史草稿如果已有 `all_or_nothing=0` 和 min/max，首次编辑保存后会被标准化；本次不做批量迁移。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次范围集中在 `Prefer Off` 一个条件，涉及前端 editor、后端 normalize/validation 和测试，文件虽多但行为链路紧密，拆给多个 agent 容易在 payload 语义上产生冲突。
- Suggested split: 不建议并行拆分；由一个实现者按前端、后端、测试顺序完成。
- Write boundaries: 主要写入 `pbs-portal/src/features/days-off/`、`pbs-server/src/services/days-off/`、相关测试与 QA 文档。
- Conflict risk: 中等；当前 worktree 已有未提交的 seed/migration/spec 改动，实施前需要再次确认 git status，避免混入无关文件。
- Execution gate: 用户确认本 spec 后，再进入实现；实现完成前不提交 git，除非用户明确授权。
