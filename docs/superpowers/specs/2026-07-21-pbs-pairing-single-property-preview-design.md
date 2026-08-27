# PBS Pairing 单条件 PREVIEW 搜索正确性设计

## 背景

PBS Portal 的 Pairing 页面每一条已保存条件都有 `PREVIEW` 按钮。该入口用于让 Crew 独立检查这一条条件会得到哪些可申请 Pairing，是后续整组规则搜索和算法 Pairing 计分验证的基础。

当前行级 PREVIEW 会把该行转换为一个 Search Pairings criteria item，再调用 `POST /api/pairing-search/preview`。后端先解析 Crew 上下文和 Bid Period，再由 Pairing property SQL builder 生成条件。当前实现已经具备此链路，但所有 Pairing property 的支持完整性、Base 有效期、时间边界、Avoid 补集以及真实结果正确性尚未形成统一验收门禁。

## 目标

1. Pairing 页面任意一条可显示、可保存的 Pairing Property 点击 `PREVIEW` 时，只用该条件独立搜索。
2. 返回结果必须先属于当前 Crew 在目标 Bid Period 内可申请的 Pairing Pool。
3. Award 返回命中条件的 Pairing；Avoid 返回基础池中不命中条件的 Pairing。
4. 所有当前 Pairing Property 均有明确、可验证的搜索语义，不允许静默忽略或退化成全量/空结果。
5. 以远端真实 PostgreSQL 独立查询作为结果 oracle，验证 Pairing ID、总数和分页结果。

## 非目标

- 不修改 `SEARCH PAIRINGS` 的 Current Rules 多条件 AND/OR 组合。
- 不修改算法导出、`PAIRING_SCORE.csv` 或优化算法。
- 不修改 Pairing 条件弹窗、列表布局或 PREVIEW 按钮视觉。
- 不新增数据库表、字段或第三方依赖。
- 不在本任务中重构完整 Pairing Search 架构。

## 已确认业务语义

### 单条件边界

- 从某一 Pairing 行进入 PREVIEW 时，初始请求只包含该行的一个 Property。
- 不能带入同 Tier 的其他条件，也不处理不同条件之间的 AND/OR。
- Search Pairings 页面后续由用户主动增加 criteria 属于既有自由搜索行为，不改变本次“初始行级 PREVIEW 只含一个条件”的要求。

### Award / Avoid

- Award：`eligible_pool AND condition`。
- Avoid：`eligible_pool AND NOT(condition)`。
- Avoid 必须是 Award 条件命中集合在 `eligible_pool` 内的严格补集。数据库字段为 `NULL` 时也不能造成 Pairing 同时被 Award 和 Avoid 两边遗漏；条件实现应显式归一布尔值，而不能依赖 PostgreSQL 三值逻辑碰巧成立。

对同一个基础池和同一条 Property，应满足：

```text
Award IDs ∩ Avoid IDs = ∅
Award IDs ∪ Avoid IDs = Eligible Pool IDs
```

### Any / Every

- `Any / Every` 只作用于当前 Property 内部的 Segment、Duty 或事件集合。
- `Any`：至少一个有效元素满足条件。
- `Every`：至少存在一个适用元素，且所有适用元素都满足条件；空集合不能被视为 Every 成立。

## Crew 可申请 Pairing Pool

Property 条件应用前，候选 Pairing 必须同时满足以下基础资格：

1. **Crew 身份**：请求来自当前登录 Crew，不接受前端传入其他 Crew 身份替代服务端认证上下文。
2. **Base**：以 `f8.crew_base` 为权威来源，不以可能过期的 `f8_pbs.pbs_user.base` 为事实来源。
3. **Base 有效期**：根据 Pairing 在 Base 当地的 origin date 匹配当日有效的主 Base。若 Bid Period 内发生 Base 变更，不能用一个无时间含义的“当前 Base”覆盖整月。
4. **Rank**：Pairing 必须存在与 Crew Rank 匹配且未删除的 `pairing_composition.acting_rank`。
5. **Bid Period**：Pairing 的可见日期必须落入请求的 Bid Period；周期边界按有效 Base 当地日期判断，不能直接用 UTC 日期截断。
6. **数据状态**：排除已取消、已删除，或缺少全局必需 origin/start 数据而无法判断 Base 与 Bid Period 的 Pairing。

