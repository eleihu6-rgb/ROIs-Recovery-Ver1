# Pairing Search Detail Date / Day 条件重构回归测试案例

日期：2026-06-12  
范围：PBS Server pairing search preview condition builder，覆盖 duty on date/day 与 layover on date/day。

## 前置条件

- 测试环境连接可用 PBS Server。
- Pairing catalog 中包含 duty date/day 和 layover date/day 相关 property。
- 至少存在跨多个 duty、多个 layover 的 pairing 数据。

## 操作步骤与预期结果

1. 使用 Duty On Date / Day property 执行 any preview。
   - 预期：匹配任一 duty 日期或星期的 pairing 被返回。
   - 预期：日期数组和星期数组可以同时参与 OR 匹配。

2. 使用 Duty On Date / Day property 执行 every preview。
   - 预期：只有所有 duty 日期都满足条件的 pairing 被返回。
   - 预期：不满足条件的 duty 会正确排除该 pairing。

3. 使用 Layover On Date / Day property 执行 any preview。
   - 预期：匹配任一 layover 日期或星期的 pairing 被返回。
   - 预期：无 layover 的 pairing 不应错误命中。

4. 使用 Layover On Date / Day property 执行 every preview。
   - 预期：只有所有 layover 日期都满足条件的 pairing 被返回。
   - 预期：avoid intent 仍能正确反转匹配语义。

5. 使用 date-range 模式分别测试 duty 和 layover。
   - 预期：合法 `from/to` 生成 between 条件。
   - 预期：`to < from` 或非法日期格式返回既有 400 校验错误。

## 异常与边界场景

- 空 dates 且空 daysOfWeek 时返回既有 “Missing date or day values” 错误。
- 非 date/date-range bid 类型不生成 detail condition。
- SQL 参数顺序保持稳定，不能拼接未参数化日期值。

## 回归范围

- `buildPreviewCondition` duty on date/day。
- `buildPreviewCondition` layover on date/day。
- any / every quantifier。
- award / avoid intent wrapping。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/pairing-search/pairing-search-condition-builder.test.ts
npm test
npm run build
```
