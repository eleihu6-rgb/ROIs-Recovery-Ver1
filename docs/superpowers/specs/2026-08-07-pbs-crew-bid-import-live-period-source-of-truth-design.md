# PBS Crew Bid Import 使用 Live Period 设计

## 目标

Crew Bid Import 不再根据 `periodCode`（例如 `Jun 2026`）推算自然月，而是以管理员在 `live.roster_period` 中配置的周期身份和 `rp_start` / `rp_end` 为唯一依据。

## 当前问题

- Gantt 上传请求只提交 `periodCode`。
- `live-server` 根据 `periodCode` 解析年份和月份，并构造自然月范围。
- 非自然月 Roster Period 会导致日期映射、Pairing 匹配范围错误。
- Import 创建 Current Bid 时只写 `period_code`，没有写已有字段 `pbs_bid.roster_period_id`；查重和覆盖也仍按标签定位。
- Import run 只保存 `period_code`，断点续跑/去重也按标签匹配，尚未保存稳定 Period 身份。
- 当前生产使用的算法 `.tgz` 导出已经通过 `rosterPeriodId` 读取 `live.roster_period.rp_start/rp_end`，不在本次修改范围内。

## 方案选择

### 采用：稳定 ID 贯穿请求，后端解析权威 Period

1. Gantt 的 Import Period 下拉仍显示 `periodCode`，但选中值绑定 `rosterPeriodId`。
2. Dry Run 和正式 Import 的 multipart 请求增加必填 `rosterPeriodId`；`periodCode` 不再作为日期范围的权威输入。
3. `live-server` 使用 `rosterPeriodId` 查询 `live.roster_period`，一次性得到：
   - `pbs_period_code`
   - `rp_start`
   - `rp_end`
4. 日期映射、Pairing occurrence 查询、机场选项查询都使用该真实范围。
5. Current Bid 的查重、覆盖和写入统一使用 `rosterPeriodId`：
   - 查找已有 Current Bid 时按 `crew_id + roster_period_id + bid_context` 定位，不再按标签定位。
   - `pbs_bid.roster_period_id = 选中的 rosterPeriodId`
   - `pbs_bid.period_code = live.roster_period.pbs_period_code`
6. Standing Bid 继续保持 `roster_period_id = NULL`、`period_code = 'STANDING'`。
7. Import run 新增并保存 `roster_period_id`；断点续跑、来源文件去重和目标 Period 筛选统一按该 ID，`period_code` 仅保留为可读快照。
8. 上传文件解析出的 `periodCode` 只用于辅助选择：必须唯一匹配已加载的 Live Period 才能自动绑定其 ID；找不到或出现歧义时禁止自动选择，并要求管理员明确选择。

### 不采用

- **仅凭 `periodCode` 查询 Period**：标签不是稳定身份，改名或重复时存在歧义。
- **由前端提交 `rpStart/rpEnd`**：会让前端成为第二数据源，可能与 Live 配置不一致。
- **找不到 Period 时回退自然月**：会隐藏配置错误，无法保证 Live Period 是唯一来源。

## 数据流

`Gantt 选择 rosterPeriodId` → `Import API` → `live.roster_period` → `PeriodContext` → 日期映射/Pairing 查询 → 写入 `pbs_bid.roster_period_id`

`periodCode` 只用于界面显示、确认提示、运行记录和文件命名，不参与日期推算。

## 错误处理

- 缺少或非法 `rosterPeriodId`：返回 400。
- Period 不存在：返回 404。
- `pbs_period_code`、`rp_start` 或 `rp_end` 缺失/非法：返回 409，并阻止 Dry Run/Import。
- 不做自然月 fallback，不把原始异常或 SQL 信息展示给用户。

## 兼容与迁移

- 不修改算法 CSV/TGZ 格式。
- 不修改 `live.roster_period` 或 `pbs_bid` 表结构；`pbs_bid.roster_period_id` 已存在。
- 新增一条幂等 migration：为 `pbs_crew_bid_import_run` 增加 `roster_period_id`，按唯一的 `live.roster_period.pbs_period_code` 回填历史记录，回填失败则明确中止；完成后设为 `NOT NULL` 并增加按 Period ID 查询的索引。
- 前后端合同同步升级；旧的仅提交 `periodCode` 请求将明确失败，项目尚未上线，不保留错误兼容路径。
- Import run 展示仍使用 `period_code`，查询和续跑使用 `roster_period_id`。

## 验收标准

1. 选择一个跨自然月 Period 时，Dry Run 和 Import 使用配置的 `rp_start/rp_end`，不使用月份首末日。
2. Current Bid 写入正确的 `roster_period_id` 和对应 `period_code`。
3. Standing Bid 行为保持不变。
4. 构造“标签推算范围”和 Live 配置范围冲突的回归测试，必须以 Live 配置为准。
5. Current Bid 覆盖、Import resume/去重、run 查询和 rollback 均不跨 `rosterPeriodId` 串数据。
6. 文件标签找不到对应 Live Period 时不自动绑定，也不能提交无 ID 的请求。
7. 无效或不完整 Period 明确报错，且不产生部分写入。
8. Gantt 真实 UI Playwright 覆盖 Period 选择、文件标签自动匹配、Dry Run 和 Import 请求。
9. `live-server` 聚焦测试、Gantt build、`npm run check:ui` 和相关 Playwright 全部通过。

## 预计修改范围

- `packages/contracts/pbs-crew-bid-imports.*`
- `gantt/src/services/pbs-admin-tools-api.ts`
- `gantt/src/components/pbs/pbs-admin-tools.tsx`
- `live-server/src/routes/admin/pbs-crew-bid-imports.ts`
- `live-server/src/services/crew-bid-import/crew-bid-import-service.ts`
- `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `sql/migration/` 下新增 Import run Period ID migration
- 对应 Vitest、API 测试和 Playwright 测试

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 前端合同、后端解析和导入事务紧密依赖，同一数据契约需要顺序修改与验证；并行写入的协调成本高于收益。
- Suggested split: 主代理完成合同、后端、前端和测试；完成后独立审阅 spec/改动。
- Write boundaries: 不并行编辑上述文件。
- Conflict risk: 中等，合同与服务类型会同时影响多处测试。
- Execution gate: 本 spec 经用户确认后再实施。
