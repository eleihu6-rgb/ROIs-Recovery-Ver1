# PBS Prefer Off 周末定义调整设计

状态：已批准并实现
日期：2026-07-20

## 1. 背景

Days Off 的 `Prefer Off` 条件支持 `Weekends` 模式。当前周末定义由 Live 数据字典动态提供：

- 开始：Friday 00:00
- 结束：Sunday 24:00

业务要求将周末定义调整为：

- 开始：Saturday 00:00
- 结束：Sunday 24:00

本项目尚未上线，不要求兼容旧的“Friday–Sunday”业务含义。已经保存为 `Weekends` 的 bid 或 favorite 不保存具体星期日期，而是保存语义值 `Weekends`；因此配置生效后，已有数据也应立即按新的 Saturday–Sunday 定义解释，不做历史数据转换。

## 2. 目标

1. `Prefer Off > Weekends` 页面显示 `Saturday 00:00 – Sunday 24:00`。
2. 周末计数仍表示完整的 Saturday–Sunday 周末块数量。
3. 保存、校验、Prefer Off 日历事件、Pairing 指定日期冲突校验和算法导出均只展开 Saturday、Sunday，不再因 `Weekends` 规则包含 Friday。
4. 已有 `Weekends` bid 和 favorite 自动采用新定义。
5. Local、SIT、UAT 三个环境均读取到相同的新定义。

## 3. 非目标

- 不修改 `Specific Dates`、`Date Range`、`Days of Week` 或 `Time Window` 行为。
- 不改变通用 Bidding Calendar 对周末的视觉定义。
- 不修改 `Weekends` payload 格式。
- 不删除或重写已有 bid、favorite。
- 不将 Saturday/Sunday 硬编码到前端或业务服务。
- 不修改 2026-07-10 的历史 migration。

## 4. 已确认设计

### 4.1 数据字典是唯一配置源

继续使用 `PBS_PREFER_OFF` 数据字典：

| code | 当前值 | 新值 |
|---|---:|---:|
| `WEEKEND_START_DOW` | `FRI` | `SAT` |
| `WEEKEND_START_TIME` | `00:00` | 不变 |
| `WEEKEND_END_DOW` | `SUN` | 不变 |
| `WEEKEND_END_TIME` | `24:00` | 不变 |

只调整 `WEEKEND_START_DOW`，不引入新的配置项。

### 4.2 现有数据采用动态重解释

现有 bid/favorite 保存的是：

```text
Weekends
```

而不是 Friday、Saturday、Sunday 的日期快照。因此：

- migration 不更新 bid/favorite 表；
- 不删除现有 `Weekends` 数据；
- 读取、校验、日历生成和算法导出时，统一使用当时生效的数据字典配置；
- 配置改为 `SAT` 后，旧数据与新数据都展开为 Saturday–Sunday。

### 4.3 编辑器 UI 不新增硬编码

现有编辑器已经根据服务端返回的配置生成 `WEEKEND DEFINITION` 文案。正常情况下无需修改组件业务逻辑，只更新测试 mock 和断言。

如果实施时发现任何 Friday 的前端 fallback 或固定文案，只做最小修改，使其继续从配置派生，不在前端直接写死 Saturday。

### 4.4 Prefer Off 日期消费者统一使用配置展开

当前 Prefer Off 日期提取逻辑只识别 ISO 日期和日期范围，并主动忽略 `Weekends`。该逻辑同时服务于 Bidding Calendar 和 Pairing 指定日期的 Days Off 冲突校验。因此本次必须修改生产代码，不能只调整字典和测试。

共享日期展开路径应：

1. 获取当前 bid 的 `periodCode` 和同一份 `PbsPreferOffConfig`；
2. 复用 `expandPreferOffBidValues()` 展开 `Weekends`，不另写 Saturday/Sunday 算法；
3. 让 `buildPreferOffDatesByTier`、`buildPreferOffCalendarEvents` 和 `loadPreferOffDayOffDatesByTier` 使用同一展开结果；
4. 为展开后的 Saturday、Sunday 生成 `prefer_off_bid` 日历事件；
5. 不为 Friday 生成由该 `Weekends` 规则产生的事件；
6. 保留 Specific Dates 和 Date Range 的现有事件行为；
7. 同一 tier、同一日期继续去重；
8. 配置不可用或展开无效时，不生成虚假的 Weekends 事件，并沿用当前服务的错误/降级约定。

