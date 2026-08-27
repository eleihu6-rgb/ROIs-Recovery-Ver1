# Portal 与 Live Gantt 浏览器凭据自动填充回归

## 目标

确认两个登录页允许浏览器保存和自动填充账号密码，同时静默填入的值能够进入页面状态并正常提交。

## Live Gantt

1. 打开 Live Gantt 登录页。
2. 确认浏览器可以建议或自动填入已保存的账号密码。
3. 确认用户名输入框使用 `section-altair username`，密码输入框使用 `section-altair current-password`。
4. 接受自动填入后，确认 `Sign In` 按钮可用并能使用该凭据登录。

## PBS Portal

1. 打开 PBS Portal 登录页。
2. 确认浏览器可以建议或自动填入已保存的账号密码。
3. 确认 User Code 使用 `section-pbs username`，Password 使用 `section-pbs current-password`。
4. 接受自动填入后，确认提交使用自动填入的 User Code 和 Password。

## 预期

- 两端输入框均非只读，不会定时清空浏览器填入的内容。
- 两端使用不同的 autocomplete section；同域浏览器仍可能根据自身策略推荐其他已保存账号，这是已接受行为。
- 不向 localStorage、sessionStorage 或日志写入明文密码。
