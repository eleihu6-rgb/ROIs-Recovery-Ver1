# NPBS 高覆盖抽样与正式导入接口对齐设计

## 1. 背景与目标

July 2026 的 `CLASS-BidsReport_July2026.txt` 共有 663 名有效 crew。逐人通过 PBS Portal Playwright 录入可以验证真实 UI 行为，但按现有速度全量执行预计约 10 小时，不适合作为正式批量导入方式。

本需求目标是：

- Playwright 只保留少量高覆盖 crew，验证真实 UI、当前 catalog 和保存后的 bid 展示。
- 正式批量导入复用现有 Gantt 管理端 `Crew Bid Import` 接口及其 dry-run、备份、逐员工 savepoint、run 查询和 rollback 能力。
- 正式接口的 NPBS 解析和 mapping 语义必须与已验证的 108 Playwright 规则一致。
- 无法匹配的 airport、pairing 或无法忠实表达的 legacy 条件必须成为明确 blocker，不得编造值、自动修复源数据或静默降级。

本次源文件：

- 文件：`CLASS-BidsReport_July2026.txt`
- SHA-256：`523a4a345372931504b4bb89531712f1a63fefaf523cbf77f880b03371bf7375`
- period：July 2026
- date mode：`no-shift`

## 2. 当前实现

### 2.1 Playwright 108 流程

现有 108 流程：

1. 解析 NPBS 文本。
2. Current Bid 优先，缺失时使用 Default Bid。
3. 只读取第一个 Pairing Bid Group。
4. 每个真实 predicate 占用原始 T1-T7 位置；不支持的 predicate 被记录为 dropped，但不会压缩后续 tier。
5. 使用当前合并后的 `/bid` 页面和当前可见 catalog 录入。
6. 日期按本次 July 文件的 `--no-shift` 规则原样保留。
7. airport、pairing 等 UI 可选值不存在时记录 blocker，不强行保存。

已执行两人 smoke：

| Crew | 结果 | 耗时 | Blocker |
|---|---:|---:|---|
| `73` | 3/4 | 37.43 秒 | 17 个 Airport Preference 值无法全部匹配 |
| `113` | 3/4 | 73.58 秒 | Pairing `V4117`、`V4127` 不存在 |

### 2.2 正式接口

正式管理链路是：

```text
Gantt 管理端
  -> live-server /api/admin/crew-bid-imports
  -> PBS 数据库
```

现有正式接口已经具备：

- multipart `.txt` 上传；
- `dry-run`；
- `base/categories/crewIds` 范围选择；
- Current 优先、Default fallback；
- first pairing group；
- 覆盖 Current Bid；
- unmatched pairing 策略；
- 按员工 savepoint；
- 导入前快照；
- run 查询；
- rollback / restore previous；
- 分阶段性能统计。

因此本次不新增第二套导入 API，也不使用 Playwright 做全量数据写入。

### 2.3 当前接口与 108 的关键差异

