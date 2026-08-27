# NPBS July 两名员工 Playwright 导入 Smoke 设计

## 背景

使用 `CLASS-BidsReport_July2026.txt` 验证 NPBS-Legend bids 能否通过真实 PBS Portal UI 导入。当前 Portal 已识别 `Jul 2026` 为当前 bidding period，业务时间为 2026-06-06，投标窗口已开放。

源文件为 CRLF 行尾。当前 parser 直接解析时，663 名有效员工全部得到 0 个 mapped predicates；将行尾规范化后可得到 3,014 个 mapped predicates 和 5,034 个 dropped/blocker 条目。因此必须先修复 parser 的 CRLF 支持，避免产生零 bid 假成功。

## 目标

- 先用员工 `#73` 和 `#113` 执行两人 smoke，不导入其他员工。
- 使用真实 Playwright UI 完成登录、配置 bid、选择 tier、添加、落行校验和退出登录。
- 在不牺牲真实性与隔离性的前提下，测量当前实现的最快串行导入速度。
- 生成可审计的 JSON 结果、失败截图和 Word 汇总报告，为是否全量导入提供依据。

## 非目标

- 本阶段不导入其余员工。
- 不修改 PBS Portal 或 PBS Server 产品逻辑来适配旧 NPBS 条件。
- 不通过 API、数据库脚本或浏览器注入绕过真实 UI。
- 不把 July 文件中的非 July 日期擅自平移到当前月份。
- 不承诺所有旧条件都能映射；不支持或当前数据不存在的条件必须记录为 blocker。

## Smoke 员工

| Employee | Category | Context | 可映射条件 | 主要覆盖 |
|---|---|---|---:|---|
| `73` | `YYZ-737-FO` | Current | 4 | Prefer Off、Airport Preference、Pairing Length、Pairing Preference |
| `113` | `YVR-737-CA` | Current | 4 | Prefer Off、Pairing Preference |

不使用 `#19`，因为用户当前正在使用该账号。跳过 `#96`，因为它只有 1 个可映射条件且有 8 个 dropped 条件，不适合作为速度和覆盖 smoke。

2026-07-22 已通过只读 Playwright 预检：`#73` 和 `#113` 的 Bid 页面 Existing rows 均为 0。正式运行必须在任何删除或添加前再次检查；如果任一账号出现 Existing row，立即中止该账号，不调用 `clearExisting()`。

完整 mapped 基线：

- `#73`：T1 Prefer Off `Jul 11, 2026`；T2 Airport Preference landing/avoid 17 个机场；T3 Pairing Length avoid `> 1 day`；T4 Pairing Preference award `T4117, T4136, TB8132, TB8141`。另有 2 个 `Departing On` 条件因当前 catalog 隐藏而 dropped。
- `#113`：T1 Prefer Off `Jul 3, 4, 5`；T2 Pairing Preference avoid 31 个 V4 pairing；T3 award `V4110`；T4 award `V4105`。无 dropped 条件。

## 设计

### 1. Parser 修复

- `splitRecords()` 必须同时支持 LF 与 CRLF，例如按 `/\r?\n/` 切分。
- 增加 CRLF 回归测试，证明同一记录在 LF 与 CRLF 下产生相同 predicates、properties 和 dropped 结果。
- 不改变 predicate mapping、tier 分配或 Current-over-Default 规则。
- 对受控 July 源文件生成 fixture report，并核对 `records=1105`、`effectiveCrew=663`、`mapped=3014`、`dropped=5034`，防止只修复为“非零”但仍发生部分解析。

### 2. Smoke Fixture

- 从用户提供的 July 文件生成独立的两人 fixture。
- 扩展 `generate-fixture.mjs`，新增并测试 `--employee-ids 73,113` 与 `--no-shift`；不得手工编辑 fixture。
- 生成时显式传入 `--period-start 2026-07-01 --period-end 2026-07-31 --employee-ids 73,113 --no-shift`。
- July 日期以及文件中的真实非 July 日期全部原样保留，禁用 `shiftDates()`。
- fixture 只包含员工 `73` 和 `113`，保持源文件中的 Current context、tier 和 predicate 顺序。
- fixture 与运行结果属于测试产物，不替换现有已提交的 June fixture。
- fixture 记录源文件名、SHA-256 `523a4a345372931504b4bb89531712f1a63fefaf523cbf77f880b03371bf7375`、period、生成模式 `no-shift` 和唯一 `runId`。

