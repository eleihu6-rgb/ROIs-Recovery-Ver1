# PBS Existing BID 用户可读摘要设计

## 阅读说明

这份文档是给产品和开发一起确认的用户可读 spec。它只描述 `EXISTING ... PROPERTIES` 里 `BID` 展示方式的改造方案，不包含代码实现，也不改变接口或数据库。

## 背景

上一轮已经把 `EXISTING ... PROPERTIES` 从 input-like 表格改成只读列表卡片，解决了“看起来像可输入表单”的问题。但 Pairing 页面暴露出新的核心问题：`BID` 内容虽然完整显示了，却仍然是原始拼接文本。

典型问题：

```text
Award · E4101 on 2026-06-05; E4103 on 2026-06-05, 2026-06-08, ...
```

这类文本对系统来说是完整的，但对用户来说不可读：

- `BID` 里把 action、property、pairing number、日期全部压进一段 paragraph。
- `Pairing Number` 的多值内容没有分组结构，用户要自己在一长串里找 pairing。
- `Award ·` 只出现一次，但后续其实对应多个 pairing/date 组合，语义层级不明显。
- 当前灰底文本块视觉重量太重，像一个巨大的 disabled input。
- 行内 `TIERS / COUNT / ACTIONS` 都被长文本撑出的高度影响，视觉重心不平衡。

这次设计目标不是“显示更多”，而是把 `BID` 转换成用户可扫读、可理解、可验证的摘要。

## 目标

- 让 Existing `BID` 从“原始字符串”变成“用户可读摘要”。
- 对复杂 bid，尤其 `Pairing Number`，按业务对象分组展示。
- 默认保持列表紧凑，避免一个 long bid 把整页撑得过高。
- 用户需要时可以查看完整条件，不丢失信息。
- 保留现有编辑、预览、删除、tier toggle、count 行为。
- 复用现有数据结构，不改后端 API 和 draft schema。

## 非目标

- 不改变用户保存 bid 的数据结构。
- 不改变 pairing 搜索、pairing preview、pool count 的计算逻辑。
- 不改变 `FAVORITED PROPERTIES` / `ALL PROPERTIES` 的排序逻辑。
- 不重新设计整个 Existing 卡片布局。
- 不引入新的 UI 依赖。
- 不做后端聚合接口。

## 当前问题拆解

### 1. `formatPairingBidValue` 只适合短摘要

当前 `pbs-portal/src/features/pairing/pairing-bid-summary.ts` 的 `formatPairingBidValue` 会把不同 bid 类型格式化为一段字符串。对短条件合理，例如：

- `Award · 08:00`
- `Between 2026-06-18 - 2026-06-21`
- `Work 3-5 days, then at least 3 days off`

但对 `pairing-id-list` 这类多对象、多日期的 bid，不适合继续使用单段字符串。

### 2. Pairing Number 需要对象化展示

从用户角度，`Pairing Number` 的内容不是一串 token，而是：

```text
Action: Award
Property: Pairing Number
Items:
- E4101: Jun 05
- E4103: Jun 05, Jun 08, Jun 10, Jun 12, Jun 19
- E4106: Jun 02, Jun 04, Jun 06, Jun 07, Jun 09, Jun 11, Jun 16
```

用户关注的是：选了哪些 pairing，每个 pairing 对应哪些日期，总数量是多少。

### 3. 默认完整展开会破坏列表节奏

如果每个 long bid 都完整展开，Existing 区会被一条 bid 撑得很高。用户扫读多个规则时会困难。

因此需要：

- 默认显示摘要 + 前几组。
- 超出内容折叠。
- 提供 `Show all` / `Show less` 或详情弹层。

## 方案对比

### 方案 A：只优化字符串格式

做法：

- 把 `;` 换成换行。
- 把 `on` 统一格式化。
- 继续在同一个文本块里展示。

优点：

- 改动最小。
- 不需要新组件。

缺点：

