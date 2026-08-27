# Crew Bid Import Existing Property Unsupported Mapping Design

## 背景

整份 `CLASS-BidsReport_March2026.txt` dry-run 后出现 `Unsupported 47`。其中多数不是数据缺失，而是 PBS 属性目录已经存在，但 TXT 导入 mapper 没有识别 CLASS 文案。

本次只处理“已有属性但没认出来”的情况，不新增业务属性、不改数据库、不改变 pairing / airport 可见范围过滤。

## 目标

- 降低整份 March bid report dry-run 的 `Unsupported` 数量。
- 让已有 PBS 属性对应的 CLASS 文案可以被导入为现有 bid property。
- 保留真正数据问题的分类，例如 missing pairing、missing airport、over T7。

## 范围

本次补充以下映射：

- `Any Enroute Check-In Time ...` -> Pairing `propertyCode=114`
- `Any Enroute Check-Out Time ...` -> Pairing `propertyCode=126`
- `Any Duty On Time ...` -> Pairing `propertyCode=120`
- `Any/Every Layover Of Duration ...` -> Pairing `propertyCode=119`
- `Deadhead Day` -> Pairing `propertyCode=128`
- `Any/Every Layover On <date/day>` -> Pairing `propertyCode=123`
- `Any Leg Is Redeye (Counting Deadhead Legs)` -> Pairing `propertyCode=117`，并记录 partial warning
- `Award Reserve Day On ...` -> Reserve `propertyCode=302`
- `Prefer Off Weekends Minimum N All or Nothing` -> DaysOff `propertyCode=201`，补充 `allOrNothing=true`

## 不处理范围

以下条件暂不处理，因为语义或目标属性需要进一步确认：

- `Departing On Between 06:00 And 06:45`
- `Set Condition Days Off Opposite Employee 762 Minimum 8`

## 设计

改动集中在 `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`：

- 对 time 类 pairing 条件增加明确匹配，避免 `Any Duty On Time` 被已有 `Any Duty On` 日期解析误判。
- 对 layover duration 增加 `Layover Of Duration` 同义文案。
- 对 flag-only pairing 条件增加 `Deadhead Day`。
- 对 layover date/day 使用已有日期解析逻辑。
- 对 reserve day 使用已有 date list/date range 解析逻辑，落到 Reserve bid。
- 对 `All or Nothing` 做尾缀剥离，写入 `allOrNothing=true`。

## 测试

新增 mapper 单元测试覆盖以上文案，验证：

- 每条文案可导入。
- `propertyCode`、`bidType`、`operator`、`paramA/paramB/paramC` 符合现有 PBS 属性模型。
- `Counting Deadhead Legs` 会产生 partial warning。

回归命令：

```bash
cd live-server
npm test -- --run src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts src/services/crew-bid-import/__tests__/crew-bid-import-service.test.ts
```

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 mapper 和对应测试，拆分会增加集成成本。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts` 和相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认先处理已有属性未识别情况。
