# PBS Pairing 配置弹窗还原 Portal 风格并修复长数据撑开 Spec

## 背景

`PairingPropertyConfigDialog` 在一次修复长列表溢出的改动中被迁移到了 `@rois/ui` 的 `AppDialog`。这个迁移解决了一部分高度约束问题，但带来了新的视觉问题：

- 蓝色标题栏、拖拽窗口感更像 Gantt / 管理工具，不符合 PBS Portal 员工端页面气质。
- 现在的 `Configure Pairing Number` 和 `Days Off`、`Line` 的配置弹窗风格不一致。
- 弹窗内部出现明显的多层滚动体验，长列表和表单区域的关系不清晰。

通过 git 历史核对，`129bd1e3` 之前的 Pairing 配置弹窗和当前 `Days Off` / `Line` 是同一类 Portal 轻量弹窗：

- 半透明灰色遮罩。
- 白色圆角卡片。
- 左上标题 `Configure Pairing Bid`。
- 第二行显示 property 名称。
- 右上普通关闭按钮。
- 底部右侧操作按钮。
- 没有蓝色 title bar，也没有可拖拽窗口语义。

因此当前要修正的不是“继续美化 AppDialog”，而是把 Pairing 配置弹窗还原到 Portal 原有弹窗体系，同时保留并正确修复当时的原始 bug：**数据过多时弹窗被撑开，底部操作按钮不可稳定访问**。

## 目标

1. `PairingPropertyConfigDialog` 还原为 PBS Portal 原有白色轻量弹窗风格。
2. 视觉上与当前 `DaysOffBidDialog`、`LineBidDialog` 对齐。
3. 不再使用 `AppDialog` 承载员工端 Pairing 配置弹窗。
4. 修复长数据场景：大量 `CONFIRMED RUNS` 不能把弹窗撑出浏览器视口。
5. 弹窗底部操作区 `CANCEL / SAVE FAVORITE / ADD BID / UPDATE BID` 始终稳定可访问。
6. 保留 Pairing Number 的现有业务能力：按 pairing number、entire month、specific date、confirmed runs 增删保存。
7. 保留 Search Pairings criteria 编辑入口和 Pairing 主页面添加 / 编辑入口的行为一致性。

## 非目标

- 不回滚 Pairing Number 相关业务功能。
- 不改变后端接口、数据结构或保存语义。
- 不迁移 `Days Off` / `Line` 弹窗。
- 不删除 `@rois/ui` 的 `AppDialog`。
- 不修改 Gantt 的弹窗标准。
- 不重做 Pairing Number 选择交互。
- 不在本次改动里建立全局 Portal 弹窗组件库；先恢复当前业务正确性和视觉一致性。

## 当前问题拆解

### 1. 弹窗外壳错误

当前 Pairing 配置弹窗使用 `AppDialog`：

- 顶部是蓝色标题栏。
- 标题文案是 `Configure Pairing Number`。
- 标准窗口 chrome 和 Portal 其他弹窗割裂。
- 用户会误以为这是后台管理 / Gantt 工具窗口，而不是员工端 bid 配置表单。

这个外壳应该恢复为原来的 Portal 弹窗：

- `Configure Pairing Bid` 作为主标题。
- property name 作为副标题。
- 关闭按钮在右上角。
- 主体和 footer 都在白色卡片内。

### 2. 原始长数据 bug 仍要修

原始弹窗的问题是容器没有可视区高度约束：

- `CONFIRMED RUNS` 很多时，列表直接把整个弹窗撑高。
- 弹窗顶部可能靠近或进入导航栏区域。
- 底部按钮可能贴底或不可见。
- 用户需要滚页面或无法稳定点击 `UPDATE BID`。

本次不能简单回到完全旧代码；必须在旧视觉基础上补齐高度和滚动规则。

### 3. 不能引入双主滚动

`AppDialog` 迁移后的问题之一是滚动层级变复杂。还原后应遵循：

- 弹窗外层不随内容无限增长。
- 弹窗 body 是主要滚动区域。
- footer 固定在弹窗底部。
- 避免同一方向出现多个同级主滚动条抢焦点。

`RUN DATE` 候选列表这类局部列表可以保留合理局部滚动；但 `CONFIRMED RUNS` 的长数据不能再撑开整个弹窗。

## 推荐方案

采用 **方案 A：还原 Portal 弹窗外壳，并在原壳层上修复高度约束**。

### 方案 A：还原 Portal 弹窗外壳并修复长列表（推荐）

实现方式：

- `PairingPropertyConfigDialog` 从 `AppDialog` 改回自建 Portal 弹窗外壳。
- 外层 overlay 仍使用 `fixed inset-0 z-50 flex items-center justify-center bg-[rgb(40_44_59_/_32%)]`。
- 弹窗容器使用原白色卡片样式，但补充：
  - `max-h-[calc(100vh-32px)]`
  - `flex flex-col`
  - `overflow-hidden`
