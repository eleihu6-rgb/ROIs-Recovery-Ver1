# PBS Pairing Preference 筛选弹窗增强设计

## 状态

- 文档状态：待用户审阅
- 日期：2026-08-17
- 目标模块：`pbs-portal`、`pbs-server`
- 目标页面：Crew Portal / Bid / Configure Pairing Preference
- 目标区域：`PAIRINGS` picker 里的 `Filters` 按钮
- 明确约束：本需求只增强 Pairing Preference 选择 pairing 时的搜索筛选体验，不改变最终保存的 Pairing Preference bid 语义。

## 背景

当前 `Pairing Preference` bid 里，用户点击 `PAIRINGS` picker 后只能用少量筛选项缩小 pairing 列表：

- pairing start date range
- check-in time range
- check-out time range
- pairing length days min/max
- keyword search

Jen 提到现有筛选条件偏少，用户需要更多维度来找到目标 pairing，例如：

- layover 的个数
- layover station
- pairing 经过的 station
- credit hour 范围
- redeye
- 是否包含 deadhead / DHD

如果继续把这些字段直接平铺在表格上方，`PAIRINGS` 区域会被筛选控件挤占，pairing list 可视行数下降，弹窗会变得很乱。用户提出：点击 `Filters` 按钮时直接弹出一个设置搜索条件的弹窗。该方向合理。

## 目标

- 点击 `Filters` 按钮打开一个专门的 `Pairing Filters` 弹窗 / 面板。
- 把当前平铺的筛选项迁移到筛选弹窗中。
- 新增更多 Pairing Preference picker 筛选条件。
- 保持 `Configure Pairing Preference` 主弹窗清爽，表格上方只保留 keyword search、`Filters` 按钮、已选数量和结果表格。
- 筛选条件只影响当前 picker 的 pairing list，不影响已选中的 pairing。
- 筛选条件不进入保存的 bid payload；保存仍然只保存选中的 pairing id / label。
- 不改变 CSV export、algorithm、Current Bid / Standing Bid 保存后的业务语义。

## 非目标

- 不新增新的 Pairing bid property。
- 不把这些筛选条件保存进 `pairing-preference` bid。
- 不修改 `Search Pairings` 独立页面的筛选 UI；如果后续要同步，需要单独确认。
- 不给 `Search Pairings` 独立页面新增这些筛选控件；即使 contract 字段复用同一个 `PbsSearchPairingsPreviewFilters`，本轮 UI 入口也只在 `Pairing Preference` picker。
- 不重做整个 `Configure Pairing Preference` 主弹窗。
- 不改变 `Award / Avoid`、`Tiers`、`Save Favorite`、`Add Bid` 逻辑。
- 不引入新的 UI 框架。
- 不做数据库 migration，除非实现阶段证明现有索引无法满足性能要求并另开 SQL 优化任务。

## 推荐方案

### 方案 A：表格上方 inline expander

点击 `Filters` 后在表格上方展开所有筛选控件。

优点：

- 实现相对简单。
- 不涉及弹窗内再开弹窗的 focus/z-index 问题。

缺点：

- 新增字段多时会占用 pairing list 高度。
- 控件密度会很高，视觉上仍然拥挤。
- 后续再加筛选项会继续恶化。

### 方案 B：`Filters` 打开局部筛选弹窗 / 面板（推荐）

点击 `Filters` 后，在 `Configure Pairing Preference` 主弹窗上方打开一个较小的 `Pairing Filters` 弹窗 / 面板。用户在里面设置筛选条件，点击 `Apply Filters` 后刷新 pairing list。

优点：

- 主 pairing table 保持整洁。
- 适合承载更多字段和分组。
- `Cancel` / `Apply` 语义清晰，用户知道这是筛选结果，不是保存 bid。
- 后续扩展空间更好。

缺点：

- 需要处理主配置弹窗内的二级弹窗体验。
- 需要明确 focus、Escape、Cancel、Apply、Clear All 行为。

### 方案 C：右侧抽屉式 filter panel

点击 `Filters` 后从 picker 右侧滑出筛选 panel。