| 规则/条件 | 108 Playwright | 当前 live-server 导入器 | 风险 |
|---|---|---|---|
| 日期 | July 源日期原样保留 | 把源日期的“日”套到目标 period 月份 | 会悄悄改变用户原始 bid |
| 反向日期范围 | 保留并报告 blocker | 自动交换起止日期 | 会掩盖源数据问题 |
| Prefer Off time window | fixture 保留 window，UI 能力按真实编辑器验证 | mapper 直接忽略并只报 warning | 可能丢失用户要求的 off-block 时间 |
| `Minimum` / `All or Nothing` | 108 当前只部分保留 | live mapper 会写旧数量字段 | 需要逐项定义，不能静默丢失 |
| Pairing `Check-In Date` / `Limit N` | 108 当前会剥离部分 qualifier | service 已有 occurrence resolver 和 group limit 字段 | 两条路径都可能丢失 qualifier |
| 次级 `If` | 主条件映射，次级条件记录 dropped | 尝试全部导入，任一失败可能使整条失败 | 两条路径结果不一致 |
| Pairing Preference `102` | UI 按 Pairing Number 解析稳定 ID；缺失值 blocker | mapper 直接拒绝，虽然后续 service 已有 pairing resolver | 正式接口无法导入该核心条件 |
| Airport Preference | 当前统一 property `168` JSON payload | 仍写旧 `101/104` scalar 格式 | 页面摘要、编辑和规则消费不一致 |
| Airport 缺失值 | 任一值不可选时整条 blocker | 保留匹配值、丢弃缺失值并报 warning | 会把用户的完整集合改成子集 |
| Check-In / Check-Out | 当前统一 property `103` JSON payload | 仍写旧拆分 property/标量格式 | 页面编辑和摘要可能错误 |
| Flight Legs per Duty `107` | 当前 JSON payload，支持日期范围 | 旧 scalar 参数 | 丢失当前编辑器语义 |
| Pairing Length `112` | 当前 JSON payload，支持日期范围 | 旧 scalar 参数 | 丢失当前编辑器语义 |
| Flight Number `116` | 当前 JSON payload，支持日期范围 | 旧 scalar 参数 | 丢失当前编辑器语义 |
| Redeye `117` | 当前 JSON payload，默认 Avoid，支持日期范围 | 旧 flag | 无法忠实回显当前条件 |
| Credit Window | 当前 `429` JSON payload | 旧 `401/402` flag | 写入隐藏/旧 catalog |
| Commuter Pattern | 当前 Line `408` JSON payload | 旧 DaysOff `205` scalar | 写入错误类别与旧格式 |
| 隐藏 catalog | 记录 skipped/dropped | 部分仍继续导入旧 property | 用户会看到与当前页面不一致的数据 |
| Counting Deadhead / 非法数值 | 不能忠实表达时 dropped/blocker | 部分 qualifier 被降级为 warning，数值边界主要依赖后续消费 | 可能保存当前 editor 无法接受的值 |

`pbs-server` 还保留另一套旧导入 route/mapper，但 Gantt 正式入口使用 `live-server`。本次以 `live-server` 为唯一正式实现，不把旧 `pbs-server` 入口当成导入权威。

## 3. 高覆盖 crew 抽样

### 3.1 覆盖口径

第一层覆盖键采用：

```text
page + action(Award/Avoid) + propertyCode
```

该口径比单纯 propertyCode 更严格，可以区分同一条件的 Award/Avoid 行为；同时不会因为某个 operator 或日期值不同而无限扩大样本。

July 文件在当前 108 可见 catalog 下共有 20 个此类覆盖键。候选计算排除了已使用或正在使用的 `19、73、113`。

实施时必须生成受源文件 SHA-256 约束的 coverage manifest，建议路径：

`e2e/results/npbs-smoke/july-2026-coverage-manifest.json`

manifest 至少包含：

- source filename、SHA-256、period、date mode；
- 20 个第一层覆盖键全集；
- 每名候选 crew 的新增覆盖键、mapped/dropped 数量；
- 5 人和 8 人累计覆盖率；
- 未覆盖键；
- 生成脚本版本/路径。

除第一层结构覆盖外，再建立第二层 branch coverage manifest/test，覆盖：

- `<`、`>`、`=`、`Between`；
- dates、days-of-week、weekends、date range、time window；
- Airport landing/layover、Any/Every；
- Check-In/Check-Out、Award/Avoid；
- secondary `If`；
- `Limit N`、`Minimum N`、`All or Nothing`；
- Pairing `Check-In Date`；
- off-period date、反向 date range；
- partial airport、partial pairing；
- hidden catalog、Counting Deadhead qualifier、无效数值边界。

第一层 80%/95% 用于控制 Playwright 人数，第二层通过 focused mapper/service tests 补齐，不要求每个异常分支都占用一名真实 crew。

### 3.2 推荐 5 人 golden sample

| Crew | Category | 主要覆盖 |
|---|---|---|
| `2005` | `YVR-737-FA` | Prefer Off、Award/Avoid Pairing Preference、Award/Avoid Airport Preference、Avoid Flight Legs per Duty |
| `13637` | `YYZ-737-FA` | Credit Window、Prefer Off、Award/Avoid Check-In、Reserve Preference |
| `2222` | `YVR-737-CA` | Commuter Pattern、Long Stretch Off / Compressed Flying、Reserve Preference |
| `2524` | `YYC-737-FA` | Award/Avoid Flight Number、Award/Avoid Airport Preference、Prefer Off |
| `13428` | `YYC-737-FO` | Award/Avoid Pairing Length、Credit Window |

该组合覆盖 16/20 个 `page + action + property` 组合，约 80%，总计 28 条当前可映射 property。它比按 seniority 随机取人更适合做 golden sample，并且与 `19、73、113` 不重复。