- 仍然是字符串堆叠，不是真正的结构化摘要。
- 多 pairing / 多日期场景仍然难扫读。
- 无法自然支持折叠、统计、分组。

结论：不推荐。它只是让长字符串稍微好看一点，没有解决核心问题。

### 方案 B：按 bid 类型输出结构化摘要模型（推荐）

做法：

- 新增一个前端-only summary builder，把 `PairingBidValue` 转成 UI 可消费的摘要模型。
- 短 bid 输出 `text` 类型。
- `pairing-id-list` 输出 `grouped-list` 类型。
- UI 根据摘要模型渲染不同布局。

示例模型：

```ts
{
  kind: "grouped-list",
  headline: "Award · Pairing Number · 25 pairings",
  groups: [
    { label: "E4101", values: ["Jun 05"] },
    { label: "E4103", values: ["Jun 05", "Jun 08", "Jun 10"] }
  ],
  totalCount: 25,
  overflowCount: 18
}
```

优点：

- UI 语义清晰，不再依赖一段长字符串。
- 可按 bid 类型逐步扩展，不影响后端契约。
- 容易测试：输入 bid，断言输出结构。
- Pairing / Days Off / Line 可共享短文本摘要逻辑，只对复杂类型定制。

缺点：

- 需要新增 summary model 和 renderer。
- 需要更新一批测试。

结论：推荐。它是最小但正确的结构化方案。

### 方案 C：默认只显示 headline，完整内容放弹窗

做法：

- Existing 行只显示 `Award · Pairing Number · 25 pairings`。
- 点击 `View details` 打开弹窗展示完整 grouping。

优点：

- 列表最干净。
- 长内容不会撑高行。

缺点：

- 用户无法在列表中直接核对前几个关键条件。
- 增加一次点击，降低日常检查效率。
- 弹窗设计和测试成本更高。

结论：可作为后续增强，不作为第一阶段。

## 推荐方案

采用方案 B：前端 summary builder + 结构化 renderer。

第一阶段只覆盖 Existing 区域的 `BID` 展示，重点处理 `Pairing Number / pairing-id-list`。其他短 bid 继续走文本摘要，但视觉上改成更轻的 summary block。

## 目标展示

### Pairing Number 默认态

```text
PROPERTY          BID                                      TIERS       COUNT        ACTIONS
Pairing Number    Award · Pairing Number · 25 pairings      T1          25 pairings  edit preview delete
                  E4101  Jun 05
                  E4103  Jun 05, Jun 08, Jun 10, +2 more
                  E4106  Jun 02, Jun 04, Jun 06, +4 more
                  +12 more pairings                         Show all
```

### Pairing Number 展开态

```text
Award · Pairing Number · 25 pairings
E4101  Jun 05
E4103  Jun 05, Jun 08, Jun 10, Jun 12, Jun 19
E4106  Jun 02, Jun 04, Jun 06, Jun 07, Jun 09, Jun 11, Jun 16
E4108  Jun 04
...
Show less
```

### 短 bid 默认态

```text
Award · Pairing Total Credit
08:00
```

或：

```text
Prefer Off
Between Jun 18 - Jun 21
```

短 bid 不需要 `Show all`。

## 视觉设计原则

### 1. BID 不再像 disabled input

当前灰底块太像 disabled input。改为轻量摘要区：

- 去掉强 input 边框感。
- 背景使用很浅的 tint 或透明。
- 字体权重降低，避免整块文本压迫感。
- headline 使用稍强字重，内容行使用普通字重。

建议样式：

```text
headline: text-sm font-semibold text-[#3f4656]
body:     text-xs/13px or text-sm normal text-[#667085]
chip:     light border, small radius
```

### 2. 信息分层

`BID` 区内分三层：

1. headline：用户先知道这条规则是什么。
2. sample groups：用户扫读前几项。
3. overflow action：用户知道还有多少隐藏内容，并能展开。