该修改同时覆盖已有 `Weekends` bid：配置更新后，不需要用户重新保存即可在日历中看到新的 Saturday–Sunday 事件。

### 4.5 Pairing 指定日期冲突校验

`validateSpecificDatePairingDayOffConflicts` 必须向 Prefer Off 日期加载路径传入当前 `periodCode` 和相同的 `PbsPreferOffConfig`。

对于仅包含 `Weekends` 的 Days Off bid：

- Pairing occurrence 落在 Saturday 或 Sunday 时，按现有规则返回 Days Off 冲突；
- Pairing occurrence 落在 Friday 时，不得仅因为 `Weekends` 规则返回冲突；
- 显式 Friday Days Off 仍应正常产生冲突。

不能在 Pairing 服务中再实现一套周末算法。

### 4.6 完整周末块规则

周末块从 Saturday 开始，到紧随其后的 Sunday 结束。只有开始和结束日期都位于当前 bidding period 内，才计为一个完整周末。

以 June 2026 为例，应得到 4 个周末块、8 个日期：

- Jun 6–7
- Jun 13–14
- Jun 20–21
- Jun 27–28

Jun 5、12、19、26 四个 Friday 不得进入展开结果。

## 5. 数据库 migration 设计

### 5.1 新增 forward migration

新增独立 migration，不编辑已经执行过的历史 migration。migration 只允许匹配：

```sql
parent_code = 'PBS_PREFER_OFF'
and code = 'WEEKEND_START_DOW'
```

执行规则：

1. 当前值为 `FRI`：更新为 `SAT`。
2. 当前值为 `SAT`：视为已执行，零变更成功。
3. 目标行不存在、存在重复行或当前值为其他内容：直接失败并停止，禁止静默插入或覆盖未知配置。
4. 保留并更新必要的审计字段；执行账号使用项目现有 migration 约定，不把账号或密码写入脚本和文档。

### 5.2 三环境执行边界

PBS 服务从部署环境配置的 `LIVE_SCHEMA.dictionary` 读取该配置，不是从 `f8_pbs`、`f8_sit_pbs`、`f8_uat_pbs` 等 PBS 业务 schema 读取。

migration 不得依赖执行会话当前的 `search_path`，也不得把 `f8` 硬编码为所有环境的目标。执行时必须通过明确的 migration 参数（例如 `psql -v live_schema=<verified_schema>`）传入已核实的 `LIVE_SCHEMA`。

脚本在事务内使用安全的 identifier quoting 访问 `${LIVE_SCHEMA}.dictionary`，并在更新前断言：

- `LIVE_SCHEMA` 符合小写 PostgreSQL identifier 规则；
- 目标 schema 存在；
- 目标 `dictionary` 表存在；
- 精确目标行唯一；
- 当前值只能是 `FRI` 或 `SAT`。

不得通过字符串拼接未校验的 schema 名，也不得无 schema 限定地执行 `UPDATE dictionary`。

执行前必须记录三个环境各自实际连接的：

- host 标识；
- database；
- `LIVE_SCHEMA`；
- migration 前的 `WEEKEND_START_DOW` 值。

不得在日志或文档中输出密码。

执行矩阵：

| 环境 | 更新目标 | 验证目标 |
|---|---|---|
| Local | Local PBS 配置所指向的 `LIVE_SCHEMA.dictionary` | Local 服务接口与页面 |
| SIT | SIT PBS 配置所指向的 `LIVE_SCHEMA.dictionary` | SIT 服务接口与页面 |
| UAT | UAT PBS 配置所指向的 `LIVE_SCHEMA.dictionary` | UAT 服务接口与页面 |

如果三个环境实际指向同一个 database/schema，则 migration 只对该唯一物理目标执行一次，不能为了“执行三次”重复假装更新同一行；之后仍需通过 Local、SIT、UAT 三个服务入口分别验证。若它们指向不同数据库，则逐库执行。

