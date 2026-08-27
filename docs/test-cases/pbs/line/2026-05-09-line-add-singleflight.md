# PBS Line 添加属性防连点测试案例

模块：PBS Portal / Line  
日期：2026-05-09  
适用对象：QA / 回归测试

## 目标

- 验证 Line 页面快速点击 `+` 不会疯狂调用接口。
- 验证重复 Line property 不会被重复添加。
- 验证正常添加后刷新仍能回显。
- 验证添加接口响应时间小于 2 秒。

## 前置条件

1. `pbs-server` 已启动，端口 `3002` 可访问。
2. `pbs-portal` 已启动，浏览器打开 `/fpqe/pbs/line`。
3. 使用有 PBS Portal 权限的测试账号登录。
4. 浏览器 DevTools Network 已打开，并勾选保留日志。

## TC-LINE-ADD-001 快速双击同一属性

步骤：

1. 在 Add Line Properties 区域找到 `Max Credit Window`。
2. 快速双击该行 `+` 图标。
3. 查看 Network 中 `/api/line-bids/current/properties` 请求数量。

预期结果：

- 只出现 1 条 `POST /api/line-bids/current/properties`。
- Existing Line Properties 中只新增 1 条 `Max Credit Window`。
- 不出现 409。
- 接口耗时小于 2 秒。

## TC-LINE-ADD-002 已存在属性再次点击

步骤：

1. 保证 Existing Line Properties 中已有 `Max Credit Window`，配置为默认 `Enabled` + `T1`。
2. 在 Add Line Properties 区域再次点击 `Max Credit Window` 的 `+`。

预期结果：

- 不发起新的添加接口。
- 页面提示该 property 已存在。
- Existing Line Properties 中不出现重复行。

## TC-LINE-ADD-003 不同配置允许继续添加

步骤：

1. Existing Line Properties 中已有 `Max Credit Window`，配置为 `T1`。
2. 在 Add Line Properties 区域把 `Max Credit Window` 改为 `T2`。
3. 点击 `+`。

预期结果：

- 发起 1 条添加接口。
- Existing Line Properties 新增一条 `T2` 的 `Max Credit Window`。
- 刷新页面后两条不同 Tier 配置都能回显。

## TC-LINE-ADD-004 刷新回显

步骤：

1. 正常添加 `Forget Line`。
2. 等待提示添加成功。
3. 刷新页面。

预期结果：

- `Forget Line` 仍在 Existing Line Properties。
- Network 中没有连续重复保存。
- `/tier` 页面 Line summary 可正常读取。

## 回归范围

1. Days Off 添加属性仍可正常使用。
2. Pairing 页面添加规则仍可正常使用。
3. Line 收藏 / 取消收藏仍走持久化接口。
4. Line 修改已有属性时仍能保存。
