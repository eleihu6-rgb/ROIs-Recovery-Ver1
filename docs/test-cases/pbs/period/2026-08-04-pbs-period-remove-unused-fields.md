# PBS Period 删除四个无效字段测试

## 页面

1. Period 列表不显示 `Max Tiers`。
2. Add/Edit Period 不显示 `Award Run`、`Award Publish`、`Max Tiers`、`Description`。
3. Generate PBS Year 及预览表不显示 `Max Tiers`。
4. 仅使用 Period Code、Bid Open、Bid Close 可完成新增和编辑。
5. 年度预览、年度保存和删除仍正常。

## API

1. 列表、新增、编辑和年度生成响应不包含 `awardRunAt`、`awardPublishAt`、`maxTiers`、`description`。
2. 正常请求不包含上述属性。
3. POST/PATCH 携带任一已删除属性时返回 HTTP 400。
4. Generate Year Preview/Generate 携带 `maxTiers` 时返回 HTTP 400。

## 回归

1. PBS Portal T1–T7 操作保持不变。
2. PBS Server Award Results 保持不变。
3. PBS 算法导出保持不变。

## 数据库门禁

实际执行 migration 前，每个环境必须分别：

1. 审计四列数据和数据库依赖。
2. 确认兼容版本的 Live Server 与 PBS Server 已部署且健康。
3. 获取用户针对该目标库 DROP COLUMN 的明确授权。
4. 执行后确认四列不存在，并完成真实 Portal/PBS Server smoke。
