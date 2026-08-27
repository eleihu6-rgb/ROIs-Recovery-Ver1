# PBS Line 同条件不同 Tier 合并设计

## 背景

Line 页面现在允许把同一个 property、同一个 BID、但不同 tier 的条件保存成多行。例如：

- `Min Credit Window / Enabled / T2`
- `Min Credit Window / Enabled / T1`

这两行在业务含义上是同一个 Line 条件应用到多个 tier，页面上应该合并显示成一行：`T1 + T2`。否则 existing conditions 列表会变长，也会让用户误以为这是两个不同条件。

## 目标

- Line 模块中，同一条件再次选择不同 tier 时，合并到已有行。
- 一个条件行仍然只代表一个 `propertyCode + bid + modifier` 组合。
- 完全重复的同 tier 添加仍然拦截，不能重复制造相同 tier。
- 不影响 Pairing / DaysOff 行为。
- 不破坏上一轮 Line 逐条 mutation、pending 锁、2 秒性能要求。

## 合并规则

只在以下字段都一致时合并：

- `propertyCode`
- `bid` 内容完全一致
- `allOrNothing`
- `minimumN`

合并动作只合并 active tiers：

- 已有 `T2`，新增同条件 `T1`：合并成一行 `T1,T2`。
- 已有 `T1,T2`，新增同条件 `T2`：拦截为重复，不发多余请求。
- BID 不同、日期不同、范围不同、modifier 不同：保持独立行，不合并。

## 推荐实现

采用“新增时转 patch”的方案。

当前 Line add 已经走 `POST /line-bids/current/properties`。这次调整为：

1. 前端点击 Add 前先找 existing properties 中是否有同条件不同 tier 的行。
2. 如果没有同条件行，继续走当前 `POST`。
3. 如果有同条件行：
   - 计算 tier 并集。
   - 如果并集没有新增 tier，提示重复，不调用接口。
   - 如果并集有新增 tier，调用现有 `PATCH /line-bids/current/properties/:propertyGroupKey` 更新这条已有行。
4. 成功后前端 cache 替换该行 tiers，不新增第二行。
5. 后端也补一层保护：`addCurrentDraftProperty` 遇到同条件不同 tier 时合并到已有 propertyGroupKey，避免绕过前端时仍产生重复行。

## 可选方案对比

### 方案 A：前端 add 转 patch，后端兜底合并（推荐）

优点：用户点击后立即保持一行显示；复用已有 PATCH API；后端也保证数据不会继续分裂。

代价：前端 add handler 需要知道“合并候选行”，测试要覆盖 POST 和 PATCH 两条路径。

### 方案 B：只后端合并，前端仍调用 POST

优点：前端改动少。

代价：POST 返回需要扩展成“新增或合并”的语义，前端 cache 仍需判断是插入新行还是更新旧行，合同更容易变复杂。

### 方案 C：加载 draft 时只做展示合并

优点：最少改写入逻辑。

代价：数据库里仍然存多行，后续编辑/删除会很混乱，不推荐。

## 验收标准

- 截图中的两条 `Min Credit Window / Enabled / T1|T2` 合并成一行。
- 新增同条件不同 tier 时，existing list 不增加行数，只更新同一行 tiers。
- 快速点击仍然不会产生请求风暴。
- 完全重复同 tier 仍然被拦截。
- BID 不同的 Line 条件不会被误合并。
- `npm run verify:pbs` 通过。
- Line add / patch / delete 真实接口探针仍低于 2 秒。

## 测试计划

自动化测试：

- `line-page.test.tsx` 覆盖 add 同条件不同 tier 时调用 patch，不调用 post。
- `line-page.test.tsx` 覆盖完全重复同 tier 不调用接口。
- `rule-bids/utils.test.ts` 覆盖同条件 tier 并集合并 helper。
- `line-bids.test.ts` 覆盖后端 POST 遇到同条件不同 tier 时返回既有 `propertyGroupKey` 并合并 tier。

QA 测试案例：

- 新增 `docs/test-cases/pbs/line/2026-05-09-line-identical-property-tier-merge.md`。
- 覆盖同 BID 合并、不同 BID 不合并、重复同 tier 拦截、快速点击、刷新后仍保持合并。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Line add/patch 语义、RuleBid 工具函数和对应测试，文件耦合较强，多代理会增加冲突。
- Suggested split: 不拆。
- Write boundaries: PBS Line 前端、PBS Line 后端、contracts、Line 测试与 QA 文档。
- Conflict risk: 中等，主要在上一轮刚改过的 Line mutation 文件。
- Execution gate: 用户确认本设计后进入实现。
