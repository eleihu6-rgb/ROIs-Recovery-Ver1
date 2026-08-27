# PBS Review Fix Batch Design

## 背景

本次修复来自 PBS Server 与 PBS Portal 的代码 review，目标是把已确认的提交阻断问题、契约不一致、重复迁移和局部模块化问题一次性收敛。范围限定在 `pbs-server`、`pbs-portal`、`packages/contracts` 与 PBS 相关 migration，不处理 live-server / gantt 侧问题。

## 修复目标

1. 修复 Reserve Short Call Type 日期范围/日期集合无法通过 service mapper 提交的问题。
2. 修复 Pairing Search Preview route schema 与前端/contract 支持的 bid 类型不一致的问题。
3. 删除重复 migration 文件，清理已跟踪的 TypeScript 构建缓存。
4. 统一 Reserve 日期范围校验，避免前端允许 `to < from` 后再由后端报错。
5. 抽取 Reserve Date Scope 共享控件，避免新增弹窗和编辑弹窗行为分叉。
6. 将 Pairing property payload 校验从 route 层下沉到 service validation 模块。
7. 拆分 Pairing Search condition builder，降低单文件/单函数维护风险。

## 设计方案

### Reserve

- 在 `reserve-service.ts` 的 mutation bid mapper 中支持 `reserve-call-type-date-scope`。
- 新增 feature-local 的 date scope helper / control，供 `ReserveBidDialog` 与 `ReserveShortCallTypeDialog` 共用。
- 前端完整性校验包含日期格式和 `date_range.to >= date_range.from`。
- 保持现有 API contract 和后端序列化方式不变。

### Pairing Search Preview

- 为 Pairing Search route 补齐实际会从前端传入的 bid schema：`duration`、`duration-range`、`time-condition-list`、`pairing-occurrence-list` 等。
- 优先复用现有 route schema 片段，避免 contract 与 route 再次漂移。
- 保持 preview service 的入参和响应契约不变。

### Pairing Validation 与 SQL Builder

- 新增 `services/pairing/pairing-property-validation.ts`，承载原 `pairing-bids.ts` 中 property-code 级业务校验。
- route 层只负责 schema parse、调用 validation、调用 service、统一返回。
- 将 `pairing-search-condition-builder.ts` 中的核心 `switch` 拆成 focused builder 文件，主入口只做分发、组合和公共 rule join 逻辑。

### 工程清理

- 删除 `sql/migration/2026-05-29-pbs-user-add-base-rank 2.sql`。
- 从 Git 索引移除 `pbs-portal/tsconfig.tsbuildinfo`，依赖根 `.gitignore` 的现有规则阻止后续重复提交。

## 验收标准

- Reserve Short Call Type 的新增、编辑、日期范围、specific dates 都能经过真实 service mapper 生成合法 payload。
- Pairing Search Preview 不再因为 route schema 缺类型而拒绝当前已支持的 Pairing bid。
- 重复 migration 文件不存在，`pbs-portal/tsconfig.tsbuildinfo` 不再被 Git 跟踪。
- Pairing route 更薄，业务校验落在 service validation 模块。
- Pairing Search condition builder 拆分后现有测试通过。
- 相关 PBS Server / Portal 测试通过；若全量构建受既有问题阻塞，需要明确记录阻塞点。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次变更跨 contract、route、service、前端 mapper 与测试，接口契约需要单线保持一致。
- Suggested split: 暂不拆分；后续若继续优化 SQL 性能，可单独开任务。
- Write boundaries: `pbs-server`、`pbs-portal`、`packages/contracts`、`sql/migration`、`docs/superpowers/specs`。
- Conflict risk: 中等，多个模块共享 bid value union 与 route schema。
- Execution gate: 用户已确认执行三批问题处理。
