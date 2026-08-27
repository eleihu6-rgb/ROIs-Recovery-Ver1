# Gantt PBS Period 时间展示修正设计

## 背景

`PBS -> Period -> Generate Year` 已经可以按年份生成 12 个 PBS Period，并按“目标月份前一个月第一个 Friday 开放、7 天窗口”计算 `bidOpenAt` / `bidCloseAt`。

当前剩余问题是时间展示语义不一致：管理员在 `Generate PBS Year` 弹窗中填写 `Bid Open Time = 00:00`、`Bid Close Time = 23:59`，预览表却显示为 `08:00:00` / `07:59:00`。这是因为后端生成的是 `timestamptz` ISO 时间，前端使用浏览器本地时区格式化，导致中国时区浏览器把 `2025-12-05T00:00:00.000Z` 显示成 `2025/12/5 08:00:00`。

经过讨论，第一阶段先不做 base timezone 转换。系统要把 PBS Period 时间当作管理员配置的业务 wall time 展示：管理员填什么时间，管理端预览、保存后列表以及后续 Portal 都应该看到同样的时间。

## 目标

- 管理员填写 `00:00`，预览中显示 `00:00:00`。
- 管理员填写 `23:59`，预览中显示 `23:59:00`。
- 保存后的 `PBS -> Period` 列表显示与预览一致。
- 编辑弹窗打开已有 Period 时，datetime 输入框不因为浏览器时区偏移。
- 不改变全年生成的日期规则。
- 不引入 base timezone、airport timezone 或 per-base period 维度。

## 非范围

- 不修改 `pbs_period` 表结构。
- 不新增 `base` 字段。
- 不修改唯一键 `period_code + filiale + division`。
- 不做 YYZ / YVR / YEG 等 base 本地时区转换。
- 不改变 pbs-portal 当前 period 选择逻辑。
- 不处理真正的跨时区“同一 base 本地 00:00”业务精确语义；该能力以后需要单独设计。

## 当前问题定位

相关代码在 `gantt/src/components/pbs/pbs-period-view.tsx`：

- `formatDateTime(value)`：当前使用 `new Date(value)` 后再取本地年月日时分秒，导致展示随浏览器时区变化。
- `toDateTimeLocal(value)`：用于把接口时间填入 `datetime-local` 输入框，当前同样按浏览器本地时区取值。
- `fromDateTimeLocal(value)`：用于把 `datetime-local` 输入转成 ISO，当前会把浏览器本地时间转换成 UTC ISO。

后端全年生成在 `live-server/src/routes/pbs/period-admin.ts` 中使用 UTC 日期构造：

- `firstFridayOfPreviousMonth(...)`
- `buildYearCandidates(...)`

这一部分在第一阶段可以保留，因为我们要的不是“真实时区瞬间正确”，而是“按配置时间稳定展示”。

## 方案

第一阶段采用“UTC wall time 展示”策略：

- 前端显示 PBS Period 时间时，使用 UTC 字段读取年月日时分秒。
- 前端编辑 PBS Period 时间时，`datetime-local` 的值也从 UTC 字段生成。
- 前端保存手动编辑时间时，把输入值当作 UTC wall time 拼成 ISO。

示例：

```text
接口值：2025-12-05T00:00:00.000Z
页面显示：2025/12/5 00:00:00
编辑输入：2025-12-05T00:00
```

而不是根据浏览器时区显示为：

```text
2025/12/5 08:00:00
```

## 影响范围

主要修改：

- `gantt/src/components/pbs/pbs-period-view.tsx`
  - 调整 PBS Period 专用时间格式化函数。
  - 调整 `datetime-local` 读写函数。
  - 保持 UI 文案和布局不变。

可能需要同步测试：

- `e2e/tests/gantt/pbs-period.spec.ts`
  - Preview 断言应检查 `00:00:00` / `23:59:00`。
  - 列表保存后显示应与 preview 一致。
- `live-server/src/__tests__/unit/pbs-period-admin-route.test.ts`
  - 若后端不改，仅保留现有生成规则断言即可。

版本：

- 这是 Gantt 前端行为修正，需要递增 `gantt/src/version.ts` 的 `FRONTEND_VERSION`。

## 风险与后续

这个方案刻意不解决真实时区业务问题。它的好处是符合当前管理员预期：配置什么就看到什么，且不需要迁移数据或改表。

后续如果要做到“不同 base 都按自己本地 00:00 开放”，需要单独设计：

- `pbs_period` 增加 `base` 维度，或引入 period 与 base 的映射表。
- 生成时根据 `airport.zone_id` 把 base 本地时间转换为真实 `timestamptz`。
- Portal 根据当前用户 base 读取对应 period。
- 唯一键需要扩展到 `period_code + filiale + division + base` 或等效约束。

## 验收标准

- 在中国时区浏览器中打开 `Generate PBS Year`，输入 `00:00` / `23:59`。
- 点击 `Generate Preview` 后，预览表显示 `00:00:00` / `23:59:00`，不再显示 `08:00:00` / `07:59:00`。
- 保存新 Period 后，列表中的 `Bid Open` / `Bid Close` 与预览一致。
- 打开编辑弹窗，datetime 输入框显示与列表一致。
- 已有新增、编辑、删除、全年生成、跳过已存在 period 的功能不回退。

## 验证计划

- `cd gantt && npx tsc -b`
- `cd gantt && npm run build`
- `npm run check:ui`
- `cd e2e && GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=http://localhost:3700 PBS_PORTAL_BASE_URL=http://localhost:3030/pbs npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pbs-period.spec.ts --reporter=list`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 Gantt 页面的小范围时间格式化逻辑和对应测试，拆分会增加沟通成本。
- Suggested split: 不拆分。
- Write boundaries: `gantt/src/components/pbs/pbs-period-view.tsx`、`e2e/tests/gantt/pbs-period.spec.ts`、必要时 `gantt/src/version.ts`。
- Conflict risk: 低；主要风险是误改其他页面通用时间格式化。
- Execution gate: 用户确认本设计后再实现。