- header 固定在顶部。
- body 使用：
  - `mt-5 min-h-0 flex-1 overflow-y-auto`
  - 表单内容保留原 `grid gap-4`
- footer 固定在底部，不进入 body 滚动区。
- `PairingPropertyDialogFooter` 保留原 Portal 按钮视觉，但可以取消内部 `mt`，由外壳负责 footer 间距。

优点：

- 和 `Days Off` / `Line` 保持同一员工端弹窗风格。
- 解决长列表撑开弹窗的根因。
- 不改变业务逻辑。
- 改动边界清晰，风险低。

缺点：

- Pairing 仍然是 feature-local 弹窗实现，不是共享组件；但这符合当前 Portal 现状，也避免一次性扩大范围。

### 方案 B：新增全局 `PortalDialog` 组件

实现方式：

- 在 `pbs-portal/src/shared/components` 新建 `PortalDialog`。
- 让 Pairing / Days Off / Line 后续都迁入同一个员工端弹窗组件。

优点：

- 长期一致性更好。
- 后续可以替代重复弹窗壳层。

缺点：

- 范围会扩大到多个模块。
- 当前用户明确要先还原 Pairing，不适合作为本次最小修复。

### 方案 C：继续使用 `AppDialog` 并局部美化

不推荐。

原因：

- 外壳方向已经不符合 Portal 员工端视觉。
- 即使内部布局改好，蓝色标题栏和拖拽窗口感仍然不对。
- 和 `Days Off` / `Line` 不一致。

## 详细设计

### 1. `PairingPropertyConfigDialog` 外壳

目标结构：

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(40_44_59_/_32%)]">
  <div
    aria-label={`Configure ${draft.name}`}
    className="max-h-[calc(100vh-32px)] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#dfe4ee] bg-white p-[18px] shadow-[0_18px_50px_rgb(20_24_38_/_22%)] flex flex-col"
    role="dialog"
  >
    <Header />
    <Body />
    <Footer />
  </div>
</div>
```

要求：

- 主标题恢复 `Configure Pairing Bid`。
- 副标题显示当前 property name，例如 `Pairing Number`。
- 右上角关闭按钮恢复原 Portal 轻量样式。
- pending / saving 时关闭按钮 disabled。
- 点击遮罩不关闭，避免丢未保存配置；与当前旧 Portal 弹窗行为保持一致。

### 2. Body 滚动

body 承载现有配置内容：

- `TIERS`
- `Award / Avoid`
- `Any / Every`
- `BID`
- `Credit Priority`
- `PairingPropertyRunSection`

body 样式建议：

```tsx
<div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
  <div className="grid gap-4">
    ...
  </div>
</div>
```

关键点：

- 弹窗高度不足时，只滚动 body。
- header 和 footer 不滚走。
- 不让内容继续撑高外层 dialog。

### 3. Footer 固定

`PairingPropertyDialogFooter` 保留现有按钮逻辑：

- `CANCEL`
- `SAVE FAVORITE`
- `ADD BID`
- `UPDATE BID`
- pending 文案和 disabled 逻辑不变。

调整方向：

- footer 放在 body 外。
- footer 区域 `shrink-0`。
- 视觉保持 Portal 白色弹窗按钮风格，不使用 `AppDialog` 的 muted footer bar。

建议外壳负责间距：

```tsx
<div className="mt-4 shrink-0 border-t border-[#edf0f6] pt-4">
  <PairingPropertyDialogFooter ... />