### 3. 列表默认不能被一条 bid 撑爆

默认最多展示：

- pairing groups：3 组。
- 每组日期：最多 3 个日期。
- 超出显示 `+N more`。

展开后显示完整内容，但仍要控制最大高度：

- 展开区域最大高度约 `220px-280px`。
- 超出内部滚动。
- 不让整个页面被一条 bid 无限撑高。

### 4. 日期格式要用户友好

当前 `2026-06-05` 可读但偏硬。建议在 summary 内显示：

- 同一年同月：`Jun 05`
- 跨月：`Jun 30`, `Jul 01`
- 不建议在摘要里重复年份，除非跨年。

原始 ISO 日期可保留在 `title` 或详情 tooltip。

## 数据与格式化规则

### `pairing-id-list` 数据来源

现有类型：

```ts
{ type: "pairing-id-list"; pairingIds: string[]; pairingLabels?: string[] }
```

当前 `pairingLabels` 可能包含展示文本，例如：

```text
E4101 on 2026-06-05
E4103 on 2026-06-05
```

第一阶段可以从 `pairingLabels` 解析：

- pairing code：`E4101`
- date：`2026-06-05`

如果 label 不符合预期格式，则 fallback 到原始 label，不丢信息。

### 分组规则

- 按 pairing code 分组。
- 每组日期按原始顺序或日期升序展示；推荐日期升序。
- 相同 pairing/date 去重。
- 总数使用实际 selected pairing occurrence 数量，不是 pairing code 分组数量。

示例：

```text
E4103 on 2026-06-05
E4103 on 2026-06-08
E4103 on 2026-06-10
```

显示为：

```text
E4103  Jun 05, Jun 08, Jun 10
```

### headline 规则

Pairing Number：

```text
{Action} · Pairing Number · {N} pairings
```

如果没有 action：

```text
Pairing Number · {N} pairings
```

如果只有 1 个：

```text
Award · Pairing Number · 1 pairing
```

短 bid：

```text
{Action / Quantifier} · {Property Name}
{Formatted Value}
```

## 组件设计

### 新增 summary builder

建议新增：

```text
pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts
```

职责：

- 输入 `PairingExistingProperty`。
- 输出结构化 summary model。
- 不渲染 React。
- 可单独单测。

建议类型：

```ts
type ExistingBidSummary =
  | {
      kind: "text";
      headline: string;
      value: string;
      title: string;
    }
  | {
      kind: "grouped-list";
      headline: string;
      groups: Array<{
        key: string;
        label: string;
        values: string[];
        rawValues: string[];
      }>;
      totalItemCount: number;
      collapsedGroupLimit: number;
      collapsedValueLimit: number;
      title: string;
    };
```

### 新增 renderer

建议新增或放在 Pairing table 内部：

```text
ExistingBidSummaryView
```

职责：

- 根据 summary model 渲染文本 / grouped-list。
- 管理 `expanded` 状态。
- 提供 `Show all` / `Show less`。
- 输出稳定 aria label，便于测试。

### Rule Bid 页面处理

Days Off / Line 当前主要是短 bid。第一阶段可以只做视觉轻量化，不强制引入 grouped-list：

- 使用同一套 `summary block` 样式。
- 不做 pairing-specific 分组。
- 继续使用 `renderBidSummary` / `formatPairingBidValue`。

如果后续 Days Off 也出现超长日期列表，可以复用同一 summary model 增加 `date-list` 类型。

## 交互细节

### Show all / Show less

- 只在 grouped-list 且内容超过折叠限制时出现。
- 文案：`Show all 25 pairings` / `Show less`。
- 点击只展开当前行，不影响其他行。
- mutation pending 不影响展开/收起，因为这是纯展示。

### Preview icon 的关系

- `Preview` 仍保留在 `ACTIONS`。
- `Show all` 只展开摘要，不替代 preview。
- Preview 仍用于打开完整 pairing 详情或现有 preview 逻辑。