Base、Rank 或 Bid Period 缺失时返回明确业务错误，不允许回退到全航司 Pairing Pool。

Eligible pool 只由全局资格决定，不能因为某个 Property 专属字段或事件缺失而改变。例如 Pairing 没有可用 Check-Out 事件时，它仍可属于 eligible pool；该 Check-Out 正条件统一按 `false` 处理，因此进入对应 Avoid 的补集。

### Base 与 Rank 的确定规则

- Base 不在本规格中抽象成新的开/闭时间区间；严格复用本项目既有 F8“当地日重叠”判断：`eff_dt < local_day_end_utc AND (exp_dt IS NULL OR exp_dt >= local_day_start_utc)`。
- 同一当地日出现多条有效 Base 时，确定性排序固定为 `is_prime_base DESC, eff_dt DESC, id DESC`，选择第一条。
- 必须显式满足 `pairing.base = 当地 origin date 对应的有效 crew_base.base`。
- Base/时区缺口按日期处理：没有有效 `crew_base` 或有效 IANA `airport.zone_id` 的当地日，其 Pairing 不进入 eligible pool；不影响周期内其他日期。若目标周期完全没有任何可用 Base 日，返回 400。禁止回退 UTC。
- Rank 的本次权威来源为 `f8_pbs.pbs_user.rank`。该字段按现有数据模型是从 `crew_rank` 同步的当前有效职级；为空时行级 PREVIEW 返回业务错误。
- Pairing 必须存在 `is_deleted=0 AND acting_rank=actor_rank` 的 `pairing_composition` 行。
- 本次不新增历史 Rank 推导；如果以后允许 Crew 对历史职级周期进行申请，应单独设计 Rank 有效期语义。

### Bid Period 请求规则

- Pairing 行级 PREVIEW 必须从当前 draft 明确携带 `periodCode`。
- 单条件模式不允许使用服务器当前月份 fallback；缺失、格式无效或找不到目标周期时返回 400。
- 此严格规则只应用于行级单 Property PREVIEW；本次不改变 Current Rules、自由 Criteria 或 All Pairings 的既有 fallback 行为。

## 方案选择

### 方案 A：保留现有 PREVIEW 链路，逐 Property 修正 SQL并建立验证矩阵（采用）

- 保持 Portal 行级跳转、Search Pairings 页面和 `/api/pairing-search/preview` 入口。
- 初始行级请求继续保证只携带一个 Property。
- 在 `pbs-server/src/services/pairing-search/**` 修正可申请池和各 Property builder。
- 使用统一 Property 清单驱动自动测试、SQL 结构审计和远端结果核查。

优点：改动最小；直接验证生产搜索链路；不改变页面工作流和 API 边界。

### 方案 B：复用算法导出 Pairing 匹配逻辑（不采用）

算法导出面向 Tier Counter 计分，PREVIEW 面向当前 Crew 可申请池和分页展示。强行共用会混合职责，并扩大跨 `live-server` / `pbs-server` 边界的改动。

### 方案 C：拉取候选 Pairing 后在应用内存中逐条过滤（不采用）

实现直观，但在大数据量下性能不可接受，也容易让 JavaScript 与 PostgreSQL 的时区、`NULL` 和集合语义产生漂移。

## 调用链与职责

### Portal

相关入口：

- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- `pbs-portal/src/shared/services/pairing-service.ts`

职责：

1. 从点击行的稳定 Property 身份构造完整 preview property。
2. 保留 `propertyCode`、`action`、`bid`、`quantifier`，不得因展示 mapper 丢失日期、时间、Any/Every 或 Award/Avoid。
3. 新增明确的 `previewSingleProperty` service 调用，使用现有 `/preview` 请求 union 中的 `property` 分支，服务端 metadata 为 `single_property_preview`；不再把行级 PREVIEW 伪装成包含一项的自由 `criteria` 请求。
4. 分页、刷新和返回页面后继续使用相同 Property 契约。

