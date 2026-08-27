# PBS Reserve 已选条件 Bid 弹窗编辑设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 页面 `EXISTING RESERVE PROPERTIES` 已选条件区的前端交互与保存行为；本文件只定义需求和方案，不包含实现改动。

## 背景

Reserve 模块当前已经从早期 mock 壳升级为真实 bid 编辑页面：

- `Legacy Reserve` 模式支持：
  - `301 Short Call Type`
  - `302 Reserve Day On`
- `AA Prefer Off` 模式支持：
  - `311 Reserve Prefer Off`
- 用户点击日历日期新增当前模式对应的日期条件：
  - Legacy：新增 `302 Reserve Day On`
  - AA：新增 `311 Reserve Prefer Off`
- `ADD RESERVE BID` 手动新增区已经取消，Reserve 后续主交互改为日历点击新增。

当前问题是：右侧 `EXISTING RESERVE PROPERTIES` 是用户已经选好的条件列表，但行内 `bid` 控件仍可直接编辑。这和我们现在的 Reserve 主交互不一致：

- 日期类条件应该主要通过日历新增。
- 已选条件的 `bid` 修改应该更明确、更可控。
- `tier` 可以保留行内切换，因为它只是把同一条件归到不同层级。
- `bid` 如果要修改，应和 Pairing 一样通过编辑 icon 进入弹窗修改。

## 语义确认

`EXISTING RESERVE PROPERTIES` 的含义：

```text
当前用户已经保存 / 已经加入 draft 的 Reserve 条件。
```

因此该区域不是“选择新条件”的入口，而是“查看、删除、调整层级、必要时编辑已有条件”的入口。

## 目标

1. Reserve 已选条件列表中的 `bid` 列默认只读展示。
2. Reserve 已选条件列表中的 `tier` 仍可行内直接修改。
3. 每条已选条件显示编辑 icon。
4. 点击编辑 icon 后打开 Reserve 专用 bid 编辑弹窗。
5. 弹窗确认后调用现有 `PATCH /api/reserve-bids/current/properties/:propertyGroupKey` 保存。
6. 行内删除保持不变。
7. 日历点击新增保持不变。
8. 不影响 Pairing / Line / Days Off 现有右侧面板行为。

## 不做范围

- 不恢复 `ADD RESERVE BID` 手动新增区。
- 不改变 Reserve Legacy / AA 模式语义。
- 不改变 `301/302/311` 后端校验语义。
- 不新增后端接口。
- 不新增管理端 coverage 配置页面。
- 不实现批量编辑、多选删除、拖拽排序。
- 不把 Reserve 日期编辑复用 Days Off 的 weekday / weekend / date range 复杂模式。

## 方案比较

### 方案 A：继续行内编辑 bid

优点：

- 改动最小。
- 用户少一次点击。

缺点：

- 容易误改已有条件。
- 和日历点击新增的 Reserve 主交互冲突。
- `bid` 修改没有明确确认动作，不利于用户理解保存时机。

结论：不采用。

### 方案 B：完全复用 Days Off 弹窗

优点：

- 能复用一部分现有组件。
- 已有 `renderExistingPropertyEditDialog` 接入模式。

缺点：

- Days Off 弹窗包含 `dates / days_of_week / weekends / date_range` 等 Days Off 专属语义。
- Reserve 的 `302 Reserve Day On` 和 `311 Reserve Prefer Off` 当前只需要日期列表。
- 直接复用会让 Reserve 用户看到不该出现的 Days Off 交互。

结论：不采用。

### 方案 C：Reserve 专用轻量弹窗，复用共享右侧面板 edit dialog 插槽

优点：

- 和 Pairing 一样：行内只读，点击 icon 进入弹窗编辑。
- 弹窗内容可以严格收敛到 Reserve 语义。
- 不污染 Days Off / Pairing 的专用业务组件。
- 可复用共享右侧面板已经存在的 `renderExistingPropertyEditDialog` 保存链路。
- 后续如果 Reserve 增加 AA 专属属性，可以继续在 Reserve 弹窗内扩展。

缺点：

- 需要新增一个 Reserve 组件和对应测试。

结论：采用。

## 交互设计

### 已选条件行

在 `EXISTING RESERVE PROPERTIES` 中：

- `PROPERTY`：显示属性名。
- 删除 icon：保持现有行为。
- `BID`：只读展示，不允许行内直接输入、选择或删除 token。
- 编辑 icon：始终展示，用于打开 bid 编辑弹窗。
- `TIERS`：保持现有行内切换，切换后继续走现有 patch 保存。

说明：

- `bid` 只读不等于不能改；改入口是编辑 icon。
- `tier` 继续行内可改，因为它是轻量归属调整，不需要弹窗。

### Reserve Bid 编辑弹窗

弹窗标题建议：

```text
EDIT RESERVE BID
```

通用内容：

- 属性名。
- 当前 `bid` 编辑控件。
- 当前 tier 展示或可选项。
- `Cancel`。
- `UPDATE BID`。

各属性编辑方式：

#### 301 Short Call Type

使用现有 `PairingBidControl` 的 `select` 能力。

允许值继续来自后端 / catalog：

```text
CRAM, CRPM, PRAM, PRMM, PRPM, RESA, RESB
```

确认要求：

- 必须选择一个有效 call type。

#### 302 Reserve Day On

使用轻量日期列表编辑。

第一阶段可接受：

- 复用 `PairingBidControl` 的 `tag-list` 展示 / 输入能力；或
- 做 Reserve 专用日期输入列表。

推荐第一阶段：

```text
复用 PairingBidControl tag-list，但在弹窗里编辑，行内只读。
```

确认要求：