### 3.3 可选 8 人扩展回归

在 5 人基础上增加：

- `1226`：补 Award Flight Legs per Duty；
- `13223`：补 Avoid Redeye；
- `13631`：补 Award Redeye。

8 人合计覆盖 19/20，约 95%。剩余一项为 `Minimum Base Layover (407)`，可单独保留 mapper 单元测试，不必为了一个条件再增加一整名 Playwright crew。

## 4. 方案比较

### 方案 A：继续用 Playwright 全量导入

优点：完全经过真实 UI。

缺点：约 10 小时；容易受页面加载、登录、可选值和偶发 UI 状态影响；失败恢复成本高；不适合正式批量导入。

结论：不采用。

### 方案 B：直接使用当前正式接口

优点：最快；已有 dry-run、备份和回滚。

缺点：mapper 与当前 Portal/108 规则明显漂移，会写入旧 property 格式并自动改变部分日期语义。

结论：不能直接用于本次 July 正式导入。

### 方案 C：对齐 live-server mapper，Playwright 保留 golden sample（推荐）

做法：

- 以 108 当前 mapping 行为和 PBS 当前 payload validator/summary formatter 为目标，更新 `live-server` 导入 mapper。
- 不让生产服务直接依赖 `e2e/*.mjs`；建立一组共享 golden mapping corpus，由 108 parser 测试和 live-server mapper 测试共同验证，防止两套实现再次漂移。
- Playwright 只跑推荐 5 人，必要时扩到 8 人。
- 正式批量导入走 `dry-run -> blocker 审核 -> confirm import -> run receipt/rollback`。

优点：兼顾真实 UI 可信度、批量速度和正式导入的可恢复性。

缺点：需要一次性修正 mapper 和测试；两套运行时实现仍需通过 golden corpus 保持一致。

结论：采用。

## 5. 详细设计

### 5.1 Mapping 权威与边界

- 业务写入权威：`live-server/src/services/crew-bid-import/`。
- UI 真实性权威：当前 PBS Portal editor、validator、summary formatter 和 108 Playwright page object。
- `e2e/utils/npbs/mapping.mjs` 继续用于 fixture/Playwright，不直接作为后端运行时依赖。
- 增加可审查的 golden mapping cases，至少覆盖本次 5 人涉及的全部条件和已知 blocker。
- 不修改产品逻辑去接受数据库中不存在的 airport 或 pairing。

### 5.2 日期规则

- 本次 July 文件固定使用 `no-shift`。
- 源文本中带年份的日期必须按原年月日解析。
- 源文本中无年份时，可使用文件 `Period:` 的年份；无法确定时失败。
- 日期不属于目标 July 2026 period 时，记录 error blocker，不平移。
- 反向日期范围不交换，记录 error blocker。
- 不再把无效日期从列表中静默剔除后继续保存部分值。
- Prefer Off 带 time window 时，若当前 Portal/数据模型不能完整保存该 window，则整条作为 blocker；不得只保存日期并丢弃时间窗口。

### 5.3 当前 catalog payload

正式接口必须写入与当前 Portal 保存一致的结构：

- `102 Pairing Preference`：生成 pairing references，使用现有 resolver 转换为稳定 pairing IDs；任一值缺失时按 `failOnUnmatchedPairing` 规则报告，正式 July 导入使用严格模式。`Check-In Date` 必须在 `no-shift` 下解析为 occurrence date 并参与匹配，不能从文本中剥离后扩大到同编号全部 occurrences。
- `168 Airport Preference`：JSON payload，包含 `event`、canonical `locations: Array<{ code, kind }>`、`dateScope`、`minimumLayoverDuration`，不保留临时 `values` 字段。新增严格 airport matching 选项；本次 July dry-run/import 固定启用，任一机场缺失即阻断整条 preference，不允许保存匹配子集。
- `103 Pairing Check-In / Check-Out Time`：统一 JSON payload，包含 `timeType`、operator/value 或 from/to、`dateScope`。
- `107 Flight Legs per Duty`：JSON payload，保留 operator/value 和 `dateScope`。
- `112 Pairing Length`：转换为当前 minDays/maxDays 语义并保留 `dateScope`。
- `116 Flight Number Preference`：JSON payload，使用 canonical `flightNumbers` 和 `dateScope`，不使用 fixture 临时 `values` 字段。
- `117 Redeye Preference`：JSON payload，action 使用源 Award/Avoid；当前 UI 新建默认 Avoid 不改变源数据语义。
- `429 Credit Window Preference`：JSON payload，`Maximum Credit Window -> low`，`Minimum Credit Window -> high`。
- `408 Commuter Pattern`：Line 条件使用 canonical `days-off-on-pattern` payload：`minDaysOff`、`minDaysOn`、`maxDaysOn`，必要时带合法 `dateRange`；不沿用 fixture 的临时字段名。
- `201 Prefer Off`：保存为当前 `tag-list { values }` payload；`Weekends`、weekday、specific dates 和 `Between from - to` 的 tag 表达必须与 Portal read/write mapper 一致。
- `204 Long Stretch Off / Compressed Flying`：保存为 canonical `stepper-date-range { value, from, to }`。
- `301 Reserve Preference`：使用 `reserve-call-type-date-scope`，包含合法 `callType`、当前 catalog `options` 和 `dateScope`；源 call type 不在 options 时 blocker。

