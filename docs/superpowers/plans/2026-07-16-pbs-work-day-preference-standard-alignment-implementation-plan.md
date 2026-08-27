# PBS Work Day Preference 标准语义重构实施计划

## 目标

按已批准设计重构 Pairing property `110`：固定 Award 且隐藏动作选择、移除 Any/Every、支持每个 weekday 独立 Check-In window，并使用与既有条件一致的 `LIMIT TO EVENT DATE`。删除全部旧 property `110` 数据，不兼容旧 payload。

设计依据：

- `docs/superpowers/specs/2026-07-16-pbs-work-day-preference-standard-answer-alignment-design.md`

## 实施顺序

### 1. 共享 contract 与 catalog

- 新增专用 `work-day-preference` payload 和 weekday window 类型。
- property `110` 固定 `supportedActions=["award"]`，移除 quantifier/operator。
- 增加严格 normalizer/validator，拒绝旧 `date-or-dow-list`、通用 `date-range` 与重复 weekday。

验证：contract focused tests、Portal/Server TypeScript build。

### 2. 服务端保存、读取与摘要

- JSON 序列化使用 `operator=Json`、完整 payload 写入 `param_a`。
- 更新 Pairing validation、normalization、clone、format、summary、configured favorite 回显。
- 导入只允许忠实生成新语义的 weekday 输入；无法表达的旧具体日期/Every/Avoid 明确拒绝。

验证：Pairing property validation、lineholder rule value/format、import focused tests。

### 3. Search 与 PAIRING_SCORE

- 每个 Duty 取最早非空 `brief_start_utc`，稳定排序 `brief_start_utc/seg_seq/id`。
- 使用该 segment 的 `dep_arp` timezone；非法或缺失 timezone 回退 UTC。
- 同一个 Duty event 同时判断 Event Date、weekday 和该 weekday 时间窗口。
- Pairing 中任一 Duty 命中即匹配。
- 同步 `pbs-server` 与 `live-server` 两条 PAIRING_SCORE 路径。

验证：Search SQL、当地日期、开放/跨午夜窗口、同一 Duty 约束、双导出等价测试。

### 4. Portal UI

- 重写 Work Day editor，但保留本项目弹窗、weekday chip、时间输入、optional event-date 和 footer 视觉规范。
- 隐藏 PREFERENCE 和 WORK-DAY MATCH。
- weekday 选择后显示独立 From/To；取消 weekday 清空窗口。
- `LIMIT TO EVENT DATE` 默认关闭，开启后支持既有组件的 Specific Dates / Date Range。
- 更新 dialog validity、mapper、summary、favorite 和 Search Pairings 回显。

验证：editor、dialog、Pairing page、Search Pairings focused tests；`npm run check:ui`。

### 5. Catalog seed 与破坏性 migration

- 更新 property `110` seed metadata。
- 事务内清理主 property 或 AND condition 引用 `110` 的完整跨 Tier group。
- 清理 occurrences/favorites，重算保留 Tier/Bid 计数，只删除真正空容器。
- migration 幂等且不误删同一 bid 的其他 property。

验证：SQL 静态审查与 migration regression test/验证查询。

### 6. E2E、QA 与交付

- Playwright 通过真实 UI 覆盖固定 Award、两个 weekday 独立窗口、Event Date range、保存与回显、Search 结果。
- 更新 property `110` 中文 QA 用例。
- 运行 focused tests，再运行 Portal/Server build、UI gate 与 `verify:pbs`。
- commit 前运行 GitNexus `detect_changes --scope staged`。

## 成功标准

1. UI 不出现 Award/Avoid 和 Any/Every，但提交始终为 Award。
2. 至少一个 weekday；每个 weekday 可配置独立、可开放或跨午夜的 Check-In window。
3. `LIMIT TO EVENT DATE` 默认关闭；开启后日期、weekday、time 必须由同一 Duty 当地 Check-In 同时满足。
4. Search 与两条 PAIRING_SCORE 对相同 fixture 结果一致。
5. 旧 property `110` 数据安全删除，其他 property 不受影响。
6. 自动化、Playwright、build、UI gate 和 QA 文档全部通过。

## 工作树保护

当前工作树存在 Pairing Preference、Check-Time 等未提交修改，并与共享 contracts、dialog、summary、import、Search 和 E2E 文件重叠。实施时：

- 每次编辑前读取目标文件及当前 diff。
- 不回滚、不覆盖、不格式化无关代码。
- 重叠文件只添加 property `110` 所需最小增量。
- 最终只暂存本任务明确归属的文件/行；提交前逐项核对 staged diff。
