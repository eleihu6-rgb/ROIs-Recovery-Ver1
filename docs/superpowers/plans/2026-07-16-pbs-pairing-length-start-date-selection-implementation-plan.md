# PBS Pairing Length 起始日期选择统一实施计划

日期：2026-07-16
依据：`docs/superpowers/specs/2026-07-16-pbs-pairing-length-start-date-selection-alignment-design.md`

## 目标

让 Pairing Length 的 `LIMIT TO PAIRING START DATE` 复用标准日期选择交互：支持 `Specific Dates` 单个/多个离散日期与 `Date Range`，并确保 Portal、pbs-server Search、持久化及 live-server algorithm export score 语义一致。

## 实施顺序

1. 扩展共享 contract 与 normalization
   - Pairing Length dateScope 增加 `specific_dates`。
   - normalization 对日期排序去重，condition signature 稳定。
   - 验证：contract focused tests。

2. 接入 Portal 共享日期 editor
   - `OptionalEventDateScopeEditor` 支持可配置业务标题/aria 文案，默认行为不变。
   - `PairingLengthEditor` 复用共享 editor，保留 Min/Max。
   - clone、summary、validity、draft/favorite/search 回显支持两种模式。
   - 验证：focused Vitest + TypeScript。

3. 扩展 pbs-server
   - route schema、business validation、period 兼容策略。
   - JSON parse/clone/format/serialize round trip。
   - Search builder 对 specific dates/range 使用同一 pairing start expression，并覆盖 preview/count/pool。
   - 验证：focused node tests + TypeScript。

4. 同步 live-server algorithm export
   - 本地 RuleBidValue、deserialize/clone/format/serialize。
   - 本地 property 112 Search builder 支持新 payload。
   - score export 验证离散日期命中、夹在中间的未选日期不命中、旧 range 不回归。
   - 验证：focused Vitest + TypeScript。

5. 真实 UI 与 QA
   - 更新 Pairing Length Playwright，覆盖 Specific Dates、Date Range、切换清理和编辑回显。
   - 新增人工 QA 文档。
   - 运行 `npm run check:ui`、`git diff --check` 及必要的跨模块回归。

## 写入边界

- 只修改 Pairing Length、共享日期 editor 的展示参数，以及直接相关的 pbs-server/live-server 消费链路和测试。
- 当前工作区其他 Pairing Preference、Check-Time、import 等修改属于并行工作；逐 hunk 保留，不做回滚、格式化或顺带重构。
- 不新增依赖、数据库表、字段或 migration。

## 完成标准

- 用户截图中的 `Specific Dates | Date Range` 交互出现在 Pairing Length 起始日期限制下。
- 单个和多个离散 pairing start dates 均可保存、回显、搜索和计分。
- 未选择的中间日期不命中。
- 历史 date range 与缺少 periodCode 的兼容调用不回归。
- 所有要求的 focused tests、Playwright、类型检查和 UI gate 有明确 PASS 回执。
