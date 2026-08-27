# PBS Rule Bid property table 展示组件重构记录

时间：2026-04-29
范围：`pbs-portal`

## 本批目标

- 继续拆薄 `RuleBidRightPanel`，把 Days Off / Rule Bid 右侧面板中的 property 表格展示职责移出主流程组件。
- 不改变保存、添加、删除、favorite、AON / Minimum N modifier、layer toggle 或分页行为。
- 保持 Days Off / Line 定向测试、`pbs-portal` lint/build 和 PBS 全量回归通过。

## 已处理项

### 1. 新增 Rule Bid property table 展示组件

新增文件：

- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`

提供组件：

- `RuleBidPropertyTableHeader`
- `RuleBidExistingPropertyRow`
- `RuleBidAvailablePropertyRow`
- `RuleBidAvailablePropertiesEmptyState`

这些组件只负责表头、existing row、available row、inline bid editor、AON / Minimum N 控件和空状态展示。实际状态更新、autosave、add/delete/favorite mutation 仍由 `RuleBidRightPanel` 控制。

### 2. 收束 RuleBidRightPanel JSX

修改文件：

- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`

处理内容：

- 移除主组件内重复的表头、已有属性行、可添加属性行和 modifier editor JSX。
- 保留 `RuleBidRightPanel` 对 hydration、validation、autosave、add/delete/favorite、分页和搜索状态的控制权。
- 将编辑展开/收起逻辑命名为 `toggleExistingPropertyEditor` / `toggleAvailablePropertyEditor`，减少 JSX 内联状态表达式。

## 不变项

- `onSave`、`onAddProperty`、`onDeleteProperty`、`onFavoriteProperty`、`onUnfavoriteProperty` 调用时机不变。
- `data-testid="rule-bid-existing-row"`、`data-testid="rule-bid-available-row"`、`data-testid="rule-bid-add-properties-footer"` 保持不变。
- Add / Favorite / Edit / Delete / Layer toggle / AON / Minimum N 的 aria-label 保持不变。
- `showModifiers` 为 true 时 bid summary 只读、展开 editor 后可编辑的行为保持不变。
- 空状态文案和分页文案保持不变。

## 验证结果

定向验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm run lint -- --quiet
npm test -- --run src/features/days-off/pages/days-off-page.test.tsx src/features/line/pages/line-page.test.tsx
```

结果：

- `pbs-portal` lint 通过。
- Days Off / Line 定向测试 2 个文件通过。
- 11 个相关测试通过。

## 后续建议

- 下一批可考虑继续收束 `RuleBidRightPanel` 的 favorite/cache helper，但先不要抽到跨 Pairing / Rule Bid 的全局框架。
- 后端 `days-off-bid-service.ts` 仍建议单独小批治理，只处理私有 helper，不碰 SQL fast path。