### PBS Server

相关入口：

- `pbs-server/src/routes/pairing-search.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/actor-base.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-*-conditions.ts`

职责：

1. 由服务端认证上下文解析 Crew、Rank 和目标 Bid Period。
2. 按 Pairing 当地 origin date 解析有效 Crew Base。
3. 单 Property 分支使用独立、明确的 eligibility 构造入口，再应用单 Property 条件。
4. 在数据库完成过滤后计算总数和分页，禁止先分页再过滤。
5. 使用同一过滤集合返回 summary、Pairing rows 和详情目标。

### 共享代码边界

- Property 叶子 SQL builder 可以继续共享，因为同一个 Property 的业务含义不应因入口不同而变化。
- 本次明确允许同一 Property 的正确叶子语义同步应用于 Single Property、Current Rules 和自由 Criteria；这是共享业务定义，不视为扩大功能范围。
- 不得改变 Current Rules 的 AND/OR 分组结构、自由 Criteria 的组合结构或 All Pairings 的 result filter。
- 单 Property 的严格 period、按日期有效 Base 和 Award/Avoid 补集入口应由 `single_property` mode 显式启用，避免无意改变其他三种 mode。
- 每次共享叶子修改都必须同时运行 Current Rules、Criteria 和 generated SQL 回归，证明组合结构未改变；叶子命中结果随正确性修复同步变化是预期行为。

## Property 覆盖策略

本次 catalog 快照基准为 **2026-07-21 远端 `f8_pbs.pbs_bid_property` 中 `bid_type='Pairing' AND is_active=1 AND is_visible_in_portal=1` 的结果**。本次必须完整覆盖以下 11 个 Property Code；不使用“包括但不限于”作为验收范围：

| Code | Property | 当前 payload / 必测变体 |
| --- | --- | --- |
| 102 | Pairing Preference | `pairing-preference`；单个/多个 Pairing ID；Award/Avoid |
| 103 | Pairing Check-In / Check-Out Time | `pairing-check-time`；check-in/check-out；`=/< />/Between`；无日期/specific dates/date range；Award/Avoid |
| 107 | Flight Legs per Duty | `flight-legs-per-duty`；`=/< />/Between`；无日期/specific dates/date range；Any/Every；Award/Avoid |
| 110 | Work Day Preference | `work-day-preference`；工作日与时间窗口；日期范围；Award |
| 112 | Pairing Length | 当前 `pairing-length-preference`：min/max、specific dates/date range、Award/Avoid；历史兼容仅限 `stepper(value, operator)` 与 `stepper-range(from, to)`，两者都直接比较 `pairing.duration_days`，不附加日期范围 |
| 116 | Flight Number Preference | `flight-number-preference`；单个/多个航班号；日期范围；Award/Avoid |
| 117 | Redeye Preference | `redeye-preference`；无日期/specific dates/date range；Award/Avoid |
| 122 | Deadhead Flying | `deadhead-flying`；any-deadhead/deadhead-only-duty；日期范围；Award/Avoid |
| 129 | Time Between Flights | `duration`；`=/< />`；Any/Every；Award/Avoid |
| 163 | Month-End Carryover | `month-end-carryover`；`=/< />/Between`；Award/Avoid |
| 168 | Airport Preference | `airport-preference`；landing/layover/landing-or-layover；机场列表；日期范围；最短 layover；Award/Avoid |

实现时建立唯一的 Property 验证矩阵，每个 Property Code 至少记录：

- 当前 payload 类型；
- Award/Avoid 支持；
- Any/Every 是否适用；
- 时间基准（Base、出发机场、到达机场或 UTC）；
- 日期基准（Pairing origin、Duty、Segment、Check-In/Out、Layover）；
- 正常、边界、无事件和 `NULL` 行为；
- 独立 oracle SQL；
- 自动测试 case id。

