# Crew Bid 导入明细分批与失败批次恢复实施计划

1. 为 Import Items 与 Problems 增加固定 1,000 行分批写入，跨批汇总 Item ID 映射。
2. 新导入保存完整 `imported_snapshot_json`；`rollbackRun` 在同一事务内锁定备份和当前 Bid，并比较完整快照。历史无快照批次使用严格审计字段与更新时间兜底校验，发生漂移即拒绝回滚。
3. 增加 663 Items + 6,092 Problems、1,001 Items 边界、后续批次失败、回滚快照漂移的回归测试。
4. 运行 Crew Bid Import focused tests、`live-server` build、`git diff --check` 和 GitNexus 变更检查。
5. 只读预检失败批次；数据未漂移时调用现有回滚流程并核对结果。本次不重新导入。
