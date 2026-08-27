# PBS Flight Number Preference 标准答案语义对齐实施计划

> 依据：`docs/superpowers/specs/2026-07-16-pbs-flight-number-preference-standard-answer-alignment-design.md`

## 目标

删除 Flight Number Preference 的 Matching Flights 数量语义，将 Flight Date 对齐为可选的 Specific Dates（多选）/Date Range，并让 Portal、搜索预览及两套算法评分链路统一使用实际飞行腿正向命中语义。

## 步骤

1. 更新共享 contract、默认 bid、归一化和类型；验证规则签名稳定且旧字段不再合法。
2. 重写 Portal editor，复用 `OptionalEventDateScopeEditor`，同步完整性、摘要、clone、favorite/edit 与 focused Vitest。
3. 更新 pbs-server route schema、业务 validation、lineholder 解析/clone/摘要和 Pairing Search SQL。
4. 更新 pbs-server pairing-score export，确保 Award/Avoid 都查询正向命中集合，只改变 counter 方向。
5. 同步 live-server lineholder、search 与 pairing-score export。
6. 更新 property `116` seed，新增破坏性幂等 migration，并覆盖 occurrence/tier/bid 汇总一致性。
7. 更新 Playwright 与人工 QA；运行 focused tests、TypeScript、lint、build、UI gate 和 diff 检查。

## 实施边界

- 不兼容或转换旧 `minimumRequired / maximumRequired / specific_date` 数据。
- 不改变其他 Pairing property 的 Award/Avoid 行为。
- 共享工作区中的 Work Day Preference、import 等并行改动不属于本任务，必须逐 hunk 隔离。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: property `116` 的 contract、parser、SQL、algorithm export 与测试高度耦合，且共享文件已有并行改动。
- Execution: 单一实现线顺序完成，最后统一验证。
