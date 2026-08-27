# PBS Pairing Check-In / Check-Out Time 实施计划

关联设计：`docs/superpowers/specs/2026-07-12-pbs-pairing-check-in-check-out-time-jen-aligned-design.md`

## 1. Contract 先行

1. 在 `packages/contracts/pbs-pairing-bids.js/.d.ts` 增加 `pairing-check-time` union：`timeType`、比较 operator、time value / range、可选 date scope。
2. 将 property 103 catalog 改为合并名称与新默认 payload；从 Portal 可用 catalog 中退役 111。
3. 更新 clone、normalize、serialize、signature 和 rule-conflict 逻辑，使旧 103 `time-condition-list` 与 111 新增 payload 不再通过。
4. 用 contracts / rule-validation 测试锁定新 payload、重复条件签名和 103 multi-use 行为。

验证：contracts 与 `pbs-server` 针对 pairing validation 的定向 Vitest。

## 2. PBS Server：保存、恢复、搜索与导出

1. 更新 route schema、`pairing-bid-normalization`、lineholder rule bid value / serialize / summary，使新增、编辑、favorite、existing draft 都读写新 103 payload。
2. 在 `pairing-property-validation` 明确拒绝旧 103 和 111，校验时间格式、operator、date scope、`from <= to`。
3. 更新 `pairing-search-time-conditions`：
   - Check-In 使用 `min(brief_start_utc)`；
   - Check-Out 使用 `max(debrief_end_utc)`；
   - 日期过滤与所选 selector 同源，范围首尾包含。
4. 更新 `pairing-score-export` 相关路径，保证 search preview、当前规则 count、tier pool count 与算法 export 使用同一新语义。
5. 扩展定向 Vitest，覆盖 payload、两种 time type、比较符、日期、current rules 与 export 调用路径。

验证：`pbs-server` 定向 Vitest，随后运行完整 `pbs-server npm test`。

## 3. Portal：专用 editor 与回显

1. 新增 feature-local `PairingCheckTimeEditor`，复用 `PbsDatePicker`、现有 input / footer / Tier / Award-Avoid 组件，不改共享弹窗。
2. 让 103 在 `PairingPropertyConfigDialog` 走专用 editor；新增状态为：空 Tier、Award、Check-In、空时间、日期限制关闭。
3. 实现 operator、AM / PM、Custom、日期开关、Specific Date / Date Range、保存禁用和编辑 / favorite 回显。
4. 更新 summary、draft mapper、search criteria picker 与 testing fixture，确认 111 不显示且不可新增。
5. 添加 RTL 测试及真实 Portal Playwright 回归。

验证：Portal 定向 Vitest、Pairing 页面 Vitest、相应 Playwright；样式修改后运行 `npm run check:ui`。

## 4. 受控 migration 与 QA

1. 新增事务性 103 / 111 replacement migration：删除命中 property group、两类 favorite 和仅因此变空的 bid container；同一 bid 内其他 group 保留。
2. update catalog：103 新语义并可见；111 inactive / hidden。
3. 为 migration 添加覆盖主 group、附加 condition、同 bid 的其他 group、两类 favorite 与 catalog 退役的测试。
4. 新增 `docs/test-cases/pbs/condition-properties/` 的人工 QA 用例，写清历史 103 / 111 需重建。

验证：migration 集成测试、部署前远端只读预检；远端执行仅在用户再次下达执行指令后进行。

## 5. 整体验收与提交

1. 先跑受影响测试，再跑 `npm run verify:pbs`、`npm run lint`、`npm run build` 与 `npm run check:ui`。
2. 用真实 UI Playwright 覆盖 T1、Award / Avoid、Check-Out、AM / PM、日期限制、刷新回显。
3. 按可回滚边界提交：
   - contract + PBS Server + migration；
   - PBS Portal + Playwright + QA 文档。
4. 提交前运行 GitNexus `detect-changes`，确认影响仅为预期 PBS pairing / search / export 流程。
