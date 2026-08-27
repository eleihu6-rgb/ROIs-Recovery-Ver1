# PBS Pairing 日历添加 Bid 合并 Tx 规则设计

日期：2026-05-06  
作者：Codex  
状态：已确认，待实施

## 背景

当前 Pairing 页面左侧 `BIDDING CALENDAR` 已支持点击日期添加 `Award Pairing Number on Specific Date`。

现有后端合并规则是：

- `propertyCode = 102`
- `action = award`
- `bid.type = tag-list-date`
- `bid.date` 相同
- `tiers` 集合完全相同

这会导致一个用户体验问题：用户先在日历上把同一个 pairing 加到 `T1`，再把同一个 pairing 加到 `T2`，`EXISTING PAIRING PROPERTIES` 会出现两条完全相同的 Pairing Number 条件，只是右侧 Tx 不同。

用户期望这种场景合并成一条 row，并让 `T1`、`T2` 同时亮起。

## 目标

1. 同一个 specific-date pairing 条件重复添加到不同 Tx 时，自动合并为同一条 property row。
2. 合并后保留同一个 `Pairing Number on Date` 条件，右侧 Tx 按合并后的 tiers 显示。
3. 避免把不同 pairing number 误扩散到原本不属于它的 Tx。
4. 保持左侧日历和右侧 `EXISTING PAIRING PROPERTIES` 语义一致。

## 合并规则

新增 pairing bid 时，如果已有 row 满足以下条件，则合并到已有 row：

- `propertyCode = 102`
- `action = award`
- `bid.type = tag-list-date`
- `bid.date` 相同
- `bid.values` 归一化后完全相同

合并时：

- `tiers` 取已有 row 和新增请求的并集。
- `bid.values` 保持归一化后的去重排序。
- `propertyGroupKey`、`rowSeq` 沿用已有 row，避免 UI row 身份抖动。

示例：

```text
已有：Pairing Number | Award · C4103 on 2026-04-09 | T1
新增：Pairing Number | Award · C4103 on 2026-04-09 | T2
结果：Pairing Number | Award · C4103 on 2026-04-09 | T1/T2
```

## 不合并规则

以下情况不自动合并：

1. 日期不同。
2. `action` 不同。
3. 一个是 `Entire Month`，一个是 `Specific Date`。
4. `bid.values` 不完全相同。

关键边界：

```text
已有：C4103 on 2026-04-09 | T1
新增：C4103, M4959 on 2026-04-09 | T2
结果：不合并
```

原因是如果强行合并，会让 `M4959` 也进入 `T1`，造成用户没有选择过的 Tx 扩散。

## 实现范围

### 后端

修改 `pbs-server/src/services/pairing/pairing-bid-service.ts` 的 specific-date Pairing Number 合并逻辑：

- 当前用 `tiers` 集合完全相同作为合并条件。
- 改为用 `bid.values` 完全相同作为合并条件。
- 合并结果把 `tiers` 做并集。
- 继续在服务端完成合并，避免并发和多入口重复 row。

### 测试

补充后端合并规则覆盖，重点验证：

- 同 pairing number、同日期、不同 Tx 会合并 Tx。
- 同日期但 values 不完全相同不会合并。
- 原有同 Tx 合并多个 pairing number 的日历显示测试不受影响。

如当前 service 级别测试需要较重数据库 harness，则优先补可复用纯函数测试；如果纯函数不能合理导出，再通过现有 route/service 集成测试覆盖。

## 验收标准

1. 用户在 Pairing 日历上先给 `T1` 添加 `C4103 on 2026-04-09`，再给 `T2` 添加同一个 pairing/date，只出现一条 Existing row。
2. 该 row 右侧 `T1`、`T2` 都亮起。
3. 如果第二次添加的是 `C4103 + M4959 on 2026-04-09`，不与只有 `C4103` 的 row 合并。
4. `npm run verify:pbs` 通过。