### 3. Playwright 最快真实 UI 路径

- 使用 Chromium headless。
- 固定 `--workers=1`，避免账号锁定和并发写入冲突。
- 使用 `--no-deps`，复用已运行的 Portal 与 PBS Server。
- 使用专用 smoke Playwright 配置或受控环境开关，明确设置 `trace: off`、`video: off`、单一轻量 reporter，不启动或探测 Gantt；保留 page object 显式失败截图及 NPBS issue JSON。
- 每名员工使用独立 browser context；同一 Playwright worker 复用 browser process。
- 仅进入该员工实际包含条件的 Bid 页面。
- 每名员工登录后、任何删除或添加前，断言 fixture period 为 `202607`，并在真实 UI 看到精确状态 `Bidding open for Jul 2026`；不匹配立即失败且不得触碰数据。
- 任何删除前再次断言当前 Existing rows 为 0。本次两账号的只读预检基线均为 0；如果运行时不再为 0，立即中止，避免删除用户或其他测试产生的数据。
- 只有通过 period 与零 Existing 门禁后，才允许调用现有清理步骤并添加 fixture 中的 bids。
- 每个添加成功的 bid 必须在当前页面的 Existing 列表中校验名称和目标 tier。
- property 配置、落行和 tier 校验分别捕获错误；一个 property 失败后继续后续 properties。
- issue JSON 写入和真实 UI logout 放入 `finally`；logout 必须断言回到登录页。

不采用跨账号复用同一个 context 的方案。它虽然可能节省少量初始化时间，但会增加 sessionStorage、React Query 缓存和身份数据串号风险，无法作为可信的全量导入速度基线。

## 数据与错误处理

- Airport 或 Pairing 在当前 period/base 数据中不存在时，记录 blocker，不创建自由文本或伪造选项。
- Portal 控件不支持旧 predicate 时，记录 `unsupported-current-editor` 或当前 mapping reason。
- 非 July 日期保持原值；若 Portal 拒绝，记录日期范围 blocker。
- 单个 property 失败不阻止同一员工后续 properties 继续尝试。
- 单个员工零成功 bid 时，该员工测试失败，但另一名员工仍继续执行并生成结果。
- 每次运行生成唯一 `runId`。运行前仅清理 `73.json`、`113.json` 及本次两账号对应的旧本地截图；不清理其他员工结果。
- 新 issue JSON 必须包含 `runId`、fixture source hash、`startedAt`、`endedAt`、`durationMs` 和操作数量。报告只接受与当前 fixture `runId` 一致的结果，缺失或不一致视为本次未完成。
- 不输出密码、token 或敏感响应数据。
- 原始 July 文件、fixture、issue JSON、截图和 Word 报告都包含敏感排班数据。原始文件继续保留在用户提供的本机临时路径；smoke fixture 和运行产物默认不提交 Git，完成汇报后由用户决定是否保留。正式 spec 和代码测试不得嵌入完整员工 bids 数据。

## 性能记录

记录以下时间：

- 整个 Playwright 命令的 wall-clock 时间。
- 每名员工从登录开始到退出结束的时间。
- 每个 property 的 placed/blocked 结果。
- 每名员工的操作数，以及登录、页面加载、property 写入和退出的关键阶段耗时。

速度结论必须同时附带操作数量。不能仅以总秒数推算全量时间，因为 Pairing picker、页面 hydration、账号登录和 blocker 类型会影响单人耗时。

正式计时前允许完成一次 Portal 可达性与登录页 warm-up，但不得提前登录 `#73/#113` 或写入 bid。wall-clock 从 Playwright smoke 命令启动开始单独记录。

## 验收标准

