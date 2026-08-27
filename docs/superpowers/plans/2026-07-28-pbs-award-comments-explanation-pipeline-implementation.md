# PBS Award 已获 Pairing Comments 解释链路实施计划

## 1. 目标

按照已批准的
`docs/superpowers/specs/2026-07-28-pbs-award-comments-explanation-pipeline-design.md`
打通以下链路：

```text
PBS Engine → output.gz ASSIGNMENTS.comments
→ scenario.roster_flight.comments
→ live.roster_flight.comments
→ roster_publish.comments
→ PBS Award API
→ Portal Selected Duty
```

不新增数据库字段，不启用完整 Reason Report。

## 2. 当前阻塞

`pbs-engine` 是私有 SSH submodule。当前机器执行
`git submodule update --init -- pbs-engine` 返回 GitHub `Permission denied (publickey)`，
HTTPS 也无法访问该私有仓库。

因此：

- 主仓库内的 Contract、Loader、Publish、Award API 和 Portal 可以先实施并用固定
  `output.gz` fixture 验证。
- PBS Engine 真实生成逻辑必须在获得 submodule 读取权限后补齐。
- 在 Engine 步骤完成前，不得宣称真实 Solver 端到端链路全部完成。

## 3. 影响分析

GitNexus upstream impact：

- `buildRosterRows`：LOW，直接影响 `loadResultGzIntoDb`。
- `loadRosterRows`：LOW，直接影响 Award `getCurrentAward`。
- `buildPairingItem`：LOW，影响 Award grouping 和 response mapper。
- `rosterService.update`：LOW，影响 Roster/Draft 写入口。
- `AwardTripCard`：LOW，影响 Award Right Panel 和 Award Page。

没有 HIGH / CRITICAL 风险。

## 4. 实施步骤

### Task 1：建立共享受控 Comments Contract

修改：

- `packages/contracts/pbs-award-results.js`
- `packages/contracts/pbs-award-results.d.ts`
- 新增对应 Contract 测试。

内容：

- 定义 `PBS_AWARD_V1|` 保留前缀。
- 提供严格解析函数，只接受：
  `PBS_AWARD_V1|Matched your Tier <1..24> pairing preferences.`
- 提供 `isReservedPbsAwardComment`，用于人工 comments 写入口拒绝保留命名空间。
- `PbsAwardItem` 增加 `explanation: string | null`。

验证：

- 合法 Tier 1/24。
- 非法 Tier 0/25。
- 前后附加文本、控制字符、其他 Crew/solver 内容均拒绝。
- 普通人工 comments 返回 `null`。

### Task 2：补 Scenario Result Loader

修改：

- `live-server/src/services/scenario/scenario-result-loader.ts`
- `live-server/src/services/scenario/__tests__/scenario-result-loader.test.ts`
- 必要时新增纯函数单测 fixture。

内容：

- `RosterRow` 增加 `comments`。
- 从 `ASSIGNMENTS.comments` 读取受控值。
- 一个 Assignment 的 comments 写入该 Pairing 全部 Segment。
- 旧版无列/空值写 `null`。
- 非法或超长受控值写 `null`，不截断展示内容。
- 检测重复 `(crew_id, pairing_id)`，冲突时拒绝结果。
- 新 Result 重载不继承旧 comments。

验证：

- 同一 Pairing 两段写入相同值。
- 空值、非法值、超长值、重复 key。
- PA/lead-in 不被赋予 Solver Explanation。

### Task 3：保护人工 Comments 命名空间

修改：

- `live-server/src/services/roster/roster-service.ts`
- `live-server/src/services/roster/roster-service.test.ts`
- `live-server/src/services/roster/__tests__/roster-source-guard.test.ts`
- 必要的 Roster/Draft route validation tests。

内容：

- `rosterService.create/update/createGroundTask` 在写入人工 comments 前复用共享校验。
- 拒绝任何以 `PBS_AWARD_` 开头的人工值。
- 返回稳定、字段相关的 400 validation error。
- Solver Loader 不走人工写入口，不受此限制。
- IMP/外部同步数据即使含相似文字，也因 Published provenance 不是
  `CR + SCENARIO` 而不能在 Award 展示。

验证：

- 普通 comments 可继续保存。
- 保留前缀被拒绝。
- 现有 IMP immutability 行为不变。

