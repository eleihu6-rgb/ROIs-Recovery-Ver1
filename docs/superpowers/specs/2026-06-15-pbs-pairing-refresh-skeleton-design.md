# PBS Pairing Counts Refresh 骨架屏一致性设计

日期：2026-06-15  
状态：已确认，已实现  
范围：PBS Portal `/fpqe/pbs/pairing` 与 Dashboard 共享工作台中的 Pairing counts refresh 体验

## 背景

`EXISTING PAIRING PROPERTIES` 顶部和行级 counts 已支持手动刷新，以及在部分结构变更后自动刷新。

当前实现里，`refreshPairingPoolCounts(...)` 进入 loading 时会保留上一次 `response`：

```ts
setPairingPoolCounts((current) => ({
  tier,
  status: "loading",
  response: current.response,
}));
```

而行级骨架屏只在 `status === "loading" && response === null` 时显示。因此当用户之前已经刷新过 counts，再次手动刷新、右侧 add/delete 自动刷新、左侧 calendar add 自动刷新时，界面会显示 `Refreshing / Calculating...`，但行级 count 仍保留旧值，看起来不像真的在刷新。

用户口径：刷新就应该有刷新的样子。增加、删除、左侧增加、手动 refresh 都应该出现骨架屏。

## 目标

所有 Pairing counts refresh 入口进入 loading 时，行级 count 区域统一显示骨架屏。

覆盖入口：

- 手动点击 `REFRESH`。
- 右侧 `ADD PAIRING PROPERTIES` 添加成功后的自动刷新。
- 右侧 existing pairing property 删除成功后的自动刷新。
- 左侧 `BIDDING CALENDAR` 添加 Pairing bid 成功后的自动刷新。
- 左侧 calendar Tx 切换触发的 counts 自动刷新也按 refresh 处理，显示骨架屏。

## 非目标

- 不改变 stale 行为：edit property / tier toggle 如果仍只是标记 `Counts need refresh`，不显示骨架屏，直到用户真正触发 refresh。
- 不改变 count API。
- 不改变 counts 成功、失败文案。
- 不改变 existing property row 的布局尺寸。

## 推荐方案

修改 `refreshPairingPoolCounts(...)` 的 loading 状态写入逻辑：

```ts
setPairingPoolCounts({
  tier,
  status: "loading",
  response: null,
});
```

这样所有调用 `refreshPairingPoolCounts(...)` 的入口都会自然满足：

```ts
pairingPoolCounts.status === "loading" && pairingPoolCounts.response === null
```

从而统一显示行级骨架屏。

推荐理由：

- 这是最小改动，所有 refresh 入口复用同一条状态链路。
- 不需要为手动 / 自动 / 左侧 / 右侧分别加特殊分支。
- 骨架屏行为和用户对 refresh 的预期一致。
- 旧 response 不会在刷新期间误导用户。

## 备选方案

### 方案 A：所有 refresh 清空 response（推荐）

优点：

- 行为一致。
- 改动小。
- 容易测试。

缺点：

- 刷新期间旧 count 不再保留，视觉会比之前更明显。

### 方案 B：只对新增行显示骨架，已有行保留旧 count

优点：

- 视觉更稳定。

缺点：

- 不符合“刷新就应该有刷新的样子”的口径。
- 实现复杂，需要区分旧 row 和新 row。
- 手动 refresh 仍可能看起来没有明显刷新。

### 方案 C：顶部 loading，但行级保持旧 count

优点：

- 当前行为接近这个方案。

缺点：

- 用户已经明确认为这不符合预期。

## 验收标准

- 手动点击 `REFRESH` 后，所有 existing pairing property 行的 count 区域显示骨架屏。
- 右侧添加 Pairing condition 成功后，自动刷新期间显示骨架屏。
- 右侧删除 Pairing condition 成功后，自动刷新期间显示骨架屏。
- 左侧 `BIDDING CALENDAR` 添加 Pairing bid 成功后，自动刷新期间显示骨架屏。
- 左侧 Tx 切换触发自动刷新期间显示骨架屏。
- counts 返回成功后，骨架屏消失并显示最新 count。
- counts 返回失败后，骨架屏消失并显示现有错误状态。
- edit / tier toggle 只进入 stale 时，不显示骨架屏。

## 测试计划

更新 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`：

- 修改“Tx 切换刷新期间”的测试：刷新中应看到 row skeleton，而不是旧 row count。
- 增加或更新手动 refresh 测试：已有成功 count 后再次点击 `REFRESH`，刷新期间应显示 row skeleton。
- 更新右侧 add 自动刷新测试：add 成功后的 pending count 阶段应显示 row skeleton。
- 更新右侧 delete 自动刷新测试：delete 成功后的 pending count 阶段应显示 row skeleton。
- 更新左侧 calendar add 自动刷新测试：left add 成功后的 pending count 阶段应显示 row skeleton。
- 保留 tier toggle stale 测试：stale 不显示 skeleton。

验证命令：

```bash
cd pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx
npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx
npm run build
```

## 实现结果

- `refreshPairingPoolCounts(...)` 进入 loading 时统一清空旧 `response`。
- 手动 `REFRESH`、右侧 add 自动刷新、右侧 delete 自动刷新、左侧 calendar add 自动刷新、Tx 切换自动刷新都会让行级 count 区域显示骨架屏。
- count 成功返回后，骨架屏消失并展示最新 count。
- stale 行为未改变：edit / tier toggle 仍只显示 `Counts need refresh`，不触发 skeleton。
- 左侧 calendar add 的自动 refresh 仍使用添加后的 properties 快照。

## 验证结果

已执行：

```bash
cd pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx
npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx
npm run build
npm test -- --run
```

结果：

- `pairing-page.test.tsx`：54 tests passed。
- `shared-bidding-workbench-layout.test.tsx`：33 tests passed。
- `npm run build`：通过。
- `npm test -- --run`：61 test files / 430 tests passed。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是 Pairing right panel 的局部 loading 状态调整，改动集中，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/` 相关组件与测试；本 spec 文档。
- Conflict risk: 低；主要风险是测试中需要控制 pending promise 才能观察 skeleton。
- Execution gate: 用户确认本 spec 后再进入实现。
