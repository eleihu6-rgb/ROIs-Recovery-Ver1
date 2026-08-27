# PBS Period 全局共享并移除部门维度实施计划

## 目标

按已批准设计移除 PBS Period 的 `division` 契约，使 Portal 的 Current Period 对所有部门全局一致，同时保留
用户部门在 Pairing、Reserve、Dashboard 等业务中的用途。

## 实施顺序

1. **管理端契约与 UI**
   - 更新 Gantt Period 类型、请求和页面。
   - 更新 Live Server Period Admin schema、SQL mapper 和测试。
   - 验证：Live Server focused Vitest、Gantt TypeScript、Period Playwright。

2. **Portal Current Period 事实源**
   - 更新共享 `PbsCurrentPeriod` contract。
   - 从 PBS Server Current Period CTE/context/mapper 删除部门拼接。
   - 保留 Current Bid 的 `crewId` 查询隔离。
   - 验证：current-period focused tests 和 PBS Server TypeScript。

3. **全局 Current Period 缓存**
   - 所有 Period cache key 改为 `period/current/v2/global`。
   - 进程内 fallback cache 不再按 crew 区分。
   - 更新缓存测试，确认 key 不含 crew ID。

4. **回归与交付**
   - 更新受影响 fixture/mock 和 QA 人工测试文档。
   - 运行相关 Vitest、Playwright、build、`npm run check:ui` 和 `git diff --check`。
   - 核对工作树，确保不包含现有 Pairing Search 改动。

## 约束

- 不修改数据库 schema，不执行 migration。
- 不删除 `pbs_user.division`。
- 不修改 Pairing/Reserve 等部门数据范围。
- `Filiale` 保留。
- 旧 Period Admin 请求携带 `division` 时返回 `400`。
- 未经用户再次授权不创建 Git commit。
