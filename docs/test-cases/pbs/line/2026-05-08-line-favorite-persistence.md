# PBS Line 收藏持久化测试案例

模块：PBS Portal / Line  
日期：2026-05-08  
适用对象：QA / 回归测试

## 目标

- 验证 Line 页面 Add Line Properties 的收藏和取消收藏会调用后端接口。
- 验证收藏状态刷新后仍能回显。
- 验证 Line 收藏不影响 Line property 添加、保存、删除和 Tier summary。
- 验证收藏接口响应时间满足 2 秒以内目标。

## 前置条件

1. `pbs-server` 已启动，并连接当前 PBS schema。
2. `pbs-portal` 已启动，浏览器打开 `/fpqe/pbs/line`。
3. 使用有 PBS Portal 权限的测试账号登录。
4. 当前 bid period 可正常读取 Line draft。
5. Line catalog 默认显示旧库 `401-407`，例如 `Max Credit Window`、`Forget Line`、`Min Base Layover`。

## 正常路径

### TC-LINE-FAV-001 收藏 Line property

1. 进入 `/line` 页面。
2. 在 Add Line Properties 区域找到 `Max Credit Window`。
3. 点击该行红心图标。
4. 打开浏览器 Network，确认出现：
   - Method：`PUT`
   - URL：`/api/line-bids/current/favorites/401`
5. 等待页面提示 `Favorite saved.`。
6. 刷新页面。

预期结果：

- `Max Credit Window` 红心保持选中。
- 接口耗时小于 2 秒。
- 页面没有出现保存失败提示。

### TC-LINE-FAV-002 取消收藏 Line property

1. 保持 `Max Credit Window` 为已收藏状态。
2. 再次点击该行红心图标。
3. 打开浏览器 Network，确认出现：
   - Method：`DELETE`
   - URL 包含 `/api/line-bids/current/favorites/by-key/`
4. 等待页面提示 `Favorite removed.`。
5. 刷新页面。

预期结果：

- `Max Credit Window` 红心恢复未选中。
- DELETE 使用后端返回的 `favoriteKey`，不是直接用 property code 删除。
- 接口耗时小于 2 秒。

### TC-LINE-FAV-003 收藏与添加 property 互不影响

1. 收藏 `Forget Line`。
2. 点击 `Forget Line` 的加号，将其添加到 Existing Line Properties。
3. 修改 `Forget Line` 数字，例如输入 `12`。
4. 切换一个 Tier，例如同时选择 `T1`、`T3`。
5. 刷新页面。

预期结果：

- `Forget Line` 收藏状态仍保留。
- Existing Line Properties 中 `Forget Line` 仍存在。
- 数字和 Tier 回显正确。
- 收藏接口和 draft 保存接口都没有超过 2 秒。

## 异常 / 边界场景

### TC-LINE-FAV-004 重复点击保护

1. 快速连续点击同一条 Line property 红心。

预期结果：

- 前一次请求 pending 时按钮不可重复提交或不会产生多条冲突写入。
- 最终 UI 状态与后端状态一致。

### TC-LINE-FAV-005 未登录或 token 失效

1. 清除登录态或使用过期 token。
2. 点击 Line property 红心。

预期结果：

- 接口返回认证错误。
- 页面不应把收藏误认为保存成功。

## 回归范围

1. Pairing 页面收藏 / 取消收藏仍走原有接口。
2. Days Off 页面收藏 / 取消收藏仍走原有接口。
3. Line draft 添加、修改、删除仍能保存并刷新回显。
4. `/tier` 页面仍能看到 Line summary。
5. 左侧 Bidding Calendar 当前选中 Tier 不应因 Line 收藏操作被重置。