### 5.3 执行回执

每个唯一物理目标都必须记录：

- migration 前值；
- 首次执行影响行数；
- migration 后值；
- 第二次执行影响行数应为 0；
- Local/SIT/UAT 各自服务实际返回 `SAT` 的验证结果。

## 6. 缓存与发布

Days Off 服务对 Prefer Off 配置使用 5 分钟进程内缓存。数据库更新不会保证所有已运行实例立刻刷新。

部署顺序：

1. 执行并验证 migration。
2. 滚动重启该环境的全部 PBS Server 副本，或等待全部仍在运行的副本缓存完整过期。
3. 不以数据库查询结果代替服务验证。
4. 分别通过 Local、SIT、UAT 的负载均衡真实入口多次调用 Days Off draft/config 数据路径，避免只命中单个副本；确认响应稳定返回：
   - `startDayCode = SAT`
   - `startDayName = Saturday`
   - `startTime = 00:00`
   - `endDayCode = SUN`
   - `endDayName = Sunday`
   - `endTime = 24:00`
5. 再执行真实页面 Playwright 回归。

本次不新增缓存失效机制；5 分钟 TTL 属于既有行为，发布阶段通过全部实例滚动重启或等待所有实例过期解决。

### 6.1 新环境 bootstrap

`PBS_PREFER_OFF` 当前由既有 migration 链建立，而不是普通 seed。新建环境必须完整执行 migration 链，再执行本次 forward migration；本次不在 seed 中重复维护同一套配置，避免出现两个权威来源。

## 7. 影响范围

### 7.1 预期需要修改

- 新的 SQL migration；
- Prefer Off 配置读取测试数据；
- Prefer Off 校验与日期展开测试；
- Days Off 算法导出测试；
- Portal mock、组件测试与页面测试中旧的 Friday 预期；
- Prefer Off Bidding Calendar 事件生成逻辑及其测试；
- Pairing 指定日期与 Prefer Off Days Off 冲突校验调用链及其测试；
- Prefer Off Playwright 回归；
- PBS Days Off 人工测试用例。

### 7.2 预期无需修改

- `Weekends` payload contract；
- bid/favorite 持久化结构；
- Prefer Off 编辑器生产组件逻辑；
- 通用 Bidding Calendar 周末样式逻辑；
- 数据库 schema。

实施时若代码检查发现预期外的生产逻辑硬编码，必须先说明原因和影响，再进行最小范围修正。

## 8. 验收标准

### 8.1 页面

- 打开 `Configure Prefer Off`，切换到 `Weekends`。
- `WEEKEND DEFINITION` 显示 `Saturday 00:00 – Sunday 24:00`。
- June 2026 显示 `4 weekends`。
- 可保存并重新打开，仍保持 `Weekends` 模式和相同定义。

### 8.2 业务规则

- June 2026 的 `Weekends` 展开结果只包含 Jun 6–7、13–14、20–21、27–28。
- `Weekends` 规则不在校验日期、Prefer Off 日历事件或算法导出中产生 Friday。
- Pairing 指定日期落在该 `Weekends` 规则展开的 Saturday/Sunday 时会被现有 Days Off 冲突规则阻止；Friday 不会因该规则被阻止。
- 显式选择 Friday 的 `Days of Week`、`Specific Dates` 或其他合法业务数据仍可产生 Friday，不受本次调整影响。
- 已有 `Weekends` bid/favorite 无需重存即可按新定义展示与导出。

### 8.3 数据库与环境

- 每个唯一 Local/SIT/UAT Live 字典目标的最终值都是 `SAT`。
- migration 可重复执行，第二次为零变更。
- 三个环境的服务响应和真实页面均验证通过。

## 9. 测试计划

### 9.1 Contract / 单元测试

更新 `packages/contracts/pbs-prefer-off.js` 相关测试或其现有调用方测试，覆盖：

- Saturday–Sunday 展开；
- June 2026 为 4 个周末块、8 个日期；
- Friday 不在结果中；
- period 边界只计算完整周末块。

### 9.2 PBS Server

更新并运行：

