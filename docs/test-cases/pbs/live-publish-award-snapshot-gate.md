# Live 发布与 PBS Award 发布记录门禁测试

## 目的

确认 Live `Publish Roster` 在排班数据完整提交后，同事务写入可被 PBS Award 识别的
`schedule_publish_record.published = 1`，并阻止同一 Crew 的部分差异发布。当前流程不生成
`.schedule.gz`，也不需要快照目录环境变量。

## 前置条件

- 测试 Period 已配置 `pbs_award_publish_at`。
- 测试 Crew 在 Roster Start 时存在唯一 prime base、division，以及与 Period 重叠的 fleet。
- 记录测试前 `roster_publish`、`roster_publish_adjust` 与 `schedule_publish_record` 的基线。

## 用例 1：完整发布成功

1. 在 Live 制造同一 Crew 的 Flying 与 Ground actionable diff。
2. 打开 `Publish Roster`，选择该 Crew 的全部 diff 并发布。
3. 确认页面提示发布成功。
4. 查询本次 batch 的三张表。
5. 检查每个完成发布的 Crew 恰有一条 `published=1` 记录，Period、Crew、division、base、ac_type、batch 均正确。
6. 检查 `file_path/file_size/checksum` 均为 null，服务器没有生成 `.schedule.gz`。
7. 到 PBS Award 检查该 Crew 的 Period 状态由等待发布变为可用，并确认明细只来自 `roster_publish`。

预期：排班、adjust 和发布记录共同成功；完全未选择的 Crew 不产生记录。

## 用例 2：同一 Crew 部分发布被拒绝

1. 在同一 Crew 保留两条 actionable diff。
2. 只选择其中一条并发布。
3. 检查页面提示必须选择该 Crew 的全部变更。
4. 刷新 diff，确认两条变更仍存在。
5. 对比基线，确认三张表均无本次新写入。

预期：整个 Apply 失败，不是只跳过未选中的一条。

## 用例 3：Crew 范围不完整

分别制造缺少/冲突 prime base、缺少 division、无有效 fleet 的 Crew，然后执行完整发布。

预期：写操作前返回产品化错误，三张表共同保持不变。

## 用例 4：通用接口不能伪造发布成功

1. 调用 `POST /api/scenario/schedule-publish`，分别传入 number/string/boolean `published=1`。
2. 再传入 `published=0` 并夹带 `batchId` 或文件元数据。
3. 直接调用通用 service 时尝试夹带相同字段。

预期：路由拒绝伪造字段；service 即使被内部误用也强制写 `published=0`，并清空 batch/file 字段。

## SIT/UAT 发布前检查

- 无需配置 `SCHEDULE_SNAPSHOT_DIR`。
- 完成一次受控发布，核对三张表同一事务结果。
- 核对 PBS Period 管理页 Published 状态与 Award 可见状态一致。
- 核对发布失败、部分选择和范围冲突均不会留下成功记录。