实现开始时再次读取远端可见 catalog 并与上述 11-code 快照比较。若 catalog 已变化，先暂停并更新本规格，经用户确认后才能扩大或缩小范围。新增或恢复可见 Property 时，若没有矩阵条目和 PREVIEW 测试，应由门禁失败，而不是上线后才返回 422 或错误结果。

## 时间与日期规则

- Bid Period 边界以有效 Base 的 IANA 时区计算当地日期。
- Check-In / Check-Out 使用对应事件机场时区；机场时区缺失时不得猜测成本地或 UTC。
- Duty / Segment 日期必须使用该业务事件明确规定的机场时区。
- 跨午夜、月末跨出、DST 切换必须用时间戳和 IANA 时区计算，禁止用固定 UTC offset。
- `Between` 边界是否包含端点必须与 UI 文案和现有 Property contract 一致，并在每个条件族测试中显式断言。
- Month-End Carryover 必须以目标 Bid Period 的最后当地日为界，而不是服务器当前月份。

## 错误处理

- payload 不符合当前 Property contract：400，返回具体参数错误。
- Property 可见但 SQL handler 未实现：422，返回明确 Property 名称；验收门禁必须把这种情况视为失败。
- Crew 缺少 Base、Base 时区或 Rank 资格信息：明确业务错误，不返回全量 Pairing。
- Property 专属字段或事件缺失导致无法判定：正条件归一为 `false`；Pairing 保留在 eligible pool，并进入 Avoid 补集。
- 数据库失败：返回统一错误响应，不缓存失败结果。

## 缓存与性能

- 单 Property Preview 使用新的缓存语义版本（例如 `v3`），避免读取旧 SQL 语义产生的缓存结果。
- 单 Property Base 历史按请求解析，不复用当前仅缓存单一 Base/Rank 的 actor-context v2 值；Rank 可继续来自服务端 actor identity 查询。
- Preview 结果缓存继续使用 30 秒 TTL 和并发请求合并。单页结果允许的最大陈旧窗口明确为 30 秒；Base/Rank context 不得再额外叠加 60 秒陈旧窗口。
- 缓存键必须包含 Crew ID、Rank、Bid Period、完整 Property、页码、页大小、排序版本和语义版本；不能只包含 Base/Rank。
- Crew Base、Rank、Pairing、Composition、Segment 或 Airport timezone 更新后，在缺少现成业务失效事件的前提下，最迟必须在 30 秒 TTL 后可见；测试使用可控缓存时钟验证该上界。若已有同步事件可安全复用，则同时主动失效，但本任务不新增事件系统。
- Base 有效期改为按 Pairing 日期判断后，应避免逐 Pairing N+1 查询，使用 SQL join/lateral/range 条件一次完成。
- Summary 与分页必须来自同一过滤表达式，避免数量和列表不一致。
- 动态 SQL 遵守 `docs/modules/database/generated-sql-safety-standard.md`，需要结构审计、覆盖率门禁和远端 PostgreSQL 只读执行。

### 稳定分页

- 单 Property Preview 的唯一稳定顺序固定为：`local_origin_date ASC, sch_str_dt_utc ASC, pairing_label ASC NULLS LAST, pairing.id ASC`。
- `pairing.id` 是最终唯一 tie-breaker。
- 在数据库数据保持静态的验收窗口内遍历全部页面必须无重复、无遗漏，合并后的 ID 数必须等于 summary 的 `pairingIdCount`。
- 缓存按页存储，本次不承诺跨页数据库快照隔离；如果两页请求之间底层数据变化，允许下一次完整刷新后重新分页。本任务不引入完整 ID 集缓存或 snapshot generation。

## 测试设计

### 后端自动测试