- Prefer Off dictionary config 构造测试；
- Days Off draft 校验测试；
- existing bid/favorite 动态重解释测试；
- Prefer Off 日历事件测试：已有 `Weekends` bid 生成 Saturday/Sunday 事件且不生成 Friday；
- Prefer Off 日历的 Specific Dates、Date Range 和 tier/date 去重回归；
- Pairing 指定日期冲突测试：Saturday/Sunday 冲突、Friday 不因 `Weekends` 冲突、显式 Friday Days Off 仍冲突；
- Days Off algorithm export 测试；
- 在隔离其他 Friday 来源的 fixture 中，由 `Weekends` 规则展开产生的 Friday 行数为 0，Saturday/Sunday 按 tier 正确计数。

### 9.3 PBS Portal

更新 mock 和组件测试，断言：

- 页面文案为 `Saturday 00:00 – Sunday 24:00`；
- weekend count 正确；
- 保存 payload 仍是 `Weekends`，不变成具体日期数组。

### 9.4 Playwright

真实 UI 回归必须：

1. 进入 Bid 页面；
2. 打开 Days Off → Prefer Off；
3. 选择 `Weekends`；
4. 断言 Saturday–Sunday 文案和周末数量；
5. 保存 bid；
6. 重新打开并确认状态；
7. 验证现有 `Weekends` bid 在配置更新后按新定义显示；
8. 验证 Bidding Calendar 的 Prefer Off 事件只落在该规则展开的 Saturday/Sunday。

### 9.5 必跑检查

实施完成后至少执行：

- 相关 contract / server Vitest；
- 相关 portal component test；
- Prefer Off Playwright；
- `npm run check:ui`（若任何前端生产代码或样式发生变化）；
- migration 在每个唯一目标上的首次与第二次执行；
- Local、SIT、UAT 三环境服务验证。

最终交付必须逐项报告具体命令及 PASS/FAIL，不以代码阅读代替运行结果。

## 10. 风险与控制

### 风险 1：更新了错误的 schema

控制：以每个环境的 `LIVE_SCHEMA` 配置为准，执行前打印无敏感信息的 host/database/schema 标识，并查询目标行。

### 风险 2：数据库已更新但页面仍显示 Friday

控制：处理每个服务进程各自的 5 分钟缓存；滚动重启全部副本或等待所有副本过期，并通过真实入口多次请求及页面验证作为完成条件。

### 风险 3：测试只改文案，算法仍包含 Friday

控制：同时覆盖 contract 日期展开、server 校验、算法导出和 Playwright。

### 风险 4：已有 bid 被错误迁移或删除

控制：migration 只更新字典一行，明确禁止触碰 bid/favorite 数据。

### 风险 5：编辑器已正确但左侧日历遗漏 Weekends

控制：日历生产路径复用共享 `expandPreferOffBidValues()`，并增加已有 `Weekends` bid 的日历回归测试。

### 风险 6：日历已正确但 Pairing 冲突校验仍忽略 Weekends

控制：`loadPreferOffDayOffDatesByTier` 与日历事件复用相同展开结果，并增加 Saturday/Sunday/Friday 三类 Pairing 冲突回归。

## 11. 回滚

若业务决定恢复旧定义，使用新的显式 forward migration 将 `WEEKEND_START_DOW` 从 `SAT` 改回 `FRI`，并按相同三环境和缓存流程发布。

回滚不修改 bid/favorite；语义值 `Weekends` 会随配置恢复为 Friday–Sunday。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在共享配置、紧密关联的日期展开/日历/Pairing 冲突调用链及贯穿测试，数据库执行又必须按环境顺序核对；并行编辑容易在相同 fixture、calendar service 和 migration 范围产生冲突，协调成本高于收益。
- Suggested split: 单一实施者完成 migration、共享日期展开调用链、测试更新、三环境执行与验证。
- Write boundaries: 不拆分。
- Conflict risk: 多人同时修改 Prefer Off 测试 fixture 和环境 migration 时风险较高。
- Execution gate: 用户审阅并明确批准本 spec 后才能开始实现；执行数据库和提交 Git 仍按用户后续授权进行。
