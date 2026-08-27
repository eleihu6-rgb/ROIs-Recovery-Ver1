# PBS Pairing Check-In Time OR 条件清理回归测试

> **历史归档，不再执行。** 103 已于 2026-07-12 改为统一的 `Pairing Check-In / Check-Out Time`，不再使用 `time-condition-list` 或同条件内 OR 列表；111 已退役。请使用 [2026-07-12-pairing-check-in-check-out-time.md](2026-07-12-pairing-check-in-check-out-time.md) 作为当前 QA 用例。

## 范围

PBS Portal Pairing 页面 `Pairing Check-In Time` 配置、保存、收藏、Search Pairings preview，以及 PBS Server 对 `propertyCode=103` bid payload 的校验。

## 前置条件

- 已登录 PBS Portal。
- 当前 bid period 有可编辑 Pairing draft。
- Pairing property catalog 中可见 `Pairing Check-In Time`。

## 自动化覆盖

- `pbs-server/src/routes/pairing-bids.test.ts`
  - 接受 `Pairing Check-In Time` 的 `time-condition-list` payload。
  - 拒绝 `propertyCode=103` 的旧 `time-range` payload。
- `pbs-server/src/services/lineholder/rule-bid-value.test.ts`
  - 序列化 / 反序列化 `time-condition-list`。
  - 旧 `time` / `time-range` 序列化形态不再被反序列化成 OR condition。
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
  - `time-condition-list` 生成 OR SQL。
  - `propertyCode=103` 的旧 `time-range` bid 不再作为合法 search preview 条件。

## 人工测试步骤

1. 进入 Pairing 页面。
2. 在 `ALL PROPERTIES` 中选择 `Pairing Check-In Time`。
3. 在弹窗 `BID` 区域配置一个条件，例如 `= 12:16`。
4. 预期：弹窗内不出现额外 `ADD` 按钮，也不出现 condition chip/list。
5. 点击底部 `ADD BID`。
6. 预期：`EXISTING PAIRING PROPERTIES` 中出现一条 `Pairing Check-In Time`，摘要类似 `Award · = 12:16`。
7. 再次从 `ALL PROPERTIES` 选择 `Pairing Check-In Time`。
8. 配置另一个条件，例如 `> 13:00`，点击底部 `ADD BID`。
9. 预期：同一 tier 下可以看到第二条 `Pairing Check-In Time`，不出现 `can only be used once` 提示。
10. 打开 `VIEW RULES` 或 Search Pairings current-rules preview。
11. 预期：多条 `Pairing Check-In Time` 按 OR 语义组合。

## 边界与异常场景

1. 不填写时间值时尝试保存。
   - 预期：不能保存，保持必填 / disabled 状态。
2. 通过接口提交 `propertyCode=103` 且 `bid.type=time` 或 `bid.type=time-range`。
   - 预期：后端返回 400，不保存该条件。
3. Search Pairings preview 遇到 `propertyCode=103` 的旧 `time` / `time-range` bid。
   - 预期：不按旧结构生成 SQL，应暴露为不支持 / 无效条件，避免静默产生双轨语义。
4. 配置其他合法时间类 property，例如 Report Time 或 Release Time。
   - 预期：这些 property 仍可继续使用原有 `time` / `time-range` 行为，不受 `Pairing Check-In Time` 清理影响。
5. 重复添加完全相同 tier、action 和时间条件的 `Pairing Check-In Time`。
   - 预期：仍按重复条件拦截，避免完全重复行。

## 回归范围

- Pairing Check-In Time 新增、编辑、收藏、展示。
- Pairing Search preview 的当前规则过滤。
- 其他 Pairing 时间类 property 的 `time` / `time-range` 行为。
- Days Off / Line 不应受到 `time-condition-list` 的业务扩散影响。
