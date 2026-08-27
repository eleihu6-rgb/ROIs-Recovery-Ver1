# Live 发布生成排班快照与成功记录实施计划

> 已废弃：本计划中的文件生成与环境变量步骤不再实施，后续以
> `2026-08-06-live-roster-publish-record-only-design.md` 为准。

对应设计：`docs/superpowers/specs/2026-08-06-live-roster-publish-snapshot-record-design.md`

## 目标

让 Live `Publish Roster` 在同一发布链路中生成 `.schedule.gz` 并写入可信的
`schedule_publish_record.published = 1`，同时禁止同一 Crew 的部分差异发布。

## 实施步骤

### 1. 先锁定测试失败场景

- 扩展 `roster-publish-service.test.ts`：
  - 同一 Crew 未选全 actionable keys 时整批回滚；
  - 成功发布写入完整成功记录；
  - 无 actionable 不生成快照；
  - 快照/记录失败回滚；
  - COMMIT ACK 丢失后按完整指纹核实。
- 新增快照文件单元测试：gzip 可解压、格式版本固定、checksum/size 正确、目标不可覆盖。
- 新增 Scenario Schedule Publish 路由 contract 测试，拒绝外部创建 `published = 1`。
- 扩展 Gantt Playwright：部分 Crew 发布显示产品化错误；全选后成功。

### 2. 增加快照配置与文件写入器

- 在 `live-server/src/config/env.ts` 增加 `SCHEDULE_SNAPSHOT_DIR`：生产类环境必填，开发环境有明确默认值。
- 更新 `live-server/.env.example`。
- 新增 `roster-publish-snapshot-service.ts`：
  - exclusive temp file；
  - gzip 流式写入版本 1 JSON；
  - 原子 rename，不覆盖历史文件；
  - 返回相对 key、file size、SHA-256；
  - 提供确认未提交后的安全清理。

### 3. 扩展发布事务

- 为 diff SQL 增加内部批量 Crew 过滤，不改变现有外部筛选契约。
- 在任何写操作前批量校验候选 Crew 的 keys 是否完整。
- 查询候选 Crew 的有效 division、Roster Start prime base、Period fleet；缺失或冲突时拒绝发布。
- 保持现有 source/publish row lock、adjust snapshot、delete/insert 顺序。
- 使用数据库 cursor 分批读取发布后的 Period `roster_publish`，写一个批次快照。
- 为每个完整发布 Crew 插入一条共享文件元数据的 `schedule_publish_record`。
- COMMIT 抛错时用新连接核对 batch、Crew 集合、文件指纹和 adjust 记录，再决定成功、失败或待确认。

### 4. 封堵通用成功记录入口

- 为 `POST /api/scenario/schedule-publish` 增加 Zod contract。
- 使用 `request.authUser`，不再信任 body username。
- 对 `published = 1` 返回 403；真实成功记录只允许 Publish Roster 内部写入。

### 5. 验证

按从小到大执行：

1. 快照 writer 单元测试。
2. roster publish service 聚焦测试。
3. Scenario Schedule Publish 路由测试。
4. `live-server` TypeScript build。
5. Gantt Publish Roster Playwright spec。
6. `npm run check:ui`（若未改 UI 样式仍作为前端门禁确认）。
7. GitNexus `detect_changes --compare main`，确认影响只在预期发布链。

## 文件边界

- `live-server/src/config/env.ts`
- `live-server/.env.example`
- `live-server/src/services/roster/roster-publish-service.ts`
- 新增 `live-server/src/services/roster/roster-publish-snapshot-service.ts`
- `live-server/src/routes/scenario/scenario.ts`
- 对应 Live 单元/集成测试
- `e2e/tests/gantt/roster-publish-dialog.spec.ts`
- `docs/test-cases/pbs/...` 发布门禁用例

不修改 PBS Award resolver、Portal、算法、数据库 schema 或 migration。