- Parser CRLF 回归测试通过，July 文件不再产生全员零 predicates。
- July fixture report 精确得到 `1105 records / 663 effective crew / 3014 mapped / 5034 dropped`。
- Portal 显示 `Bidding open for Jul 2026` 后才执行写入。
- smoke fixture 精确包含 `#73` 和 `#113`，没有 `#19` 或其他员工。
- fixture source hash、period `202607`、`no-shift` 和 runId 均与本次运行一致。
- 两名员工运行前 Existing rows 仍为 0；否则在任何删除前中止。
- Playwright 以 headless、单 worker、真实 UI 方式完成两名员工测试。
- 每个成功 property 均通过 Existing 列表和 tier 校验。
- `e2e/results/npbs-issues/73.json` 与 `113.json` 必须是本次 runId 新生成的结果，包含 placed/blocker 和耗时明细，不能仅以文件存在为准。
- 两名员工均至少成功添加 1 个 bid；两个 Prefer Off 必须成功。Airport Preference、Pairing Length 应成功；Pairing Preference 只有在当前 period/base 无对应真实 pairing 时允许记录 blocker。
- 使用 `node e2e/utils/npbs/generate-report.mjs --fixture <two-crew-fixture>` 生成新的 `.docx` 报告；报告必须动态描述 July/no-shift，不得包含硬编码 Mar→Jun 或 June blocker 建议。
- 报告生成器必须在 `#73` 或 `#113` 任一当前 runId 结果缺失时 fail-fast，不得生成不完整报告；`.docx` 正文必须包含并核验 runId、fixture source SHA-256、两名员工的新鲜结果、placed/total、blocker 和总计/分阶段耗时。
- 最终报告两名员工、placed/total、zero-bid crew、blocker 数、总耗时、每人耗时和 Word 报告路径。
- 本次 smoke 不触碰其他员工 bids。

## 验证命令

计划使用以下最小验证集合，具体 fixture 路径在实施计划中确定：

```bash
node --test e2e/utils/npbs/parse-npbs-bids.test.mjs

node e2e/utils/npbs/generate-fixture.mjs \
  <CLASS-BidsReport_July2026.txt> \
  <two-crew-fixture> \
  <fixture-report> \
  --period-start 2026-07-01 \
  --period-end 2026-07-31 \
  --employee-ids 73,113 \
  --no-shift

(
  cd e2e
  CREWBIDS_FIXTURE=<two-crew-fixture> \
  CREWBIDS_PAGES=days-off,pairing,line \
  CREWBIDS_RUN_ID=<run-id> \
  npx playwright test \
    --config=config/npbs-smoke.playwright.config.ts \
    --project=pbs-portal \
    --no-deps \
    npbs-crew-bids-simulation.spec.ts \
    --workers=1 \
    --reporter=line
)

node e2e/utils/npbs/generate-report.mjs --fixture <two-crew-fixture>
```

实施时将通过 Playwright 配置或命令环境关闭 trace/video 等非必要开销，但不得关闭失败截图和业务结果 JSON。

## 风险与回滚

- 当前只读预检确认 `#73` 和 `#113` Existing rows 为 0。正式运行若仍为 0，则本次创建的 rows 是唯一预期数据修改；若不为 0，运行在删除前中止。
- 若 smoke 中途失败，issue JSON 和截图用于识别已成功/未成功项目；不得假定事务整体回滚。
- 因运行前基线必须为 0，如需回滚，只通过 Portal UI 删除本次 runId 对应员工创建的 rows，使 Existing rows 恢复为 0；不得触碰其他账号。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: parser、generator、simulation 与 report generator 彼此共享 fixture/runId 合约，Playwright 登录和写入又必须串行；拆分会增加契约冲突和集成成本。
- Suggested split: 单 agent 完成 parser、generator、simulation、report、smoke 和结果核对。
- Write boundaries: NPBS parser/generator/report utilities、NPBS simulation spec、专用 Playwright 配置、smoke fixture 与运行结果。
- Conflict risk: 中低；共享 runId/fixture metadata 必须一次性保持一致，并避开用户正在使用的 `#19`。
- Execution gate: 用户审阅并批准本 spec 后才允许修改 parser 或执行写入 smoke。