Legacy modifier 规则：

- `Limit N`：保留到 group `limitN`；必须进入 golden test 和 import/readback 对账。
- `Minimum N`、`All or Nothing`：仅在当前 property contract 明确支持时保留；不支持时整条 blocker，不静默删除。
- Pairing `Check-In Date`：保留为 pairing occurrence qualifier。
- Counting Deadhead qualifier：当前 `168 Airport Preference` 无等价字段时整条 blocker，不降级成普通 landing preference。
- 数值和 duration 在 mapper 阶段按当前 validator 边界校验，不能依赖下游页面偶然拒绝。

### 5.4 不支持条件和 tier

- 仍按源 predicate 顺序占用 T1-T7。
- unsupported/hidden 条件记录 skipped 或 failed，但不得压缩后续 tier。
- 108 当前对 secondary `If` 的规则保持不变：只映射 primary clause，secondary clause 记录 dropped；不因为 secondary clause 无法映射而使 primary clause 整条失败。
- `beyond-tier-7` 继续记录并不导入。
- hidden catalog 条件不得写入旧 property code；golden corpus 必须明确期望 skipped 或 blocker。

### 5.5 导入流程

1. 生成 source-SHA-bound coverage manifest 和推荐 5 人 July `no-shift` fixture。
2. Playwright 登录每名 crew 后，在任何删除/清理前读取所有 Bid tab 的 Existing count；每人必须为 0，否则立即中止该 crew。不得自动删除非空 Existing bid。
3. 通过真实 Portal Playwright 录入 5 人，记录 placed/total、blocker、耗时和保存后摘要。
4. Playwright 对账完成后，只清理本次 Playwright 创建的 5 人 bids，并再次断言五人 Existing=0；若无法精确识别本次产物则中止，不做模糊删除。
5. 使用正式接口对同一源文件、同一 5 人执行 dry-run，启用严格 pairing/airport matching。
6. 对比 Playwright 与 dry-run：tier、property、action、payload、modifier、blocker 必须一致。
7. dry-run receipt 由用户审核后，另行取得明确批准，才允许执行 5 人 confirm import；批准本 spec 本身不授权写入业务 bid。
8. 5 人 import 后读取 Portal read model 和必要的远端 DB read model，与 Playwright 保存结果逐项对账。
9. 对测试 run 实际执行一次 `restorePrevious=true` rollback drill；由于 import 前基线已经恢复为 Existing=0，rollback 后必须验证 bid、tier、group、payload 和关联 occurrence 全部回到零基线。
10. rollback 后再次通过真实 Portal 断言五人 Existing=0。
11. 全部 663 人只先执行 dry-run；全量 dry-run 和全量 confirm import 分别需要新的明确批准，不能由 5 人批准或本 spec 自动授权。

正式接口预计耗时应以秒或分钟计，不再与 crew 数量线性叠加 UI 登录和页面操作时间。

## 6. 影响范围

预计涉及：