优点：

- 视觉上不完全遮挡表格。
- 可长时间保持打开。

缺点：

- 当前 Pairing Preference 主弹窗宽度已经很大，内部再做抽屉容易和表格、footer 冲突。
- 对当前 Portal 轻量弹窗风格不是最小改动。

推荐采用方案 B。

## 交互设计

### 主弹窗

`Configure Pairing Preference` 主弹窗保持现有结构：

1. title
2. tiers
3. preference
4. pairings picker
5. footer

`PAIRINGS` picker 顶部保留：

- 搜索输入框：`Search pairing, base, route, or rank...`
- `Filters` 按钮
- `selected / total` 计数

`Filters` 按钮行为：

- 未启用筛选时显示 `Filters`。
- 已启用筛选时显示 active filter 数量 badge，例如 `Filters 3`。
- 点击打开 `Pairing Filters` 弹窗。

### Pairing Filters 弹窗

弹窗标题：`Pairing Filters`

弹窗副标题可省略，避免冗余说明。

弹窗 footer：

- `Clear All`
- `Cancel`
- `Apply Filters`

行为：

- 打开弹窗时，draft filters 从当前 applied filters 初始化。
- `Cancel` / 关闭按钮 / Escape：放弃本次 draft 修改，保留当前已应用筛选。
- `Apply Filters`：校验通过后应用 draft，关闭弹窗，pairing list 重置到 page 1 并重新请求。
- `Clear All`：清空 draft；用户仍需点击 `Apply Filters` 才应用清空。若产品希望一键清空并刷新，可在实现前再确认。
- 筛选变化不清空 selected pairings。
- 已选 pairing 即使被当前筛选条件隐藏，也继续保留在 selected chips 中。

### 弹窗可访问性与焦点

本筛选弹窗是 `Configure Pairing Preference` 内部的临时筛选工具，不是新的业务配置主弹窗。为避免嵌套完整 `PbsDialogFrame` 带来双 overlay / 双 footer / z-index 冲突，本轮允许使用 feature-local 的轻量 `PairingPreferenceFilterDialog`，但必须遵守 Portal 白色轻量弹窗视觉：

- 不使用 `@rois/ui` `AppDialog`。
- 弹窗使用 `role="dialog"` 和 `aria-modal="true"`。
- 标题通过 `aria-labelledby` 关联。
- 打开后初始焦点进入第一个可编辑筛选控件；如果没有可编辑控件，则进入关闭按钮。
- Tab focus trap 限制在 filter dialog 内。
- Escape 等同于 `Cancel`，关闭并恢复焦点到 `Filters` 按钮。
- `Cancel` / close 不应用 draft。
- 字段级错误必须关联到对应控件，例如 `aria-invalid` + `aria-describedby`；汇总错误可用 `role="alert"`，但不能散落成普通红字。

## 筛选字段设计

### Basic

| 字段 | UI | 后端 filter | 当前能力 |
|---|---|---|---|
| Pairing start dates | date range | `originDateFrom` / `originDateTo` | 已有 |
| Check-in | time range | `timeFrom` / `timeTo` | 已有 |
| Check-out | time range | `releaseTimeFrom` / `releaseTimeTo` | 已有 |
| Pairing length | min/max number, suffix `days` | `durationDaysMin` / `durationDaysMax` | 已有 |

### Stations

| 字段 | UI | 后端 filter | 当前能力 |
|---|---|---|---|
| Route station | multi-select airport/station | 复用或映射到现有 `airports` | 部分已有 |
| Layover station | multi-select airport/station | 新增 `layoverAirports` | 需要补 |

说明：

- `Route station` 表示 pairing 经过的 station，命中 `dep_arp`、`arv_arp`、`duty_str_arp`、`duty_end_arp` 任一字段。
- `Layover station` 只命中真实 layover station，即有 overnight layover 的 `duty_end_arp`。
- 选项来源优先复用 `/pairing-search/airport-options` 返回的 `filterAirports` / `layoverAirports`。

### Layovers

