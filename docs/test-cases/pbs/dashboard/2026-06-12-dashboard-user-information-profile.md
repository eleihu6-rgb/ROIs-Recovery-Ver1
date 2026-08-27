# Dashboard USER INFORMATION 真实资料展示测试用例

## 前置条件

- PBS Portal 和 PBS Server 可正常启动。
- 测试账号已同步到 `pbs_user`。
- 测试账号的 `pbs_user.email / base / rank / division` 至少有一组已知值。

## 测试范围

- Dashboard 左侧用户卡片顶部姓名和邮箱。
- Dashboard 左侧 `USER INFORMATION` 表格。
- 字段缺失和接口异常时的 fallback 行为。

## 用例 1：显示真实稳定字段

操作步骤：

1. 使用测试账号登录 PBS Portal。
2. 进入 `/dashboard`。
3. 查看左侧用户卡片顶部姓名和邮箱。
4. 查看 `USER INFORMATION` 中 `BASE` 和 `POSITION`。

预期结果：

- 姓名显示当前登录用户姓名。
- 邮箱显示 `pbs_user.email`，不是由前端拼接的 `@rois-tech.com`。
- `BASE` 显示 `pbs_user.base`。
- `POSITION` 显示 `pbs_user.rank`。
- 页面不显示旧 mock 值，例如 `Emma Li@rois-tech.com`、`LAX`、`12:25`、`DEC`。

## 用例 2：缺失字段显示 fallback

操作步骤：

1. 使用 `email / base / rank` 为空或部分为空的测试账号登录。
2. 进入 `/dashboard`。
3. 查看左侧用户卡片和 `USER INFORMATION`。

预期结果：

- 缺失字段显示 `-`。
- 页面不使用旧 mock 内容顶替缺失值。
- Dashboard 主体仍可正常展示。

## 用例 3：Profile 接口失败

操作步骤：

1. 模拟 `/api/dashboard/profile` 返回 404 或 500。
2. 登录并进入 `/dashboard`。

预期结果：

- Dashboard 页面不崩溃。
- 左侧面板保持布局稳定。
- session 中已有姓名可继续作为 fallback 显示。
- 其他 profile 字段显示 `-`。
- 浏览器控制台不输出敏感用户资料。

## 用例 4：刷新页面后恢复展示

操作步骤：

1. 登录后进入 `/dashboard`。
2. 刷新浏览器页面。
3. 等待 session 恢复和 profile 请求完成。

预期结果：

- 用户资料能重新加载。
- 邮箱、`BASE`、`POSITION` 与刷新前一致。
- 加载期间不闪现旧 mock 用户信息。

## 回归范围

- 登录态恢复。
- Dashboard 路由重定向。
- 左侧 Dashboard 用户卡片布局。
- Bidding Calendar 首屏加载不受影响。
