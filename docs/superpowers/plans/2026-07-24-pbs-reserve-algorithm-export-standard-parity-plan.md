# PBS Reserve 算法导出与标准答案对齐实施计划

日期：2026-07-24
依据：
`docs/superpowers/specs/2026-07-24-pbs-reserve-algorithm-export-standard-parity-design.md`

## 实施目标

只修改实际生效的 `live-server` 算法导出链路：

- 标准答案已有明确行为的 `whole_month`、`date_range` 严格对齐
  `LINE_RULES.csv` Rule 301。
- `first_half`、`second_half` 转成标准 Date Range 后进入
  `LINE_RULES.csv`。
- `specific_dates` 保留精确 pairing 展开，进入 `RESERVE_SCORE.csv`。
- Specific Dates 匹配同时识别 `assignment_group='RES'` 和 `'SBY'`。
- 保证一个 Reserve 条件只进入一个文件。

## 实施约束

- 不修改 `pbs-portal`、数据库、算法接口和压缩包文件名。
- 不修改 `pbs-server` deprecated 导出入口。
- 不处理当前 Credit Window `DELTA_HOURS` 配置问题。
- 不回退或混入工作区其他 Line、Days Off、Award 等改动。
- 修改任何现有 symbol 前执行 GitNexus upstream impact。
- 提交前执行 GitNexus `detect-changes`；没有用户明确命令不提交 Git。

## Task 1：建立实际导出器的失败回归测试

涉及文件：

- 新增：
  `live-server/src/services/algorithm-export/reserve-score-export.test.ts`
- 修改：
  `live-server/src/services/algorithm-export/line-rules-export.test.ts`

测试先行：

1. Rule 301 `whole_month` 只生成 `LINE_RULES.csv` 行。
2. Rule 301 `date_range`：
   - 输入 `from/to`；
   - 输出 `dateScope.mode=date_range`；
   - 输出标准字段 `start/end`；
   - 不生成 `RESERVE_SCORE.csv` 命中。
3. `first_half` 转为当月 `01..15`。
4. `second_half` 分别覆盖：
   - 平年二月；
   - 闰年二月；
   - 30 天月份；
   - 31 天月份。
5. `specific_dates`：
   - 不生成 Line Rule；
   - 查询具体 Reserve pairing；
   - 输出 Reserve Score Tier Counter。
6. Specific Dates 查询 SQL 同时接受 `RES` 和 `SBY`。
7. `whole_month`、`date_range`、`first_half`、`second_half`
   不查询 live pairing，Call Type 无数据也照常生成 Line Rule。

先运行 focused tests，确认新增断言在当前实现上失败。

## Task 2：新增单一 Reserve 导出分类器

建议新增：

- `live-server/src/services/algorithm-export/reserve-export-classification.ts`
- `live-server/src/services/algorithm-export/reserve-export-classification.test.ts`

职责：

1. 接收已解析的 Reserve Preference 和 `periodCode`。
2. 返回唯一 target：
   - `line_rules`
   - `reserve_score`
3. 对 Line Rule target 返回标准化日期范围：
   - `{ mode: "whole_month" }`
   - `{ mode: "date_range", start, end }`
4. 对 `specific_dates` 返回 `reserve_score`，不改写日期列表。
5. 使用现有 `parsePeriodMonth` 或同等共享日期解析逻辑，不再维护第二套月份名称表。
6. 无效 period 或不完整 Date Range 返回明确失败结果，不猜测日期。

该分类器是两个 CSV 的共同裁决点，避免各自维护一份日期模式集合。

## Task 3：对齐 LINE_RULES Rule 301

涉及文件：

- `live-server/src/services/algorithm-export/line-rules-entry.ts`
- `live-server/src/services/algorithm-export/line-rules-export.ts`
- `live-server/src/services/algorithm-export/line-rules-metadata.ts`
- 必要时：
  `live-server/src/services/algorithm-export/line-rules-parameters.ts`

实现：

1. `loadLineRulesCsv` 解析一次 bid period 窗口并传给 Rule 301 构建。
2. Reserve Rule 301 使用共享分类器。
3. `line_rules` target 生成：
   - `Code_ID=301`
   - `Rule_ID=301`
   - `Rule_Type=RESERVE_SHORT_CALL_TYPE`
4. `date_range` 参数输出 `start/end`，不输出 Portal 的 `from/to`。
5. First/Second Half 使用转换后的标准 Date Range。
6. Description 对齐当前标准生成器：
   - Whole Month：
     `Award|Avoid Reserve Short Call Type <CallType> for whole month.`
   - Date Range：
     `Award|Avoid Reserve Short Call <CallType> for <start>..<end>.`
