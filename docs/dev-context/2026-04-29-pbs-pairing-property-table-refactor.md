# PBS Pairing property table 展示组件重构记录

时间：2026-04-29
范围：`pbs-portal`

## 本批目标

- 继续拆薄 `PairingRightPanel`，把 property 表格展示职责从主流程组件中移出。
- 不改变 Pairing 页面交互、按钮文案、aria-label、保存/收藏/预览/layer toggle 语义。
- 保持现有 Pairing 定向测试、`pbs-portal` lint/build 和 PBS 全量回归可验证。

## 已处理项

### 1. 新增 property table 展示组件

新增文件：

- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`

提供组件：

- `PairingPropertyTableHeader`
- `ExistingPairingPropertyRow`
- `AvailablePairingPropertyRow`
- `PairingAvailablePropertiesEmptyState`

这些组件只负责表头、行内容、按钮、inline bid editor 和空状态展示；实际状态变更仍通过 `PairingRightPanel` 传入的回调完成。

### 2. 收束主组件 JSX

修改文件：

- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`

处理内容：

- 移除主组件内重复的 existing / available property 行 JSX。
- 保留 `PairingRightPanel` 对搜索、分页、draft 保存、favorite mutation、rule conflict 和 query cache patch 的控制权。
- 将可添加属性的编辑面板展开/收起逻辑命名为 `toggleAvailablePropertyEditor`，避免在 JSX 中直接展开状态更新表达式。

### 3. 小幅减少重复派生

在 `AvailablePairingPropertyEditor` 中，同一个 `propertyCode` 的 action、quantifier、operator 选项只在组件渲染时各读取一次，替代原 JSX 中对 action / quantifier helper 的重复调用。

## 不变项

- `pairingService` 调用顺序不变。
- optimistic favorite、失败回滚、draftVersion 合并语义不变。
- Add、favorite、edit、preview、layer toggle 按钮的文案和 aria-label 不变。
- `PairingBidControl` 的 read-only / editable 使用方式不变。
- 分页、搜索、tab、reset、cancel 行为不变。

## 验证结果

定向验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/components/pairing-bid-control.test.tsx
npm run lint -- --quiet
npm run build
```

结果：

- 3 个 Pairing 测试文件通过。
- 46 个 Pairing 相关测试通过。
- `pbs-portal` lint 通过。
- `pbs-portal` build 通过。

## 后续建议

- `PairingRightPanel` 仍有分页 footer、搜索 tab 区、draft 持久化控制逻辑可以继续拆，但下一步应优先考虑“抽纯展示区”，避免把保存和缓存语义拆散。
- 后端服务文件治理建议另起一批，只处理一个服务中的私有 helper，先不碰 SQL fast path 和事务边界。