| 字段 | UI | 后端 filter | 当前能力 |
|---|---|---|---|
| Layover count | min/max number | `layoverCountMin` / `layoverCountMax` | 需要补 |

说明：

- Layover count 以 pairing 内 overnight layover duty 数为准。
- 推荐计算口径：`pairing_segment.duty_layover_nits > 0` 的 duty / segment 去重计数。
- 实现前必须核对 `pairing_segment` 的 duty 粒度，避免同一 duty 多航段被重复计数。

### Credit

| 字段 | UI | 后端 filter | 当前能力 |
|---|---|---|---|
| Total credit | HH:MM min/max | `creditMinutesMin` / `creditMinutesMax` | 已有 |

说明：

- UI 输入用 `HH:MM`，例如 `4:00`、`8:30`。
- 前端转换为 minutes 后提交给后端。
- 后端继续使用现有 pairing total credit expression。

### Attributes

| 字段 | UI | 后端 filter | 当前能力 |
|---|---|---|---|
| Redeye | checkbox / toggle | `hasRedeye` | 需要补 |
| Deadhead / DHD | checkbox / toggle | `hasDeadhead` | 需要补 |

说明：

- `Redeye` 使用当前系统已配置的 redeye definition，不在前端硬编码时间段。
- `Deadhead / DHD` 表示 pairing 包含任意 deadhead segment / duty。
- 本筛选只是搜索条件，不等同于保存 `Redeye Preference` 或 `Deadhead Flying` bid。
- 本期 `Redeye` / `Deadhead` 只支持“包含该属性”的正向筛选：
  - unchecked / 未设置 = `Any`，payload 不包含字段。
  - checked = payload 包含 `hasRedeye: true` 或 `hasDeadhead: true`。
  - 不提交 `false`，避免和“未设置 filter”混淆。
  - 不实现 `No Redeye` / `No DHD` 排除筛选；如用户后续需要，再改成三态 `Any / Yes / No`。

## API / Contract 设计

现有 request：

```ts
type PbsSearchPairingsPreviewFilters = {
  pairingScope?: "fly";
  pairingNumber?: string;
  pairingNumbers?: string[];
  originDateFrom?: string;
  originDateTo?: string;
  airport?: string;
  airports?: string[];
  timeFrom?: string;
  timeTo?: string;
  query?: string;
  releaseTimeFrom?: string;
  releaseTimeTo?: string;
  durationDaysMin?: number;
  durationDaysMax?: number;
  creditMinutesMin?: number;
  creditMinutesMax?: number;
}
```

新增建议：

```ts
type PbsSearchPairingsPreviewFilters = {
  // existing fields...
  layoverAirports?: string[];
  layoverCountMin?: number;
  layoverCountMax?: number;
  hasRedeye?: true;
  hasDeadhead?: true;
}
```

兼容原则：

- 保留现有 `airports` 字段用于 route station / any station。
- 新字段只用于 `preview.mode === "all_pairings"`。
- 没有设置的 filter 不出现在 payload。
- `hasRedeye` / `hasDeadhead` 只接受 `true` 或缺省；不接受 `false`。
- 后端 schema 必须拒绝非法值：
  - invalid airport code
  - min > max
  - negative count
  - invalid credit minutes
  - `hasRedeye: false` / `hasDeadhead: false`

Search Pairings 兼容要求：

- 独立 `Search Pairings` 页面本轮不新增 UI 控件。
- 如果该页面复用 `previewAllPairings` service 或共享类型，现有行为必须保持不变。
- 需要补一条回归测试，证明 Search Pairings 不因为新增 contract 字段而显示新的 filter UI 或改变现有请求。

## 前端设计

主要文件：

- `pbs-portal/src/features/pairing/components/pairing-preference-picker.tsx`
- `pbs-portal/src/features/pairing/components/pairing-preference-picker-filters.ts`
- 可新增：`pairing-preference-filter-dialog.tsx`
- 可复用：`PbsDatePicker`、已有 preference primitives、airport multi-select / option 查询能力。

推荐结构：

```text
PairingPreferencePicker
  Search row
  Filters button
  PairingPreferenceFilterDialog
  Results table
  Selected chips
  Pagination
```