- `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `live-server/src/services/crew-bid-import/crew-bid-import-service.ts`（仅 pairing/current payload 对齐需要时）
- `live-server/src/services/crew-bid-import/__tests__/*`
- `e2e/utils/npbs/mapping.mjs`
- `e2e/utils/npbs/*test.mjs`
- `e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts`
- golden mapping fixture/result 文件
- 必要的 PBS QA 手工测试用例

不涉及数据库 schema 变更，不需要 migration。

## 7. 验收标准

- 推荐 5 人 Playwright 使用真实 `/bid` UI 完成，且每人结果可追溯。
- coverage manifest 可从指定源 SHA 重算出 5 人 16/20、8 人 19/20，并列出全部覆盖键和未覆盖键。
- Playwright 每名 crew 在任何清理前验证 Existing=0；非零时 fail-fast，零 Existing 门禁本身有回归测试。
- 5 人正式接口 dry-run 与 Playwright 在 tier、property、action、payload 和 blocker 上一致。
- Pairing/Airport 缺失值不会被静默忽略或自动替换。
- Airport 部分匹配和 Pairing 部分匹配在严格模式下都阻断整条源 preference。
- July 日期不发生月份平移，反向范围不被自动交换。
- 正式接口不再为当前条件写入旧 `101/104/111/139/140/205/401/402` 等替代格式。
- dry-run 不写业务 bid。
- confirm import 保留快照并可 rollback/restore previous。
- 5 人 confirm import 必须在 dry-run receipt 经用户单独批准后执行；全量 663 人 dry-run/import 也各有独立批准门禁。
- 实际完成一次 `restorePrevious=true` rollback drill，并验证完整恢复，而不只验证接口返回成功。
- Playwright smoke 清理后、正式 import 前、rollback 后三个时间点都必须证明 5 人 Existing=0 基线成立。
- 后端 focused Vitest、108 Node tests、真实 Playwright 5 人回归全部 PASS。
- 前端若无 UI 改动，可不运行 `check:ui`；若管理端展示有改动，必须运行并 PASS。

## 8. 验证计划

- `node --test e2e/utils/npbs/parse-npbs-bids.test.mjs e2e/utils/npbs/generate-fixture.test.mjs`
- `live-server` crew bid mapper/service focused Vitest
- `live-server` admin crew bid import route focused test
- July 5 人 Playwright，`workers=1`，真实 UI
- coverage manifest deterministic test
- 正式接口 5 人 dry-run receipt
- 用户批准后的正式接口 5 人 import run receipt
- Portal/远端 DB readback parity receipt
- rollback/restore previous focused integration test + 一次真实 5 人测试 run rollback drill

所有命令和 PASS/FAIL 收据在交付时列明。

### 敏感产物治理

- coverage manifest、真实 July fixture、Playwright result、dry-run/import receipt、DB readback 和 rollback receipt 属于 source-derived 员工 bid 产物，默认写入已 ignored 的本地结果目录或临时目录，不提交 Git。
- 可提交的 golden mapping corpus 只能使用合成数据或不可逆脱敏数据，不得包含真实 employee id、完整 airport/pairing 列表或完整员工 bid payload。
- Git 提交前必须显式检查 staged files，确保没有截图、真实 fixture、receipt、数据库导出或源文件副本。
- 测试日志、spec、实施总结只报告聚合覆盖率、problem code、必要的少量脱敏示例，不粘贴完整员工 bid payload。

## 9. 风险与控制

- Pairing 和 airport 数据是 period/base/rank 相关的，候选 crew 仍可能产生真实 blocker；这是应报告的数据问题，不是 mapper 应绕过的问题。
- `live-server` 与 `pbs-server` 存在旧实现重复。本次不扩大为双端重构；正式入口只修 `live-server`，并在文档/测试中明确权威，避免改错入口。
- 5 人覆盖率是当前可映射 catalog 的结构覆盖，不等于 663 人所有具体值都存在；全量前仍必须执行全文件 dry-run。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: mapper、service resolver、golden corpus 和 Playwright 对账共享同一契约，实施有明确顺序，多个 agent 同时修改容易产生中间格式冲突。
- Suggested split: 主 agent 顺序完成 mapping 对齐、测试、5 人 Playwright、接口 dry-run/import；可在完成后让独立 reviewer 做只读审查。
- Write boundaries: 不建议并行写；reviewer 只读。
- Conflict risk: High，核心文件和 payload contract 高度耦合。
- Execution gate: 用户审阅并明确批准本 spec 后，仅授权代码实施、合成测试和已约定的 5 人 Playwright golden smoke；不授权正式接口 5 人 confirm import，不授权全量 663 人 dry-run 或 confirm import。后三类运行必须分别再次取得明确批准。