- 至少一个日期。
- 日期必须是 `YYYY-MM-DD`。
- 日期去重。

#### 311 Reserve Prefer Off

与 `302 Reserve Day On` 同样使用日期列表编辑。

区别只在语义：

- `302`：我想这天上 reserve。
- `311`：我想这天不要 reserve / 想休息。

确认要求：

- 至少一个日期。
- 日期必须是 `YYYY-MM-DD`。
- 日期去重。

## 数据流

1. 页面加载 `GET /api/reserve-bids/current`。
2. 前端按当前 mode 过滤展示已有属性：
   - Legacy：`301/302`
   - AA：`311`
3. 用户点击已有条件行的编辑 icon。
4. `RuleBidRightPanel` 通过 `renderExistingPropertyEditDialog` 打开 Reserve 专用弹窗。
5. 弹窗内部复制当前 property 为本地 draft。
6. 用户修改 `bid` 后点击 `UPDATE BID`。
7. `RuleBidRightPanel` 调用现有 `onUpdateProperty(propertyGroupKey, property, draftMeta)`。
8. `reserveService.patchCurrentDraftProperty` 请求后端 patch 接口。
9. 成功后更新 query cache、draft meta、existing properties。
10. 失败时保留原值并展示错误 toast。

## 组件设计

### 新增组件

建议新增：

```text
pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx
```

职责：

- 只负责 Reserve 已有条件的弹窗编辑。
- 不直接调用 API。
- 入参接收 `RuleBidExistingProperty`。
- 输出修改后的 `RuleBidExistingProperty`。
- 内部做最基本的前端校验。

### 调整 ReservePage

在 `ReservePage` 中为 `RuleBidRightPanel` 传入：

```text
renderExistingPropertyEditDialog
```

弹窗确认后仍走已有：

```text
handleUpdateProperty
```

### 调整共享右侧面板

当前共享右侧面板的 edit icon 和 `bid` 只读逻辑绑定在 `showModifiers` 上，这不适合 Reserve：

- Reserve 需要“显示编辑 icon + bid 只读”。
- Reserve 不需要 Pairing modifier 的 `All or Nothing / Minimum N` 行内展开编辑器。

建议为共享 `RuleBidRightPanel` 增加更明确的配置，避免误用 `showModifiers`：

```text
existingBidEditMode?: "inline" | "dialog"
```

语义：

- 默认 `"inline"`：保持现有 Line / 普通 rule-bid 页行为。
- `"dialog"`：已有属性行内 bid 只读，显示 edit icon，点击后走 `renderExistingPropertyEditDialog`。

也可选择较小改动：

```text
readOnlyExistingBid?: boolean
showExistingPropertyEditAction?: boolean
```

推荐使用 `existingBidEditMode`，因为它表达的是交互模式，不是单个 UI 开关。

## 后端影响

不新增接口。

继续使用：

```text
PATCH /api/reserve-bids/current/properties/:propertyGroupKey
```

后端仍按已有 Reserve validation 校验：

- `301` 只能保存合法 call type。
- `302` 只能保存日期列表。
- `311` 只能保存日期列表。

如果前端校验漏掉非法值，后端仍必须拒绝。

## 测试设计

### 前端组件测试

新增或更新 `reserve-page.test.tsx`：

1. Legacy 模式下已有 `302 Reserve Day On`：
   - 行内 `bid` 是只读。
   - 页面显示编辑 icon。
   - 点击编辑 icon 打开弹窗。
   - 修改日期后点击 `UPDATE BID` 调用 `patchCurrentDraftProperty`。

2. AA 模式下已有 `311 Reserve Prefer Off`：
   - 切换到 AA 后显示 `311`。
   - 点击编辑 icon 打开同一 Reserve 弹窗。
   - 修改日期后 patch payload 的 `propertyCode=311` 不变。

3. `tier` 行内仍可修改：
   - 点击 T2 后直接调用 patch。
   - 不需要打开弹窗。

4. `ADD RESERVE BID` 仍不出现。

### 共享组件测试

如果新增 `existingBidEditMode`，补充 `RuleBidRightPanel` 或相关测试：

- 默认模式仍允许行内 bid 编辑。
- dialog 模式下 bid readOnly，edit icon 可见。

### 后端测试

本次不要求新增后端测试，因为接口和校验不变。

如果实现时发现 patch payload 对 `301/302/311` 的校验覆盖不足，再补充 Reserve validation 测试。

## 验收标准

1. Reserve 页面 `EXISTING RESERVE PROPERTIES` 中的 bid 不能行内直接修改。
2. 已选条件行有编辑 icon。
3. 点击编辑 icon 能打开 Reserve bid 编辑弹窗。
4. 弹窗能修改 `301 Short Call Type`。
5. 弹窗能修改 `302 Reserve Day On` 日期列表。
6. 弹窗能修改 `311 Reserve Prefer Off` 日期列表。
7. `tier` 仍可行内修改并保存。
8. 日历点击新增日期条件仍正常。
9. `ADD RESERVE BID` 手动新增区仍隐藏。
10. Pairing / Line / Days Off 不被本次改动影响。
11. `pnpm --dir pbs-portal exec vitest run src/features/reserve/pages/reserve-page.test.tsx` 通过。
12. `pnpm --dir pbs-portal build` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次变更范围集中在 Reserve 前端交互和共享面板一个小开关，单 agent 顺序实现更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/reserve/*`，必要时少量调整 `pbs-portal/src/features/rule-bids/*`。
- Conflict risk: 中低。共享面板需要保证默认行为不变，避免影响 Pairing / Line / Days Off。
- Execution gate: 用户确认本 spec 后再开始实现。