状态划分：

- `appliedFilterDraft`：当前真正影响 query 的 filters。
- `filterDialogDraft`：弹窗内正在编辑但尚未应用的 filters。
- `activeFilterCount`：根据 applied filters 计算。
- `query`：保留现有 debounce keyword search，不纳入 filter dialog。

实现纪律：

- `Apply Filters` 后重置 page 到 1。
- `Clear All` 不清 keyword search，除非后续明确要求。
- `selected` map 不受筛选变化影响。
- 表格总数以当前 filters 后的 total 为准。
- 过滤条件校验错误显示在 filter dialog 内，不在主表格红字散落。
- 保留现有 check-in overnight 行为：`timeFrom > timeTo` 表示跨午夜范围，不作为非法输入。
- Check-out time 继续遵守现有行为：`releaseTimeFrom > releaseTimeTo` 仍然非法。
- 日期、number range、credit range、layover count range 继续要求 `from <= to` / `min <= max`。

## 后端设计

主要文件：

- `pbs-server/src/routes/pairing-search.ts`
- `pbs-server/src/routes/pairing-search.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-*`

### Route station

继续使用现有 `airports` 过滤逻辑：

- `dep_arp`
- `arv_arp`
- `duty_str_arp`
- `duty_end_arp`

### Layover station

新增 `layoverAirports`：

- 只匹配 `duty_end_arp`
- 必须满足 `duty_layover_nits > 0`
- `is_deleted = 0`

### Layover count

新增 `layoverCountMin` / `layoverCountMax`：

- 使用一个 correlated subquery 或 CTE 统计 pairing 的 layover count。
- 必须避免同一 duty 多 segment 被重复计数。
- 如果没有可靠 duty key，需要先在实现阶段核对 `pairing_segment` 字段，例如 `duty_seq` / `duty_no` / `duty_id`。

### Redeye

新增 `hasRedeye`：

- 使用现有 redeye config 解析逻辑。
- 语义：pairing 至少有一个 segment / duty 命中当前 redeye definition。
- 不在前端写死 redeye start/end time。

### Deadhead

新增 `hasDeadhead`：

- 语义：pairing 包含任意 deadhead segment / duty。
- 具体字段需要实现阶段核对当前 `pairing_segment` / mapper 中 deadhead 判断来源。
- 不能用 UI 文案或 pairing number 猜测 DHD。

## 性能要求

- 筛选条件应用后仍走 `POST /api/pairing-search/preview` 分页，不一次性拉全量 pairing。
- 后端不能做 N+1 查询。
- `layover count`、`hasRedeye`、`hasDeadhead` 优先在单条 SQL 中完成。
- 对新增动态 SQL filter 必须补 SQL preflight / route test。
- 对新增动态 SQL filter 必须执行远端 PostgreSQL `EXPLAIN` 或最小只读执行验证，不能只靠 TypeScript build 或 mock 测试。
- 对 `POST /api/pairing-search/preview` 新字段必须做 route smoke。
- 不影响主 `Configure Pairing Preference` 首屏打开速度；筛选弹窗内容需要的 options 可以懒加载或复用已有 airport options query。

## 测试策略

### 前端单元 / 组件测试

- `pairing-preference-picker-filters.test.ts`
  - build filters：credit HH:MM 转 minutes。
  - build filters：route station / layover station 输出正确字段。
  - active count：每组条件计数稳定。
  - validation：date/time/count/credit min-max。

- `pairing-preference-picker.test.tsx`
  - 点击 `Filters` 打开 filter dialog。
  - 打开后初始焦点进入第一个筛选控件，Escape 关闭后焦点回到 `Filters` 按钮。
  - `Cancel` 不改变 applied filters。
  - `Apply Filters` 后请求带新 filters，page 重置到 1。
  - `Clear All` 清空 draft，不清 selected pairing。
  - selected pairings 在筛选变化后仍保留。
  - 字段校验错误使用 `aria-invalid` / `aria-describedby` 关联对应控件。

### 后端测试

