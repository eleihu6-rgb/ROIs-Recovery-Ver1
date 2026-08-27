# PBS Pairing 日历详情编辑 Tx 设计

日期：2026-05-06  
作者：Codex  
状态：已确认，已实施

## 背景

当前 Pairing 页面左侧 `BIDDING CALENDAR` 可以点击蓝色 `pairing_bid` 查看详情，但详情是只读的。删除或调整 Tx 只能回到右侧 `EXISTING PAIRING PROPERTIES` 里操作。

用户期望日历详情也能像 Days Off 一样直接调整对应 bid 的 Tx 覆盖范围，而不是额外提供一个容易误解的 `Delete` 按钮。

## 目标

1. 点击日历蓝色 pairing bid 后，详情弹窗支持编辑该 bid 应用到哪些 `Tx`。
2. 默认勾选当前 bid 已经覆盖的 Tx。
3. 用户勾选或取消 Tx 后点击 `SAVE BID`，保存新的 Tx 覆盖范围。
4. 如果所有 Tx 都取消后点击 `SAVE BID`，等价于删除这条 pairing bid。
5. 行为与 Days Off 日历弹窗保持一致：没有单独 `Delete` 按钮，通过 Tx 勾选状态表达保留或删除。

## 交互设计

详情弹窗保留现有信息：

- Pairing Number
- Tier
- Internal ID
- Origin Date
- Date Range
- Mode

在 `Mode` 下方新增 `Apply to Tiers`：

- 显示 `T1` 到 `T7` checkbox。
- 当前 property row 覆盖的 Tx 默认勾选。
- 用户可以手动勾选或取消任意 Tx。
- 增加 `Clear` 按钮，快速取消所有 Tx。
- 底部按钮为 `Close` 和 `SAVE BID`。

保存语义：

```text
已有：C4103 on 2026-04-09 | T1/T2
取消 T2 后保存：C4103 on 2026-04-09 | T1
取消 T1/T2 后保存：删除整条 C4103 on 2026-04-09 bid
勾选 T3 后保存：C4103 on 2026-04-09 | T1/T2/T3
```

## 数据与 API 设计

日历 event metadata 已包含 `propertyGroupKey`，可以定位右侧 Existing row 对应的稳定 property 身份。

前端保存建议复用现有 `pairingService.saveCurrentDraft`：

1. 在打开详情时加载 Pairing page data，拿到最新 `existingProperties` 和 `draftMeta`。
2. 根据 `propertyGroupKey` 找到目标 row。
3. 保存时：
   - 如果还有选中的 Tx：更新该 row 的 `tiers`。
   - 如果 Tx 全空：从 `existingProperties` 中移除该 row。
4. 调用 `saveCurrentDraft` 一次性保存整个 pairing draft。
5. 成功后刷新：
   - `pairingPageDataQueryKey`
   - `biddingCalendarQueryKey`
   - `tierPageDataQueryKey`

暂不新增后端 API。原因是当前右侧 Existing row 编辑/删除已经是保存整份 draft 的语义，日历详情复用同一条路径更一致，也不会引入额外契约。

## 边界规则

1. 只对 `pairing_bid` 且 metadata 有 `propertyGroupKey` 的事件展示 Tx 编辑。
2. 如果找不到对应 Existing row，显示错误状态，不执行保存。
3. 保存期间禁用 `SAVE BID`，避免重复提交。
4. 保存失败时保留弹窗并展示错误。
5. 当前只改 Pairing 日历详情；Days Off、Tier、Dashboard 等页面不受影响。

## 验收标准

1. 点击 Pairing 日历蓝色 pairing bid，详情弹窗出现 `Apply to Tiers`。
2. 已覆盖的 Tx 默认勾选。
3. 取消某个 Tx 保存后，该 Tx 的日历蓝条消失，右侧 Existing row 对应 Tx 不再亮。
4. 勾选新 Tx 保存后，该 Tx 的日历蓝条出现，右侧 Existing row 对应 Tx 亮起。
5. 全部取消后保存，该 Existing row 被删除，日历蓝条消失。
6. `npm run verify:pbs` 通过。
