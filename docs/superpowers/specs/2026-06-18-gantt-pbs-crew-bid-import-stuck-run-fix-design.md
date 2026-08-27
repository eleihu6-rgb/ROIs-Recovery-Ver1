# Gantt PBS Crew Bid Import 卡住状态修复设计

## 背景

当前 `POST /api/admin/crew-bid-imports` 已改为异步启动导入，避免前端 120 秒超时。但实测出现一个问题：

- 页面创建了 run：`queued`
- 后台导入过程中如果 live-server watch 重启、进程中断、Redis 启动失败导致服务异常，run 没有被更新为 `failed`
- 由于真实导入事务未提交，`Items`、`Problems`、`Backup`、`pbs_bid` 都是 0
- 用户看到页面长期停在 `queued`，无法判断是否成功、失败、还在跑

这次修复的重点不是优化导入速度，而是修复状态机和可见性，避免“静默卡住”。

## 目标

1. `Import` 启动后，run 能尽快从 `queued` 变为 `running`，前端能看到后台已开始。
2. 后台导入异常时，run 必须落成 `failed`，并写入一条问题记录，页面能看到失败原因。
3. 如果进程中断导致没有机会写 `failed`，列表/详情读取时要识别 stale run，避免无限显示 `queued/running`。
4. 前端继续轮询 run 详情，并清楚显示 `queued`、`running`、`failed`、最终完成状态。
5. 不新增数据库 migration，优先复用现有字段：`status`、`updated_at`、summary 字段、problem 表。

## 范围

### 后端

- `startImport` 创建 run 后，后台任务开始前用独立短事务把状态更新为 `running`，不要放在大导入事务内部。
- 后台任务 catch 到异常时，用独立短事务更新：
  - run `status = failed`
  - `completed_at = now()`
  - summary 保留已知初始统计
  - 插入 `pbs_crew_bid_import_problem`，`problem_code = import_run_failed`
- `getRun` / `listRuns` 对长时间未更新的 `queued/running` run 做 stale 判断：
  - 推荐阈值：30 分钟
  - stale run 在响应中显示为 `failed`
  - 如可安全写库，则顺手把数据库 run 也标成 `failed`
- rollback 继续禁止对 `queued/running` 执行。

### 前端

- `queued/running` 保持蓝色状态。
- 轮询中如果看到 `failed`，停止轮询并显示失败消息。
- 对 stale/failed run 禁止继续等待，用户可以通过 Problems 看失败原因。
- 不在本次做逐 crew 进度条；这需要更细的 per-crew 事务/进度写入，作为后续优化。

## 关键假设

- 当前 run 表 `completed_at` 可空，不需要 schema 变更。
- 本次只修复“卡住”和“失败不可见”，不保证一次导入一定能在现有实现下很快完成。
- 如果 live-server 进程被强制杀掉，内存后台任务无法继续；stale 检测负责把这种 run 告诉用户“已经不再运行”。

## 验收标准

1. 点击 Import 后，run 不会长期只停留在 `queued`。
2. 后台异常时，run 详情返回 `failed`，Problems 至少有一条 `import_run_failed`。
3. 老的卡住 run 超过 stale 阈值后，再次刷新列表/详情会显示失败，而不是继续假装等待。
4. 前端对 `failed` run 停止轮询，按钮状态正确。
5. `cd gantt && npx tsc --noEmit` 通过。
6. `cd live-server && npx vitest run src/services/crew-bid-import/__tests__` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复集中在同一个 service 状态机和一个前端页面，拆分会增加冲突。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/services/crew-bid-import/crew-bid-import-service.ts`、`gantt/src/components/pbs/pbs-admin-tools.tsx`、共享类型如有需要。
- Conflict risk: 中等；主要风险是正在运行的开发服务 watch 重启会中断内存后台任务。
- Execution gate: 用户确认本 spec 后开始实现。