### Count 的关系

- `COUNT` 仍显示 pool count，例如 `25 pairings`。
- `BID` headline 中的 `25 pairings` 表示用户选中的 pairing occurrence 数量。
- 如果这两个数字可能不同，不能混淆：
  - headline 可写 `25 selected`。
  - COUNT 仍写 `25 pairings`。

第一阶段建议 headline 用 `25 selected`，避免和 pool count 语义冲突。

## 测试策略

### 单元测试

新增 `pairing-existing-bid-summary.test.ts`：

- `pairing-id-list` 能按 pairing code 分组。
- 同一 pairing 多日期能合并展示。
- 日期按升序或确定顺序输出。
- label 解析失败时 fallback，不丢内容。
- headline 正确处理 `Award / Avoid / 无 action`。
- 单复数：`1 selected` / `25 selected`。

### 组件测试

更新 `pairing-page.test.tsx`：

- Existing `Pairing Number` 不再是一段长 paragraph。
- 显示 headline：`Award · Pairing Number · 25 selected`。
- 默认只显示前几组。
- 出现 `Show all 25 selected`。
- 点击展开后能看到完整分组。
- `COUNT`、`TIERS`、`ACTIONS` 仍可见。

### E2E 测试

更新或新增 PBS Portal E2E：

- 打开 `Pairing` 页面。
- mock 或准备一个包含多 pairing/date 的 existing `Pairing Number` bid。
- 断言用户能看到分组摘要，而不是长串文本。
- 点击 `Show all`，断言完整内容可见。
- 点击 `Show less`，断言恢复折叠。

### UI 标准验证

- `npm run check:ui`
- `pbs-portal npm run lint`
- `pbs-portal npm run build`
- 相关 Vitest / Playwright。

## 验收标准

- `Pairing Number` long bid 默认不再显示为单段长字符串。
- 用户一眼能看懂：这是 `Award Pairing Number`，共有多少 selected items。
- 用户能看到前几组 pairing 和对应日期。
- 用户能展开查看完整列表。
- `BID` 视觉不再像 disabled input。
- `TIERS / COUNT / ACTIONS` 不被长文本挤压或视觉上漂浮失衡。
- 原有 edit / preview / delete / tier toggle 行为不回退。
- 自动化测试覆盖解析、折叠、展开和原有 actions 保留。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次主要集中在 `pbs-portal` 前端展示、formatter、组件测试和一个 E2E 文件，文件范围紧密耦合，多 agent 并行会增加冲突。
- Suggested split: 不建议拆分；一个实现者顺序完成 summary builder、renderer、测试和样式校准即可。
- Write boundaries: 主要限于 `pairing` summary / table 组件、相关 tests、QA 文档、版本号。
- Conflict risk: 中等；和刚完成的 Existing 列表卡片样式在同一组件内，多个 agent 同时编辑容易冲突。
- Execution gate: 用户确认本 spec 后再实施；实施前先确认当前工作区没有未提交冲突改动。

## 实施顺序建议

1. 新增 `pairing-existing-bid-summary.ts` 和单测。
2. 新增 `ExistingBidSummaryView`，先只用于 Pairing Existing 行。
3. 调整 Pairing Existing `BID` 样式为轻量 summary block。
4. 增加折叠/展开逻辑。
5. 更新 `pairing-page.test.tsx` 和 PBS Portal E2E。
6. 如视觉稳定，再决定是否把轻量 summary block 样式同步给 Days Off / Line。
7. 更新 QA 用例和版本号。

## 风险与注意事项

- `pairingLabels` 的格式可能不是永远稳定，解析失败必须 fallback。
- `COUNT` 和 selected item count 语义不同，文案不能混淆。
- 展开状态必须是本地 UI 状态，不能影响 draft 或 query cache。
- 不要为了这个展示改后端结构；当前阶段前端可解决。
- 避免再把 long bid 放入 input-like 灰框，否则会回到当前问题。
