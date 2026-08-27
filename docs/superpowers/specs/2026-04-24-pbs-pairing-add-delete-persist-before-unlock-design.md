# PBS Pairing Add/Delete 保存完成前锁定设计

日期：2026-04-24
作者：Codex
状态：已实现

## 背景

当前 `/pairing` 页面中：

- `EXISTING PAIRING PROPERTIES` 删除 property 后，只是先更新本地状态，再依赖 250ms debounce autosave。
- `ADD PAIRING PROPERTIES` 点击 `+` 添加 property 后，同样先更新本地状态，再依赖 debounce autosave。

如果用户在接口真正保存完成前刷新页面，后端 draft 还没有持久化，页面重新加载后会看到删除/添加没有生效。用户已经观察到这个问题。

`/pairing/search` 的 `SEARCH CRITERIA` 点击 `+` 当前体验更好：点击后进入 pending 状态，接口完成前按钮不可重复点，保存完成后才恢复。

## 目标

让 `/pairing` 的 add/delete 行为模仿 `/pairing/search` 的保存体验：

- 删除 existing property 时，立即发起保存当前 draft。
- 添加 available property 时，立即发起保存当前 draft。
- 保存接口完成前，对应操作按钮进入 disabled/pending 状态，避免重复点击。
- 保存完成后再恢复可操作状态。
- 用户在保存完成后刷新页面，新增/删除结果应从后端 draft 中正确恢复。

## 推荐方案

采用“结构性 add/delete 立即保存，细粒度编辑继续 debounce autosave”的方案。

结构性操作包括：

- 删除 existing property
- 从 available property 添加到 existing property

这些操作对 draft 行数影响大，用户也更容易立刻刷新页面验证，因此应立即保存。

细粒度编辑包括：

- existing property layer toggle
- available property bid/mode/quantifier/layer 编辑

这些暂时保持现有行为，不扩大本次范围。

## 交互设计

### 删除 existing property

1. 用户点击 trash。
2. 该删除按钮立即 disabled，或整条 existing 操作区进入 pending。
3. 前端保留该行并禁用删除操作，避免 UI 先消失但后端尚未保存。
4. 调用 `pairingService.saveCurrentDraft(nextExistingProperties, draftMeta)`。
5. 成功后更新 `lastSavedExistingPropertiesRef` 和 `pairingPageDataQueryKey` cache。
6. 成功后 invalidate `layerPageDataQueryKey`。
7. pending 状态结束。

### 添加 available property

1. 用户点击 available property 的 `+`。
2. 该 `+` 按钮 disabled，避免重复添加同一条。
3. 前端保留 available 行并禁用添加操作，保存成功后再追加到 existing 列表。
4. 调用 `pairingService.saveCurrentDraft(nextExistingProperties, draftMeta)`。
5. 成功后更新 `lastSavedExistingPropertiesRef` 和 `pairingPageDataQueryKey` cache。
6. 成功后 invalidate `layerPageDataQueryKey`。
7. pending 状态结束。

## 失败处理

- 保存失败时保持操作前的 `existingProperties` 不变。
- pending 状态结束。
- 本期不新增 toast；先保持静默恢复，避免引入新的全局通知模式。

## 为什么不把所有变更都改成立即保存

现有 layer toggle / inline bid 编辑可能产生连续快速输入，如果全部改成立即保存，会明显增加请求数量，也可能让输入体验变卡。此次只修复用户明确遇到的 add/delete 刷新丢失问题。

## 验收标准

- 删除 existing property 后，保存接口未完成前，对应删除操作不可重复触发。
- 删除保存完成后刷新页面，已删除 property 不再回来。
- 添加 available property 后，保存接口未完成前，对应 `+` 不可重复触发。
- 添加保存完成后刷新页面，已添加 property 会从后端 draft 恢复。
- 保存失败时，前端 existing list 恢复到操作前状态。
- `pairing-page.test.tsx` 覆盖 add/delete pending 与 save payload。
- 现有 favorite、preview、search pairing 行为不回退。
