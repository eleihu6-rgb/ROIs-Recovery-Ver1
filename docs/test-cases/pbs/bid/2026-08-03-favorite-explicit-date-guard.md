# PBS 收藏明确日期限制测试用例

## 目标

确认 Current Bid 仍可使用明确年月日条件，但包含明确年月日的完整配置不能保存或更新为收藏；周期性配置仍可正常收藏。

## 自动化覆盖

- Days Off：Specific Dates / Date Range 配置完成后，`SAVE FAVORITE` 禁用，`ADD BID` 可用。
- Pairing：开启具体 event date 后，`SAVE FAVORITE` 禁用，`ADD BID` 可用。
- Roster：Commuter Pattern 配置具体日期范围后，`SAVE FAVORITE` 禁用，`ADD BID` 可用。
- 通用判断：覆盖直接日期、日期范围、嵌套 `dateScope`、Pairing occurrence、Prefer Off 日期值以及不含日期的周期性配置。
- 后端：Days Off、Pairing、Roster 的收藏新增和更新入口均在写库前执行相同日期判断。

## 人工回归

1. 在 Days Off 打开 `Prefer Off`，选择 `Specific Dates` 并完成必填项。
   - 预期：`SAVE FAVORITE` 保持可见但禁用；`ADD BID` 可用。
2. 将类型切换为 `Days of Week` 或 `Weekends`。
   - 预期：配置完整后 `SAVE FAVORITE` 可用。
3. 在 Pairing 的支持项中开启 `LIMIT TO EVENT DATE` 并选择具体日期。
   - 预期：`SAVE FAVORITE` 禁用；`ADD BID` 可用。
4. 在 Roster 的 `Commuter Pattern` 中开启日期范围并选择有效范围。
   - 预期：`SAVE FAVORITE` 禁用；`ADD BID` 可用。
5. 直接调用三个模块的收藏新增或更新接口，提交带具体日期的 payload。
   - 预期：返回 HTTP 400，业务消息为 `Favorites cannot include specific calendar dates.`，数据库无新增或更新。
6. 执行清理 migration 后核对三张已配置收藏表。
   - 预期：带具体日期的收藏已删除；Weekdays、Weekends、time window 和相对月份范围收藏仍保留。
