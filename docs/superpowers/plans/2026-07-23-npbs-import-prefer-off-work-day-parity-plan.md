# NPBS 两项导入映射实施计划

## 范围

依据：

- `docs/superpowers/specs/2026-07-23-npbs-import-prefer-off-work-day-parity-design.md`

只修改 Live Admin Tools 使用的 Crew Bid Import mapper、对应测试和必要测试文档。

## 步骤

1. 为 `Prefer Off + time window` 和 `Award + Any Duty On` 增加失败回归用例。
   - 断言生成的数据结构与页面手动填写合同一致。
   - 覆盖非法时间、Every 和 Avoid 边界。
2. 最小修改 `crew-bid-property-mapper.ts`。
   - Prefer Off 输出既有 `operator = In` 与 tag-list `paramA`。
   - Any Duty On 输出 Property 110 的标准 `work-day-preference` JSON。
3. 运行 mapper/service focused tests 与 `live-server` build。
4. 使用相同 July/YEG 文件重新 Dry Run。
   - 解析总数保持 867。
   - 记录 N1/N2，并核对 importable/failed 精确增减。
   - 不执行正式 Import。
5. 运行 `git diff --check` 与 GitNexus `detect-changes`。

## 不做

- 不改 Portal UI。
- 不改数据库或 Migration。
- 不支持 Pairing Total Credit、Enroute Check-In Time、Every Duty On 或 Avoid Any Duty On。
- 不执行正式导入或提交 Git。