1. 为冻结的 11 个 Property Code 及表中每个必测 payload 变体生成合法单条件 PREVIEW case；测试同时断言运行时可见 catalog 与冻结清单一致。
2. 每个 Property 至少覆盖 Award；支持 Avoid 的 Property额外验证严格补集。
3. 支持 Any/Every 的 Property 同时覆盖两种量词及空集合。
4. 时间类覆盖周期首末日、跨午夜、DST、具体日期和日期范围。
5. Base 变更覆盖 Pairing origin date 前后使用不同有效 Base。
6. Rank 不匹配、已删除 Pairing、缺失时区和无事件数据均有回归测试。
7. 校验 summary 总数、分页 ID 和详情加载目标来自同一集合。
8. 运行 generated SQL structural audit、coverage gate 和远端 PostgreSQL `EXPLAIN` / 最小只读执行。
9. 行级 `single_property` 缺失 period 必须失败；Current Rules、Criteria、All Pairings 的既有 period 行为由回归测试锁定。
10. 缓存版本、完整 key、30 秒最大陈旧窗口和稳定分页均有自动测试。

### Portal 自动测试

1. 点击任意行 PREVIEW 后，首次请求走 `single_property` payload 且只包含该行 Property，不发送 `criteria.properties[]`。
2. `action`、`bid`、`quantifier`、日期和时间参数完整保留。
3. 翻页和刷新不改变单条件请求。
4. 后端参数错误和不支持错误有明确页面反馈。

### Playwright

- 从真实 Pairing 页面点击 PREVIEW。
- 验证请求 payload 只有一个 Property。
- 对代表性条件族验证结果 ID、总数、翻页和返回流程。
- Award/Avoid 使用同一输入验证互补结果。

### 远端只读验收

- 针对每个条件族选择有真实数据的 Crew、周期和 Property。
- 用独立 SQL 计算 eligible pool 和 expected IDs。
- 将 PREVIEW 的完整分页结果与 oracle 比较，不只比较页面第一屏。
- 输出每个 Property 的 PASS/FAIL、基础池数量、Award 数量、Avoid 数量和允许的数据缺失说明。

### QA 文档

新增：

`docs/test-cases/pbs/pairing/<date>-single-property-preview.md`

覆盖前置条件、逐 Property 操作、预期结果、时间边界、Award/Avoid、Any/Every、异常和回归范围。

## 验收标准

1. 冻结清单中的 11 个 Pairing Property 均有 PREVIEW handler 和自动测试，不存在静默忽略；运行时可见 catalog 与清单不一致时门禁失败。
2. 行级 PREVIEW 初始请求只有一个 Property。
3. 结果全部属于 Crew 在对应时间可申请的 Pairing Pool。
4. Award/Avoid 在基础池内构成严格互补集合。
5. 所有条件族远端 oracle 对比通过。
6. 后端测试、Portal 测试、Playwright、generated SQL audit/coverage、build 和 lint 全部通过。
7. Current Rules AND/OR、算法导出和页面 UI 未发生非预期变化。
8. 单 Property Preview 缺失 period 不回退当前月；Base/时区/Rank 缺失不回退全量池。
9. 在静态数据验收窗口内完整分页无重复、无遗漏，Award/Avoid 严格互补。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 所有 Property 最终共享 eligible pool、时间表达式、Preview query、缓存键和 generated SQL coverage；并行修改相同核心文件冲突风险高。
- Suggested split: 单线按 eligible pool → Property 验证矩阵 → 条件族修复 → Portal/Playwright → 远端 oracle 顺序实施。
- Write boundaries: `pbs-server/src/services/pairing-search/**`、必要的 `pbs-portal` 行级 PREVIEW mapper/测试、对应 E2E 和 QA 文档。
- Conflict risk: 中高；多个实现者会同时修改 dispatcher、共享时间表达式和覆盖清单。
- Execution gate: 本规格经用户审核批准并形成实施计划后才能修改业务代码。

## Git 约束

本任务未经用户明确命令不得执行 `git add`、`git commit`、`git reset`、`git rebase`、`git push` 或其他 Git 历史/暂存区修改操作。规格文档也只写入工作区，不自动提交。