7. `specific_dates` 返回 null，由 Reserve Score 路径唯一处理。
8. 维持现有 Award/Avoid 默认值和 T1-T7 聚合行为。

避免改动非 Reserve 的 Line Rule 参数与描述。

## Task 4：限制 RESERVE_SCORE 为 Specific Dates

涉及文件：

- `live-server/src/services/algorithm-export/reserve-score-export.ts`

实现：

1. 使用共享分类器判断 Rule 301 target。
2. `line_rules` target 立即跳过，不执行 pairing 查询。
3. 只有 `specific_dates` 执行 pairing 查询。
4. pairing 基础条件改为：

   ```sql
   upper(p.assignment_group) in ('SBY', 'RES')
   ```

5. 保持：
   - `p.is_deleted=0`
   - `p.assignment=<callType>`
   - base 本地日期匹配
   - 不依赖 `pairing_segment`
6. 无匹配时只输出表头，不伪造行。
7. 不增加硬编码默认时区。

## Task 5：建立标准答案 Golden

涉及文件：

- 修改：
  `live-server/src/services/algorithm-export/line-rules-export.test.ts`
- 必要时新增小型 fixture：
  `live-server/src/services/algorithm-export/fixtures/reserve-short-call-standard.csv`

Golden 来源：

```text
/Users/lei/Codehub/Flair_PBS_Optimization_Report/unit_test/Test_7/LINE_RULES.csv
```

测试仓库不能依赖开发机绝对路径。只复制最小 Rule 301 Golden 行到本仓库测试
fixture，并在测试注释中记录来源。

比较：

- 表头与列顺序；
- Code/Rule ID；
- Rule Type；
- JSON 解析后的结构；
- Tier Counter；
- Description。

Reserve Score 表头与标准 19 列常量逐列比较。

## Task 6：Focused 与模块验证

依次运行：

```bash
cd /Users/lei/Codehub/rois-ai/live-server
npx vitest run \
  src/services/algorithm-export/reserve-export-classification.test.ts \
  src/services/algorithm-export/reserve-score-export.test.ts \
  src/services/algorithm-export/line-rules-export.test.ts \
  src/services/algorithm-export/algorithm-export-service.test.ts
```

然后：

```bash
cd /Users/lei/Codehub/rois-ai/live-server
npm test
npm run build
```

若完整模块测试受到工作区其他未完成改动影响，记录具体失败文件和与本任务的关系，
不能把失败描述成通过。

## Task 7：远端只读 Smoke

使用远端 PostgreSQL 权威数据：

1. 统计 Current Reserve Property 301 的日期模式。
2. 单独执行 Reserve Score 与 Reserve Rule 301 导出，检查：
   - 源条件数；
   - Line Rule 行数；
   - Specific Dates 源条件数；
   - Reserve Score 命中数；
   - 允许的零命中 Call Type。
3. 尝试生成完整五文件压缩包。
4. 若仍被 Credit Window `DELTA_HOURS` 阻塞：
   - 保留本任务 focused export 证据；
   - 明确报告完整包阻塞；
   - 不顺带修改 Line Credit Window。

不得写数据库。

## Task 8：完成性检查

运行：

```bash
cd /Users/lei/Codehub/rois-ai
git diff --check
node .gitnexus/run.cjs detect-changes --scope unstaged
```

人工核对 diff：

- 只包含本任务 Spec、Plan、Reserve 导出代码和测试；
- 没有混入用户其他未提交改动；
- 没有修改 `pbs-server`、Portal、SQL 或数据库配置。

## 完成标准

- Rule 301 标准支持模式与标准答案 Golden 一致。
- First/Second Half 转换正确。
- Specific Dates 精确进入 Reserve Score。
- `RES`、`SBY` 都可匹配。
- 两个文件没有重复表达同一条件。
- focused tests、模块测试和 build 有明确 PASS 收据。
- 远端只读 Smoke 有源条件与输出计数。
- 完整压缩包若被外部 Line 配置阻塞，明确报告剩余风险。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个 CSV 必须共享同一个分类裁决，且会触及相同测试与 Line Rule 构建入口。
- Suggested split: 单人实现；完成后可派只读 reviewer 审查分类边界和 Golden。
- Write boundaries: `live-server/src/services/algorithm-export/**` Reserve 相关代码、测试和本任务文档。
- Conflict risk: 中等；工作区存在并行 Line 导出改动，必须使用精确文件和代码块边界。
- Execution gate: 用户明确批准实施后才能修改非文档文件。
