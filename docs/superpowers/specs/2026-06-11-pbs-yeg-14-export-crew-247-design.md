# PBS YEG 14 临时导出人员范围修正设计

## 背景

`/api/admin/algorithm-export/yeg-test-package` 是 YEG 14 人算法测试包的临时导出接口。当前导出 scope 中包含 `274`，但该 crew 的 base 已不属于 YEG。业务确认实际应使用 `247`，且 `247` 的相关测试数据已在数据库侧调整完成。

## 目标

- 将 YEG 14 临时导出接口的固定 crew 范围从 `274` 修正为 `247`。
- 保持接口路径、文件名、导出文件结构和排序规则不变。
- 保持 14 人数量不变。

## 范围

- 修改 `pbs-server/src/services/algorithm-export/algorithm-export-service.ts` 中的 `YEG_14_TEST_CREW_IDS`。
- 更新后端测试，明确断言导出 scope 包含 `247` 且不再包含 `274`。

## 不做

- 不改历史 seed 脚本。
- 不重写既有历史设计文档中的旧截图/旧名单。
- 不改变通用 `/api/admin/algorithm-export` 导出接口。

## 验收标准

- `GET /api/admin/algorithm-export/yeg-test-package?periodCode=Jun%202026` 的 scope 使用 `247`。
- scope 中不再包含 `274`。
- 仍导出 14 人测试包。
- 后端 targeted test 和 TypeScript 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单点常量修正和对应测试断言，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/algorithm-export/algorithm-export-service.ts`、对应测试和交付文档。
- Conflict risk: 低。
- Execution gate: 用户已确认 `274 -> 247` 后执行。
