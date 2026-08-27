# Rank 单表删除引用保护设计

## 状态

已获用户批准，进入实施。

## 目标

修复 `/altair/data` 中 Rank 删除行为：当 `rank.id = 37`（或任意 Rank）没有数据库/业务引用时允许删除；若未来发现明确的业务引用，则保留 Rank，并向调用页面返回可读、可定位的阻塞原因，而不是笼统删除失败。

## 范围与原则

- 删除入口保持现有 Data 页面通用 `POST /api/data/save` 链路。
- Rank 删除只操作 `rank` 单表；不级联删除、不改写、不软删除任何业务记录。
- 删除在同一事务内执行引用预检查与物理删除，避免检查与删除之间产生竞态窗口。
- 当前 `rank` 表没有指向它的数据库 FK；因此不能凭空把 rank code 的弱关联当成删除阻塞。删除必须先保证无引用时确实执行单表删除；只有实现明确识别到的业务引用才返回阻塞。
- 引用存在时返回 HTTP `409`，响应沿用 `{ code, data, message }`，并在 `data` 中提供结构化引用明细（表、字段、数量，必要时提供有限示例）。
- 既有非 Rank 删除行为保持不变。

## 引用检查

检查目标 Rank 的 `rank.id` 与 `rank.rank` code。当前实现优先保证 `rank` 单表删除路径正确；不对没有 FK、且未确认属于删除阻塞语义的 code 字段做过度拦截。底层数据库约束错误仍转换为 `409` 可读响应作为兜底。

检查结果为空时删除 `rank` 行。删除目标不存在时沿用现有未找到语义，不报告引用阻塞。

## API 错误契约

引用阻塞：

```json
{
  "code": 409,
  "data": {
    "entityId": "rank",
    "rowId": 37,
    "references": [
      { "table": "crew_rank", "column": "rank", "count": 12 }
    ]
  },
  "message": "Rank 37 (CA) cannot be deleted because it is referenced by crew_rank.rank (12 rows)."
}
```

前端 Data 页面显示服务端 `message`，保留该行并刷新/保持当前数据，不显示模糊的 “Delete failed”。

## 测试

- 后端 service/route 回归：无引用成功删除；有引用返回 `409`、结构化引用明细且 Rank 保留；事务不执行删除或回滚。
- Playwright 真实 UI：在 Data 页面定位 Rank `id = 37`，覆盖无引用删除成功和有引用时显示明确阻塞信息两条路径。测试数据仅使用 `f8_dev_*`。
- 运行对应 live-server focused Vitest、gantt 相关单测（如错误展示有改动）和 Data 页面 Playwright；前端样式变更时运行 `npm run check:ui`。

## 风险与非目标

- 不修改 SQL schema 或 FK 定义。
- 不自动清理历史业务数据，也不改变 Rank code 的业务语义。
- 若远端 schema 存在未被代码索引记录的动态引用，仍由数据库 FK 删除保护兜底；实现应把底层约束错误转换为同一类 `409` 可读响应。
