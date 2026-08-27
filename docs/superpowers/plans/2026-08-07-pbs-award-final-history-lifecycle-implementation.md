# PBS Award Final 生命周期与历史查看实施计划

## 目标

在不修改算法、不保存同一 Period 多次发布版本的前提下，完成以下能力：

- Live PBS Period 配置增加 `Final At` 与 `Mis-award Deadline`。
- PBS Server 根据配置时间和人员级成功发布记录计算 Award 生命周期。
- Award 默认展示最新可读的已发布结果；新 Period 尚未发布时继续展示上一期。
- Crew 可按 Period 查看自己历史上已经成功发布的 Award。
- 新 Period 成功发布后立即成为默认 Award；到达 `Final At` 只改变状态，不切换数据。

## 实施顺序

### 1. 数据库字段

- 新增 migration，为 `live.roster_period` 增加：
  - `pbs_award_final_at timestamp without time zone`
  - `pbs_mis_award_deadline_at timestamp without time zone`
- 字段沿用现有 Period wall-time 语义，不转换为统一时区瞬时值。
- 本轮只提交 migration 文件，不自动执行开发、SIT、UAT 数据库。

### 2. Live Period Admin 与 Gantt 管理页

- 扩展 `live-server/src/routes/pbs/period-admin.ts` 的查询、创建、修改和年度生成。
- 完整校验：`Bid Open < Bid Close <= Award Publish <= Final At < Mis-award Deadline`。
- 年度生成默认值：`Final At = Award Publish + 2 天`，`Mis-award Deadline = Final At + 4 天`。
- 扩展 Gantt Period API 类型、Add/Edit 表单、年度预览和列表列。
- 更新 focused backend tests 与真实 UI Playwright 覆盖。

### 3. PBS Award 生命周期与历史接口

- 扩展共享 contracts：生命周期、时间字段、历史 Period 摘要和路由。
- Award resolver 一次解析：
  - 最新可读已发布 Period；
  - 更新但尚不可读的候选 Period；
  - 当前生命周期状态。
- 新增：
  - `GET /api/award/periods`
  - `GET /api/award/periods/:rosterPeriodId`
- 历史详情必须按 `rosterPeriodId + crewId` 校验人员级成功发布事实。
- `pbs_award_result` 改按 `roster_period_id + crew_id` 读取；`roster_publish` 继续按权威 Period 日期范围读取并裁剪。
- 404 表示 Period 不存在；409 表示存在但该人员没有可读发布结果。

### 4. PBS Portal Award 页面

- 页头增加历史 Period 选择器，只列当前人员可读的已发布 Period。
- 默认选中最新可读 Period；切换后按稳定 `rosterPeriodId` 加载详情。
- 切换过程中清空旧详情并显示 Award 骨架屏，避免旧数据误导。
- 展示 `Published / Final / Mis-award Closed` 状态与关键时间。
- 有更新但未发布 Period 时显示非阻塞提示，同时继续展示上一期结果。
- 本阶段不增加 mis-award 提交按钮或表单。

### 5. 验证

- Live Server：Period payload、完整时间顺序、年度生成、更新合并校验。
- PBS Server：跨 Period fallback、发布切换、Final/Deadline 状态、人员隔离、历史详情错误语义、`roster_period_id` 查询。
- PBS Portal：默认历史选择、切换骨架、状态展示、未发布提示、不展示不可读 Period。
- 执行受影响模块的 typecheck/build/lint、根目录 `npm run check:ui`。
- Playwright 驱动真实 Period 管理页和 Award 页面完成核心流程。

## 改动边界

- 不修改 `pbs-engine`、算法输入或算法输出。
- 不修改 Live/Scenario Gantt 排班画布与共享 pane。
- 不执行环境 migration，不回填历史时间，不提交 Git，除非用户后续明确授权。
- 不引入新依赖，不增加同一 Period 发布批次历史模型。

## Multi-Agent Parallelism Assessment

- Recommendation: No（当前实施阶段）
- Rationale: contracts、resolver、service、Portal 消费关系紧密，顺序实现更容易保持契约一致。
- Suggested split: 不拆分；按数据库 → Live → PBS Server → Portal → 验证顺序推进。
- Write boundaries: 单一执行者负责全部业务代码，避免共享 contracts 冲突。
- Conflict risk: 多 Agent 同时修改 contracts 与 Award tests 会产生较高冲突风险。
- Execution gate: 需求 spec 已由用户确认，允许实施；Git 提交和 migration 执行仍需另行授权。
