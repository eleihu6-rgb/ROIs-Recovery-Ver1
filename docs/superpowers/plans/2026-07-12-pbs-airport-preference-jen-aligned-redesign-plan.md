# PBS Airport Preference：实施计划

关联设计：[2026-07-12-pbs-airport-preference-jen-aligned-redesign-design.md](../specs/2026-07-12-pbs-airport-preference-jen-aligned-redesign-design.md)

## 执行顺序

1. **确认当前 contract 与清理对象**
   - 以 `propertyCode=168` 的 stable property identity 追踪现有 `pbs_bid_group`、`pbs_bid_condition`、configured/simple favorite 与空 bid 容器。
   - 新增受控 migration：删除旧 168 规则和 favorites，保留并更新 property metadata；先写 migration fixture / integration coverage。

2. **更新共享 contract 与 Server serialization**
   - 将旧 `event + airports + dateCondition + matchingCount + layoverDuration` 改为新 Airport/City location、`landing_or_layover`、date scope、minimum duration、fulfilment range payload。
   - 更新 clone、normalize、serialize / deserialize、route schema 与 server validation；删除旧 runtime fallback。

3. **改造 Airport option 与 search predicate**
   - 在 base / bid-period scoped airport query 中 join airport master，输出 airport/city option 与事件可用性。
   - 实现 city expansion、事件机场本地日期、Landing-or-Layover OR predicate 和可选 layover duration predicate。
   - 明确 quantity 不进入 event/segment count SQL。

4. **替换 Portal 168 editor**
   - 新建 feature-local `AirportPreferenceEditor`，由 `PairingPropertyConfigDialog` 专用接入。
   - 复用 `PbsDialogFrame`、Tier / Award-Avoid、`AirportMultiSelect` portal、`PbsDatePicker`、`PbsInputNumber`。
   - 删除旧 accordion UI 与 Matching Count UI；更新 summary、favorite restore、catalog clone 与 mapper。

5. **补齐测试和 QA 文档**
   - Portal RTL、Playwright、Server unit / integration、migration 数据清理覆盖。
   - 新增 Airport Preference QA 手工测试用例。

6. **分层验证与交付检查**
   - 先跑受影响单测，再跑 Portal / Server lint、build、`check:ui` 与 PBS 验证。
   - 通过真实 UI Playwright 验证 main flow 后汇报结果；不自动提交 Git。

## 写入边界

- 允许：`packages/contracts`、`pbs-portal/src/features/pairing`、`pbs-server/src/services/pairing*`、`pbs-server/src/services/pairing-search`、`sql/migration`、相关测试 / QA 文档。
- 禁止：修改 `PbsDialogFrame`、`PbsDatePicker`、`PbsInputNumber` 的共享基础行为；不修改无关 Pairing property。