### Task 4：验证 Scenario → Live → Publish 复制

修改：

- `live-server/src/__tests__/unit/scenario-publish-roster-route.test.ts`
- `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`

内容：

- 增加受控 comments 在 Scenario Publish SQL 中原样复制的断言。
- 增加 Live Publish SQL 把 comments 写入 `roster_publish` 的断言。
- 不修改现有数据库 Schema。

验证：

- 固定文本在三段保持逐字符一致。
- `request_source='SCENARIO'`、`request_id=scenario_id` 保持可追溯。

### Task 5：补 Award API Contract 和 Mapper

修改：

- `pbs-server/src/services/award/types.ts`
- `pbs-server/src/services/award/award-results-service.ts`
- `pbs-server/src/services/award/award-results-service.test.ts`
- `pbs-server/src/services/award/award-results-mapper.ts`
- `pbs-server/src/services/award/award-results-mapper.test.ts`
- `packages/contracts/pbs-award-results.d.ts`

内容：

- Roster 查询读取 `rp.comments`、`rp.source`、`rp.request_source`、`rp.request_id`。
- 只对 `source='CR' + request_source='SCENARIO' + request_id` 的行解析 Explanation。
- Pairing Segment 聚合真值表：
  - 全部相同合法值 → 返回正文。
  - 全空/普通 comments → `null`。
  - 部分空、不同受控值、普通/受控混合 → `null`。
- 不把内部冲突 warning 暴露给 Crew。
- 保持认证 Actor 和 period 过滤不变。

验证：

- 多 Segment 相同、部分空、冲突、普通 comments、伪造前缀、错误 provenance。
- 查询没有 Scenario/Live `roster_flight` Join。

### Task 6：Portal Selected Duty 展示

修改：

- `pbs-portal/src/features/award/components/award-trip-card.tsx`
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- `pbs-portal/src/features/award/award-mappers.ts`（如现有 mapper 需要显式透传）
- `e2e/tests/pbs-portal/award-comments-explanation.spec.ts`
- 新增 QA 文档：
  `docs/test-cases/pbs/award/2026-07-28-award-comments-explanation.md`

内容：

- Pairing `explanation` 非空时显示只读 `Award Explanation`。
- 空值不显示，不出现 `Missing`。
- 切换 Pairing 时不残留上一条解释。
- Reason Report 按钮保持当前行为。

验证：

- Award Page Vitest。
- 真实 UI Playwright 依次选择有/无 Explanation 的两个 Pairing。
- `npm run check:ui` 必须零 hard violation。

### Task 7：PBS Engine 真实生成（等待仓库权限）

预计修改范围需在 submodule 初始化后通过代码和 impact analysis 确认。

要求：

- 读取本次工作目录 `PAIRING_SCORE.csv`。
- 使用 `(Crew_ID, Pairing_ID)` 与最终 Assigned 集合精确关联。
- 从小到大选择首个
  `Tn_Award_Counter > 0 AND Tn_Avoid_Counter = 0` 的 Tier。
- 输出唯一模板到 `ASSIGNMENTS.comments`。
- 无唯一 Score 行、无有效 Tier 或 Counter 非法时输出空值。
- 不使用 `failure_reason`、其他 Crew 信息、solver pass 或法规诊断。

验证：

- Engine 单元测试和真实最小 Solver run。
- 真实 `output.gz` 中有合法 `ASSIGNMENTS.comments`。
- 真实链路最终在 `roster_publish.comments` 和 Award 页面显示。

## 5. 验证顺序

1. Shared Contract 单测。
2. Live Server Loader / Roster / Publish focused tests。
3. PBS Server Award focused tests。
4. PBS Portal Award focused tests。
5. Live Server、PBS Server、PBS Portal build。
6. `npm run check:ui`。
7. Playwright Award Explanation E2E。
8. 获得 Engine 权限后运行 Engine 测试和真实 Solver run。
9. `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main`。

## 6. 完成标准

- 主仓库链路及测试全部通过。
- 真实 Engine 输出步骤完成前，状态只能报告为“主仓库接收链路完成，Engine 生成端阻塞”。
- 获得 Engine 权限并通过真实 Solver run 后，才能报告完整功能完成。

