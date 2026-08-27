# PBS Schedule Panel 布局常量位置调整设计

## 背景

`pbs-portal/src/shared/lib/schedule-panel-layout.ts` 只包含 `SharedBiddingWorkbenchLayout` 使用的两个布局常量，当前没有第二个消费者。它放在 `shared/lib` 容易让人误以为是跨模块通用工具。

历史上根 `.gitignore` 曾包含 `lib/`，会忽略任意层级的 `lib` 目录，因此该路径之前存在被忽略风险。该规则已在上一轮大文件拆分中移除，本次只处理文件位置语义。

## 目标

- 将布局常量移动到 `app/layout` 同域文件，表达它属于 workbench layout 的局部布局配置。
- 更新唯一引用方 `SharedBiddingWorkbenchLayout`。
- 不改变常量值、不改变 UI、不改变运行时行为。

## 实现方案

- 新增 `pbs-portal/src/app/layout/shared-bidding-workbench-layout.constants.ts`。
- 删除 `pbs-portal/src/shared/lib/schedule-panel-layout.ts`。
- 将 `shared-bidding-workbench-layout.tsx` 的 import 改为同域 constants 文件。

## 验收标准

- `SharedBiddingWorkbenchLayout` 定向测试通过。
- `pbs-portal` lint 和 build 通过。
- 当前不引入新的 `shared/lib` 文件。
