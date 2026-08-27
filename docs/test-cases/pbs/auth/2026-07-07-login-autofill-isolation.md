# PBS Portal 登录页自动填充隔离人工测试

日期：2026-07-07
范围：PBS Portal 登录页、同域 Admin / Altair 登录页、Chrome 密码管理器自动填充行为

## 背景

2026-07-06 已完成第一阶段 DOM 隔离：Portal 和 Admin 登录页使用不同 form id/name、input name 和 autocomplete section。若同一 Chrome profile 中仍出现 Admin 用户名默认填入 Portal 登录页，本轮将 Portal 登录页默认自动填充进一步关闭。

## 前置条件

- 使用 Chrome 浏览器。
- 使用同一个 Chrome profile。
- Chrome Password Manager 中存在或准备两组凭据：
  - PBS Portal 员工账号，例如 `654` 或测试账号。
  - Admin / Altair 账号，例如 `Qin`。
- PBS Portal 和 Admin / Altair 使用同一测试环境域名的不同路径。

## 测试 1：Portal 登录页不默认显示 Admin 用户名

1. 打开 PBS Portal 登录页。
2. 如浏览器提示保存 Portal 凭据，可保留保存。
3. 登录 Portal 后退出或关闭页面。
4. 打开 Admin / Altair 登录页。
5. 使用 Admin 账号登录，例如 `Qin`。
6. 退出或关闭 Admin 页面。
7. 重新打开 PBS Portal 登录页。

期望结果：

- `User Code` 输入框初始为空。
- `Password` 输入框初始为空。
- 页面不应默认显示 Admin 用户名 `Qin`。
- 如果用户主动从浏览器密码管理器下拉建议中选择某个账号，浏览器仍可能填入；这不属于默认误填。

## 测试 2：Portal 手动登录仍正常

1. 在 PBS Portal 登录页手动输入员工账号。
2. 手动输入密码。
3. 点击 `Sign In`。

期望结果：

- 登录请求正常发出。
- 正确账号进入 Dashboard。
- 错误账号仍停留在 Login 并显示错误。
- Network 中密码仍按 RSA 加密传输，不出现明文密码。

## 测试 3：SSO 入口不受影响

1. 打开 PBS Portal 登录页。
2. 点击 `SSO Login`。

期望结果：

- 仍按现有 SSO 配置跳转。
- 本轮 autofill 隔离不改变 SSO 行为。

## 回归范围

- PBS Portal password login。
- PBS Portal SSO login。
- 未认证访问业务页时回到 `/login?redirect=...`。
- Admin / Altair 登录页不在本轮修改范围，但应确认没有被本轮 Portal 改动影响。