</div>
```

如果 border 视觉和 Days Off / Line 不一致，可以不加 border，仅保留固定 footer 和顶部间距；最终以 Portal 一致性为准。

### 4. `CONFIRMED RUNS` 长数据处理

`PairingPropertyRunSection` 继续承担 run 选择和 confirmed runs 展示。

修复原则：

- `CONFIRMED RUNS` 很多时，不能撑开外层 dialog。
- 删除 run、切换 occurrence mode、更新保存逻辑不变。
- `25 selected` 这类数量提示保留。
- 每条 run 的 `pairingNumber + originDate + remove` 显示不变。

推荐滚动策略：

- 弹窗 body 作为主滚动区域。
- `CONFIRMED RUNS` 列表不再负责撑开外层，因为外层已有 `max-height + body scroll`。
- 如果实际视觉仍然过长，可给 `CONFIRMED RUNS` 增加温和限高，但必须避免和 body 同时形成明显双主滚动。

### 5. 保留现有业务逻辑

以下函数和数据流不应改变语义：

- `handleTierToggle`
- `handleModeChange`
- `handleQuantifierChange`
- `handleBidChange`
- `addConfirmedOccurrence`
- `removeConfirmedOccurrence`
- `handleEntireMonthPairingToggle`
- `handleConfirm`
- `handleSaveFavorite`

Search Pairings 页面和 Pairing 主页面都复用同一个 `PairingPropertyConfigDialog`，两边入口必须同时通过。

## 受影响文件

预计修改：

- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-dialog-footer.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-run-section.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- `docs/test-cases/pbs/pairing/<date>-pairing-config-dialog-portal-shell.md`
- `pbs-portal/src/version.ts`
- `gantt/src/version.ts`

可能补充：

- `pbs-portal/AGENTS.md`：明确 PBS Portal 员工端业务弹窗不强制使用 Gantt 风格 `AppDialog`，应优先遵循 Portal 现有视觉体系。

## 验收标准

### 视觉验收

- `Configure Pairing Number` 打开后不再出现蓝色 `AppDialog` 标题栏。
- 弹窗样式与 `Days Off` / `Line` 的配置弹窗一致。
- 主标题显示 `Configure Pairing Bid`。
- 副标题显示当前 property 名称。
- 白色圆角卡片居中展示，遮罩色和旧 Portal 弹窗一致。

### 长数据验收

- 25 条或更多 `CONFIRMED RUNS` 不会把弹窗撑出视口。
- 弹窗顶部不被导航栏遮挡。
- 底部 `CANCEL / UPDATE BID` 始终可见或稳定固定在弹窗底部。
- body 可以滚动查看完整内容。
- 删除 confirmed run 后布局不跳坏，数量和保存结果正确。

### 业务验收

- 从 Pairing 主页面添加 `Pairing Number` 可以正常保存。
- 从 Pairing 主页面编辑 existing `Pairing Number` 可以正常保存。
- 从 Search Pairings criteria 编辑 `Pairing Number` 可以正常保存并刷新结果。
- `SAVE FAVORITE` 可用条件和保存行为不变。
- 普通短 property，例如 `Layover at City`、`Prefer Pairing Length`，弹窗视觉不退化。

## 测试计划

### Vitest

更新 Pairing 页面测试：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/pages/pairing-page.test.tsx --reporter=basic
```

覆盖点：

- 弹窗显示 `Configure Pairing Bid`。
- 弹窗副标题显示 property name。
- 长 confirmed runs 场景下 footer 按钮仍存在。
- `ADD BID` / `UPDATE BID` 保存逻辑不变。

更新 Search Pairings 页面测试：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx --reporter=basic
```

覆盖点：

- criteria 编辑入口打开同一 Portal 风格弹窗。
- 长 confirmed runs 编辑后仍可 `UPDATE BID`。
- 关闭 / 保存行为不变。

### Playwright

更新或新增 PBS Portal E2E：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/condition-default-favorites.spec.ts --reporter=list --config=config/playwright.config.ts --project=pbs-portal --no-deps
```

覆盖点：

- 在真实浏览器视口中打开长 confirmed runs 的 Pairing Number 配置弹窗。
- 断言 dialog bounding box 在 viewport 内。
- 断言没有蓝色 AppDialog 标题栏。
- 断言 `Configure Pairing Bid` 可见。
- 断言 `UPDATE BID` 可见并可点击。

### 标准验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm lint
pnpm build

cd /Users/lei/Codehub/rois-ai
npm run check:ui
git diff --check
```

## 风险和控制

- **风险：误回滚业务逻辑。** 控制：只还原弹窗 shell，不回滚 Pairing Number 数据处理函数。
- **风险：长列表又撑开弹窗。** 控制：外层 dialog 必须有 `max-height + flex column + overflow hidden`，body 必须 `min-h-0 flex-1 overflow-y-auto`。
- **风险：出现双主滚动。** 控制：body 是主滚动区域，confirmed runs 不再作为主要滚动容器，除非视觉验证证明必须局部限高。
- **风险：和根规范 `AppDialog` 描述冲突。** 控制：在 spec 中明确 PBS Portal 员工端弹窗属于 Portal 视觉体系，后续可补充 `pbs-portal/AGENTS.md` 明确边界。
- **风险：影响其他 Pairing property。** 控制：所有 Pairing property 仍共用 `PairingPropertyConfigDialog`，测试覆盖普通 property 和 Pairing Number property。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个弹窗壳层和相关测试的定向修复，多 agent 会增加同文件冲突和沟通成本。
- Suggested split: 不拆分。
- Write boundaries: Pairing 弹窗组件、Pairing/Search Pairings 相关测试、QA 文档、版本号。
- Conflict risk: 中等；核心文件 `pairing-property-config-dialog.tsx` 正在频繁迭代，必须避免其他窗口同时修改。
- Execution gate: 用户确认本 spec 后再实现。

## 结论

本次应把 Pairing 配置弹窗还原为 PBS Portal 原有白色轻量弹窗，而不是继续使用 `AppDialog`。同时必须保留当时修复长数据撑开弹窗的目标：通过 Portal 弹窗自身的 `max-height`、固定 header/footer、body 滚动来解决，而不是回到完全无高度约束的旧状态。
