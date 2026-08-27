# Gantt PBS Period 全年智能生成设计

## 背景

`PBS -> Period` 页面已经可以手动维护 `pbs_period`。但 PBS 周期本身有固定业务节奏，如果每个月都手动填写 `Period Code`、开放时间、关闭时间、状态和最大 tier，既慢也容易出错。

根据 `Crew Planning PBS work flow Ver2.docx` 中的流程描述，下一月 bids 通常需要在当月 8 号之前开放，常见做法是使用前一个月的第一个 Friday；bid window 至少 7 天。如果期间 pairing 有变化，窗口可以再延长 2 天。第一阶段先做标准窗口的自动生成，延长窗口仍由管理员手动调整。

## 目标

在 Gantt 管理端 `PBS -> Period` 页面增加全年 PBS Period 智能生成能力。管理员选择年份后，系统一次性生成该年 12 个月的 PBS period 草稿，减少手动录入。

## 范围

- 在 `PBS -> Period` 页面增加 `Generate Year` 入口。
- 管理员选择年份、filiale、division、max tiers 后，系统生成 `Jan YYYY` 到 `Dec YYYY` 的 12 条 period 候选。
- 支持按 division 批量生成；第一版默认生成 `C`，也允许选择 `P` / `A`。
- 自动推算 `periodCode`、`bidOpenAt`、`bidCloseAt`、`status`、`maxTiers`。
- 保存前展示预览，管理员确认后写入 `pbs_period`。
- 已存在的 `(period_code, filiale, division)` 不重复创建，预览中标记为 `Existing` 并跳过。
- 保留当前手动新增/编辑/删除能力。

## 非范围

- 不做后台定时任务自动创建。
- 不自动覆盖已存在 period。
- 不自动处理 pairing change 后的 2 天延期；管理员仍可在页面编辑 `Bid Close`。
- 不改 pbs-portal 当前 period 解析逻辑。
- 不改 live `roster_period` / `roster_period_config` 生成逻辑。

## 生成规则

对目标年份 `Y` 的每个月 `M`：

- `periodCode`：英文短月 + 年份，例如 `Jun 2026`。
- `bidOpenAt`：目标月份前一个月的第一个 Friday，时间默认 `00:00`。
- `bidCloseAt`：`bidOpenAt + 7 days`，时间默认 `23:59` 或沿用页面确认的默认关闭时间。
- `awardRunAt`：默认空。
- `awardPublishAt`：默认空。
- `maxTiers`：默认 `7`，允许管理员在生成前调整。
- `status`：默认 `DRAFT`。
- `filiale`：默认 `F8`。
- `division`：默认 `C`。
- `description`：可自动写入 `Generated for YYYY PBS year`，也可以为空；推荐为空，避免不必要数据噪音。

示例：生成 `Jun 2026`

- `periodCode = Jun 2026`
- `bidOpenAt = 2026-05-01 00:00`，因为 2026 年 5 月第一个 Friday 是 5 月 1 日
- `bidCloseAt = 2026-05-08 23:59`
- `status = DRAFT`

## UI 行为

`PBS -> Period` 顶部工具栏增加：

- `Generate Year` 按钮。

点击后打开 `AppDialog`：

- `Year`：数字输入，例如 `2026`。
- `Filiale`：默认 `F8`。
- `Division`：默认 `C`，可选 `P` / `C` / `A`。
- `Max Tiers`：默认 `7`。
- `Bid Open Time`：默认 `00:00`。
- `Bid Close Time`：默认 `23:59`。
- `Generate Preview`：生成 12 条预览。
- `Save New Periods`：只保存预览中不存在的 period。

预览表显示：

- Period Code
- Division
- Bid Open
- Bid Close
- Max Tiers
- Status
- Result：`New` / `Existing`

保存后：

- 页面刷新列表。
- Toast 显示 `Created N PBS periods, skipped M existing periods`。
- 如果全部已存在，显示 `No new PBS periods were created`。

## API 设计

沿用当前 live-server `period-admin` 路由，新增一个批量生成预览/创建接口：

- `POST /api/pbs/period-admin/generate-year/preview`
- `POST /api/pbs/period-admin/generate-year`

请求字段：

```json
{
  "year": 2026,
  "filiale": "F8",
  "division": "C",
  "maxTiers": 7,
  "bidOpenTime": "00:00",
  "bidCloseTime": "23:59"
}
```

`preview` 返回 12 条候选和是否已存在；不写库。

`generate-year` 只插入不存在的 period。插入需要保持幂等；即使并发请求，也不能因为唯一索引冲突导致整批失败。推荐使用 `insert ... on conflict (period_code, filiale, division) do nothing returning ...` 或逐条事务插入并收集结果。

## 数据一致性

- `pbs_period` 现有唯一索引 `uq_pbs_period_code(period_code, filiale, division)` 是去重依据。
- 所有生成写入默认 `created_by` / `updated_by` 使用当前登录用户。
- 日期写入使用 ISO / timestamptz，前端显示用本地时间。
- 若后续需要按航司时区生成时间，应单独扩展参数；本阶段不引入复杂时区配置。

## 错误处理

- 年份必须在合理范围内，例如 `2020-2100`。
- `filiale` 必填，最长 6。
- `division` 必须为 `P` / `C` / `A`。
- `maxTiers` 必须为 `1-99`。
- 时间格式必须为 `HH:mm`。
- 生成失败时返回明确错误，不部分静默失败。

## 测试与验证

后端 Vitest：

- 生成 12 个月 preview。
- 正确计算前一个月第一个 Friday。
- 已存在 period 标记为 `Existing`。
- `generate-year` 跳过已存在 period，只创建缺失项。
- 非 admin 请求返回 403。

Gantt Playwright：

- 登录 Gantt。
- 进入 `PBS -> Period`。
- 点击 `Generate Year`。
- 输入测试年份和测试 filiale 或唯一 period 前缀可控参数。
- 生成 preview。
- 保存新 periods。
- 验证列表出现新 period。
- 再次生成同一年，验证已存在被跳过，不重复创建。
- 清理测试数据。

验证命令：

- `cd live-server && ./node_modules/.bin/vitest run src/__tests__/unit/pbs-period-admin-route.test.ts`
- `cd live-server && npm run build`
- `cd gantt && npx tsc -b`
- `cd gantt && npm run build`
- `npm run check:ui`
- `cd e2e && GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=http://localhost:3700 PBS_PORTAL_BASE_URL=http://localhost:3030/pbs npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pbs-period.spec.ts --reporter=list`

## 验收标准

- 管理员可以一键生成全年 12 个 PBS periods。
- 生成规则符合“目标月份前一个月第一个 Friday 开放，7 天窗口”。
- 已存在 period 不重复创建。
- 保存前有可检查的 preview。
- 生成后的 period 可在列表中查询、继续手动编辑。
- 手动新增/编辑/删除原有功能不回退。
- 自动化测试覆盖 preview、写入、幂等和真实 UI 点击。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一个页面和同一个 live-server route，拆分会增加前后端契约对齐成本。
- Suggested split: 不拆分。
- Write boundaries: `gantt/src/components/pbs/pbs-period-view.tsx`、`gantt/src/services/pbs-period-admin-api.ts`、`live-server/src/routes/pbs/period-admin.ts`、对应测试。
- Conflict risk: 中等，主要风险是日期规则和幂等写入。
- Execution gate: 用户确认本 spec 后再实现。
