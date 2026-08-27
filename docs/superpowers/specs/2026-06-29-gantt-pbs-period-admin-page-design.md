# Gantt PBS Period 管理页修正设计

## 背景

当前 Gantt 顶部 `PBS` tab 下的左侧菜单已有 `Period` 入口，但 `gantt/src/components/pbs/pbs-view.tsx` 只渲染了 `PBS Period` 标题和空白内容。上一轮把 `Roster Period Config` 暴露到了 `Data -> Basic -> Roster Period`，这与实际入口不符。

数据模型上需要区分两类周期：

- `pbs_period`：PBS 申请周期配置，控制 PBS 投标周期、开放/截止时间、最大 tier、状态等。
- `roster_period` / `roster_period_config`：live 侧排班周期定义和自动生成规则，不是 `PBS -> Period` 这个入口的主数据。

## 目标

在 Gantt 管理端实现 `PBS -> Period` 页面，管理 `pbs_period` 表，让这个入口不再是空白页。

## 范围

- Gantt 前端新增 `PbsPeriodView`，挂到 `PBS -> Period`。
- live-server 新增 PBS period admin API，读写 `env.PBS_SCHEMA.pbs_period`。
- 页面支持列表、筛选、新增、编辑、必要时删除。
- 调整上一轮错误入口：`Data -> Basic -> Roster Period` 只保留 live 侧 `roster_period`；不再把 `roster_period_config` 当作 PBS Period 的主要配置入口展示。
- 增加 Playwright 回归测试，真实点击 `PBS -> Period`。

## 非范围

- 不改 pbs-portal 用户端。
- 不改 PBS 导入、算法导出、投标写入语义。
- 不迁移旧数据。
- 不新增复杂周期自动生成器；本阶段只做 `pbs_period` 的管理入口。

## 页面字段

`PBS -> Period` 页面展示和编辑以下字段：

- `periodCode`
- `rosterPeriodId`
- `filiale`
- `division`
- `bidOpenAt`
- `bidCloseAt`
- `awardRunAt`
- `awardPublishAt`
- `maxTiers`
- `status`
- `description`

推荐筛选项：

- Period Code
- Division
- Status

## API 设计

新增 live-server PBS admin API，避免与现有 `GET /api/pbs/periods` 混淆：

- `GET /api/pbs/period-admin`
- `POST /api/pbs/period-admin`
- `PATCH /api/pbs/period-admin/:id`
- `DELETE /api/pbs/period-admin/:id`

删除需要做保护：如果该 `pbs_period.id` 已被 `pbs_bid.pbs_period_id` 或 `pbs_award_result.pbs_period_id` 引用，返回 `409`，不物理删除。

## UI 行为

- `PBS -> Period` 不再显示空白内容。
- 页面采用现有 Gantt 管理端高密度表格风格。
- 新增/编辑用 `@rois/ui` 的 `AppDialog`。
- 表格内 status 用 badge 显示。
- 日期字段使用英文 UI 文案，格式保持项目现有 datetime 输入/显示习惯。

## 测试与验证

自动化测试：

- live-server Vitest：覆盖 list/create/update/delete pre-check。
- Gantt Playwright：从 `/altair/pbs` 点击 `Period`，验证表格加载；新增一条测试 period；编辑字段；删除清理；确认页面不再空白。
- 调整旧 `Data Tab — Roster Period` 测试，不再断言 `roster_period_config` section 存在。

验证命令：

- `cd live-server && ./node_modules/.bin/vitest run <new test>`
- `cd live-server && npm run build`
- `cd gantt && npm run build`
- `cd gantt && npx tsc -b`
- `cd gantt && npm run check:ui`
- `cd e2e && GANTT_BASE_URL=http://localhost:5566 GANTT_API_URL=http://localhost:3700 npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/pbs-period.spec.ts --reporter=list`

## 验收标准

- `PBS -> Period` 页面有真实内容，不再是空白占位。
- 页面数据来自 `pbs_period`，不是 `roster_period_config`。
- 用户可以新增、编辑、删除未被引用的 PBS period。
- 被 bid 或 award 引用的 PBS period 删除时返回明确 `409`。
- 旧 Data tab 不再误导用户把 `Roster Period Config` 当成 PBS Period 管理入口。
- UI 文案为英文。
- 相关自动化测试和 UI 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 Gantt 页面、一组 live-server API 和对应测试；拆分会增加接口对齐成本。
- Suggested split: 不拆分。
- Write boundaries: `gantt/src/components/pbs`、`gantt/src/services`、`live-server/src/routes/pbs`、相关测试文件。
- Conflict risk: 中等，主要风险是混淆 `pbs_period` 与 `roster_period_config`。
- Execution gate: 用户确认本 spec 后再进入实现。
