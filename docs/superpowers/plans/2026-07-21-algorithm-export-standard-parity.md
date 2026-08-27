# 算法导出文件与标准答案对齐实施计划

对应规格：`docs/superpowers/specs/2026-07-21-algorithm-export-standard-parity-design.md`

## 实施原则

- 只修改实际提供压缩包的 `live-server` 导出链路及其测试。
- 测试先行：先补会在当前代码失败的回归断言，再做最小实现。
- 标准答案项目的 CSV 与构建逻辑是 Golden oracle；内部新 Rule 命名与其冲突时不采用。
- 不修改 Portal 搜索、数据库 Schema、接口地址或算法引擎。

## Task 1：Pairing 当前格式兼容

目标文件：

- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.test.ts`

步骤：

1. 为 103、107、163 当前 JSON 格式及 112 旧非 JSON格式新增失败回归测试。
2. 复用当前 pairing-search property contract 完成解析；保留既有候选查询、Award/Avoid Counter 累加和排序。
3. 加入非 Crew 不进入 `PAIRING_SCORE.csv` 的查询/服务测试。
4. 运行 Pairing 导出测试。

## Task 2：DAYSOFF 时区与窗口

目标文件：

- `live-server/src/services/algorithm-export/days-off-export.ts`
- `live-server/src/services/algorithm-export/days-off-export.test.ts`
- `live-server/src/services/algorithm-export/algorithm-export-service.test.ts`（如需验证 SQL/整包）

步骤：

1. 新增测试：按日期匹配有效主 `crew_base`；忽略 `pbs_user.base`；非 Crew 与缺 Base/时区跳过；局部 Window 不扩成全天；DST 转换正确。
2. 查询改为 `f8.crew → f8.crew_base → f8.airport`，保留 Bid 日期粒度所需的基地有效期信息。
3. 全天和局部窗口统一转换为标准答案 UTC 起止格式；禁止输出空时间。
4. 运行 DAYSOFF 与整包测试。

## Task 3：LINE_RULES 标准契约

目标文件：

- `live-server/src/services/algorithm-export/line-rules-metadata.ts`
- `live-server/src/services/algorithm-export/line-rules-entry.ts`
- `live-server/src/services/algorithm-export/line-rules-parameters.ts`
- `live-server/src/services/algorithm-export/line-rules-export.ts`
- 对应 `*.test.ts`

步骤：

1. 新增 407 Golden 测试：Portal 407 → `403/403/MIN_BASE_LAYOVER/{minHours}`。
2. 新增 427 Golden 测试：`if_possible` 与 `no_matter_what` 均 → `427/427/RESERVE/{action:"avoid",scope:"whole_bid_month"}`。
3. 新增 428、429 不输出测试。
4. 新增非 Crew 不进入 `LINE_RULES.csv` 测试。
5. 最小修改 metadata/entry/parameters/query，使测试通过。

## Task 4：Reserve 与统一 Crew 过滤

目标文件：

- `live-server/src/services/algorithm-export/reserve-score-export.ts`
- 对应测试与整包服务测试

步骤：

1. 确认四个 CSV 查询都以 `f8.crew` 存在性为条件。
2. 新增非 Crew 不进入 `RESERVE_SCORE.csv` 的回归测试。
3. 验证 scope 过滤和 scenario 导出不受影响。

## Task 5：Golden 与真实数据验收

1. 建立受控同条件 Golden fixture；PAIRING/DAYSOFF/LINE 输出稳定排序后与标准答案逐字段比较，JSON 按解析结构比较。
2. 运行所有 `live-server` 算法导出 Vitest。
3. 使用远端 F8 Jun 2026 只读生成压缩包：
   - 五文件齐全；
   - DAYSOFF 无空时间、无 `__admin__`；
   - 1334、755 使用 `crew_base` 时区；
   - 13365 的 DAYSOFF 行被跳过；
   - 428、429 不输出；
   - 除已批准跳过项外无未解释漏项。
4. 运行 `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main`，确认影响范围。
5. 报告所有命令及 PASS/FAIL；任何未运行项必须说明原因和剩余风险。

## 预计验证命令

```bash
cd live-server
npx vitest run src/services/algorithm-export/pairing-score-export.test.ts
npx vitest run src/services/algorithm-export/days-off-export.test.ts
npx vitest run src/services/algorithm-export/line-rules-export.test.ts
npx vitest run src/services/algorithm-export/algorithm-export-service.test.ts
npx vitest run src/services/algorithm-export
npm run build
```

## Multi-Agent 执行

不采用并行实现。上述文件共享查询契约、Counter 聚合和 Golden fixture，单线执行可降低冲突与错误归因风险。