- `pairing-search.test.ts`
  - route schema 接收新 filters。
  - route schema 拒绝非法 ranges / airport codes / negative count。
  - route schema 拒绝 `hasRedeye: false` / `hasDeadhead: false`。
  - Search Pairings 独立页面相关 mock / route 不出现新增 filter UI 行为变更。

- `pairing-search-preview-query.test.ts` 或现有 query tests
  - `layoverAirports` 生成只匹配 layover station 的 SQL。
  - `layoverCountMin/Max` 不重复统计同一 duty。
  - `hasRedeye` 使用 redeye config。
  - `hasDeadhead` 使用真实 deadhead 字段。
  - 组合 filters 能与 `pairingScope: "fly"`、date、credit 一起工作。
  - 新增动态 SQL filter 有 SQL preflight 和远端 PostgreSQL `EXPLAIN` / 最小只读执行记录。

### Playwright

- 打开 `Configure Pairing Preference`。
- 点击 `Filters`。
- 设置：
  - date range
  - credit range
  - route station
  - redeye 或 DHD
- 点击 `Apply Filters`。
- 断言：
  - `Filters` 按钮显示 active count。
  - table 总数 / 行内容发生筛选。
  - 选中一个 pairing 后重新打开 filters 修改条件，已选 pairing chip 不消失。
  - `Add Bid` 保存 payload 仍只包含 pairing ids / labels，不包含 filters。

### UI 标准

- 运行 `npm run check:ui`，hard violations 必须为 0。
- 运行 `cd pbs-portal && npm run lint`。
- 运行 `cd pbs-portal && npm run build`。
- 运行 focused Vitest 和 Pairing Preference Playwright。

## 验收标准

- `Filters` 不再 inline 展开一大片控件，而是打开独立的 `Pairing Filters` 弹窗 / 面板。
- 主 `PAIRINGS` table 上方保持清爽。
- 用户可以通过新增条件筛 pairing：
  - route station
  - layover station
  - layover count
  - credit hours
  - redeye
  - DHD
- 筛选条件只影响列表，不影响已选 pairing。
- 保存 bid 后 payload 不包含 filters。
- `Clear All`、`Cancel`、`Apply Filters` 行为清楚且可测试。
- 后端新 filters 有 schema validation 和 SQL 测试。
- 无数据库 migration。

## 风险

- Nested dialog / panel 可能带来 focus、z-index、Escape 行为冲突；实现时要用局部 overlay 或明确的 `role="dialog"` 管理焦点。
- `layover count` 的去重口径必须核对真实 `pairing_segment` 粒度，不能重复统计多航段 duty。
- `Redeye` 和 `DHD` 必须使用系统已有权威定义，不能前端猜。
- 组合筛选会增加 SQL 复杂度，需要关注响应时间和 query plan。
- 如果后续要求 Search Pairings 页面同步筛选 UI，需要另做复用设计，避免把本任务扩大。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该需求横跨前端筛选弹窗、后端 filter contract / SQL、测试与性能验证，天然可拆分。
- Suggested split:
  - Agent A：前端 Pairing Preference filter dialog UI、draft/apply/clear 交互和组件测试。
  - Agent B：后端 `PbsSearchPairingsPreviewFilters` contract、route schema、SQL filters 和后端测试。
  - Agent C：Playwright / QA 测试案例与最终回归验证。
- Write boundaries:
  - Agent A 只写 `pbs-portal/src/features/pairing/components/pairing-preference-*` 及前端测试。
  - Agent B 只写 `packages/contracts/pbs-search-pairings.d.ts`、`pbs-server/src/routes/pairing-search*`、`pbs-server/src/services/pairing-search*` 及后端测试。
  - Agent C 只写 `e2e/tests/pbs-portal/*` 和 `docs/test-cases/pbs/pairing/*`。
- Conflict risk: 中等，前后端 filter 字段 contract 是共享边界，需要主 agent 先固定字段名和语义。
- Execution gate: 用户审阅并确认本 spec 后，再进入实现；实现前先对目标 symbols 执行 GitNexus impact。
