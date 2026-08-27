# Login Autofill DOM Isolation Design

> 状态：Draft，等待用户 review / approval  
> 日期：2026-07-06  
> 范围：Gantt/Admin `/altair` 登录页、PBS Portal `/pbs` 登录页  
> 目标：在同一域名不同路径部署下，保留浏览器自动填充，同时降低 Admin 用户名误填到 Portal 的概率

## 背景

UAT / SIT 会长期采用同一域名不同路径的部署方式：

- `https://crew-f8-usva-uat.roiscloud.com/altair`
- `https://crew-f8-usva-uat.roiscloud.com/pbs`

用户反馈的现象是：同一个 Chrome 浏览器中，先用 `654` 登录 Portal，再用 `Qin` 登录 Admin，之后重新打开 Portal 登录页时，Portal 用户名区域默认显示 `Qin`。

代码核查结论：

- Portal 登录态存储 key 是 `pbs-portal.auth.token`，位置是 `sessionStorage`。
- Gantt/Admin 登录态存储 key 是 `rois-auth`，位置也是 `sessionStorage`。
- 两边登录态 key 不同，未发现共用 `lastLoginUser` / `rememberMe` / localStorage 用户名。
- 后端登录返回 JWT payload，当前未看到服务端通过 `Set-Cookie` 写登录 session。
- 两个登录页都使用标准用户名/密码 autocomplete 语义：
  - Portal：`autoComplete="username"` / `autoComplete="current-password"`
  - Gantt/Admin：`name="username"` / `autoComplete="username"`，并有 autofill sync 读取 `form.elements.namedItem('username')`

因此，当前更可能是 Chrome 密码管理器在同一 origin 下，把两个路径的登录表单识别为同一类账号表单，导致最近使用的 Admin 凭据回填到 Portal。

## 需求理解

目标：

- 仍然允许浏览器自动填充用户名和密码。
- 不引入 `localStorage` / `sessionStorage` 来保存“上次登录用户名”。
- 尽量只修改登录表单 DOM 属性和与字段名强相关的读取逻辑。
- 在 `/altair` 与 `/pbs` 同域部署下，让浏览器密码管理器更容易把两套登录表单识别为不同分组。

非目标：

- 不修改部署域名。
- 不改变认证接口、JWT、登录态存储策略。
- 不新增 cookie session。
- 不实现自定义“记住用户名”功能。
- 不禁用浏览器密码管理器。

## 方案选项

### 方案 A：只改 `autocomplete` section token

做法：

- Portal 用户名：`autoComplete="section-pbs-portal username"`
- Portal 密码：`autoComplete="section-pbs-portal current-password"`
- Admin 用户名：`autoComplete="section-altair username"`
- Admin 密码：`autoComplete="section-altair current-password"`

优点：

- 改动最小。
- 保留浏览器自动填充。
- 符合 HTML autocomplete 的分组语义。

缺点：

- Chrome 对保存密码的站点匹配不只看 `autocomplete`，同 origin 下仍可能串。
- 当前两个表单的字段名仍偏通用，浏览器启发式可能继续把它们视作同类登录表单。

### 方案 B：DOM-only 表单身份隔离（推荐）

做法：

- 为两套登录表单设置不同的 `id` / `name` / `action` / `method`。
- 为用户名和密码 input 设置应用特定的 `name`。
- 同时保留标准 autocomplete token，并加不同 `section-*` 分组。

Portal：

```tsx
<form
  id="pbs-portal-login-form"
  name="pbs-portal-login-form"
  autoComplete="on"
  action={`${env.apiBaseUrl}/auth/session`}
  method="post"
  onSubmit={handleSubmit}
>
  <Input
    name="pbsPortalUserCode"
    autoComplete="section-pbs-portal username"
    ...
  />
  <Input
    name="pbsPortalPassword"
    autoComplete="section-pbs-portal current-password"
    ...
  />
</form>
```

Gantt/Admin：

```tsx
<form
  id="altair-login-form"
  name="altair-login-form"
  autoComplete="on"
  action={`${LIVE_API_BASE}/api/auth/login`}
  method="post"
  onSubmit={handleSubmit}
>
  <input
    name="altairUserCode"
    autoComplete="section-altair username"
    ...
  />
  <input
    name="altairPassword"
    autoComplete="section-altair current-password"
    ...
  />
</form>
```

优点：

- 仍由浏览器自动填充，不引入 app 自己的用户名记忆。
- 比只改 `autocomplete` 更容易让浏览器密码管理器区分两套表单。
- `action` 虽然会被 React `preventDefault()` 阻止实际提交，但可为浏览器密码管理器提供更清晰的表单身份线索。
- 不改变后端接口、不改变 auth storage、不影响登录请求 payload。

缺点：

- 仍不是强隔离；Chrome 保存密码逻辑不是完全由标准 DOM 属性决定。
- Gantt/Admin 现有 autofill sync 读取 `username` / `password`，字段改名后必须同步更新读取目标。

### 方案 C：关闭 Portal 用户名自动填充

做法：

- Portal 用户名或 form 使用 `autoComplete="off"` / 非登录语义 token。

优点：

- 可以避免 Portal 被 Admin 用户名自动回填。

缺点：

- 违反本次约束：用户希望保留自动填用户名。
- 会降低员工端登录体验。

## 推荐方案

采用方案 B：DOM-only 表单身份隔离。

推荐理由：

- 满足“不要 localStorage，仍自动填用户名”的约束。
- 改动集中在两个登录页，不触碰后端认证和 token 存储。
- 使用标准 HTML autocomplete 分组 token，不做 hack 式清空输入框。
- 对 Chrome 密码管理器提供多维度差异：form identity、field name、autocomplete section、action path。

## 设计细节

### Portal 登录页

目标文件：

- `pbs-portal/src/features/auth/pages/login-page.tsx`

变更点：

- `<form>` 增加：
  - `id="pbs-portal-login-form"`
  - `name="pbs-portal-login-form"`
  - `autoComplete="on"`
  - `action={`${env.apiBaseUrl}/auth/session`}`
  - `method="post"`
- User Code input：
  - `name="pbsPortalUserCode"`
  - `autoComplete="section-pbs-portal username"`
- Password input：
  - `name="pbsPortalPassword"`
  - `autoComplete="section-pbs-portal current-password"`

注意：

- React state 仍使用现有 `userCode` / `password`。
- `handleSubmit` 仍调用 `login({ userCode: userCode.trim(), password })`。
- 不新增任何 storage。
- 不改变 SSO button 行为。

### Gantt/Admin 登录页

目标文件：

- `gantt/src/components/auth/login-page.tsx`

变更点：

- 引入或复用 `LIVE_API_BASE`，用于 form `action`。
- `<form>` 增加：
  - `id="altair-login-form"`
  - `name="altair-login-form"`
  - `autoComplete="on"`
  - `action={`${LIVE_API_BASE}/api/auth/login`}`
  - `method="post"`
- User Name input：
  - `name="altairUserCode"`
  - `autoComplete="section-altair username"`
- Password input：
  - `name="altairPassword"`
  - `autoComplete="section-altair current-password"`
- 更新 autofill sync：
  - 从 `form.elements.namedItem('username')` 改为 `form.elements.namedItem('altairUserCode')`
  - 从 `form.elements.namedItem('password')` 改为 `form.elements.namedItem('altairPassword')`
- 更新 submit 兜底读取：
  - 从 `username` / `password` 改为 `altairUserCode` / `altairPassword`

注意：

- `login(u, p)` 调用不变。
- 不改变 JWT 写入 `sessionStorage` 的逻辑。
- 不改变用户大小写规则。

## 用户体验预期

目标行为：

1. 在同一 Chrome 中打开 `/pbs`，使用 Portal 用户 `654` 登录。
2. 打开 `/altair`，使用 Admin 用户 `Qin` 登录。
3. 再次打开 `/pbs` 登录页。
4. Chrome 不应把 `/altair` 的 `Qin` 作为 Portal 用户名默认回填。
5. Chrome 仍可为 `/pbs` 提供 Portal 相关凭据建议，也仍可为 `/altair` 提供 Admin 相关凭据建议。

可接受边界：

- 如果用户手动在 Chrome 密码管理器中选择 `Qin` 这组凭据，浏览器仍可能填入 `Qin`。本方案目标是避免“默认误回填”，不是禁止用户主动选择。
- 不同 Chrome 版本、企业策略、已有保存密码记录可能影响结果；验证时应使用干净 profile 和已有混合凭据 profile 各测一次。

## 验证计划

### 自动化测试

建议新增或更新前端单元/组件测试，验证 DOM 属性：

- Portal 登录页 form 存在 `id="pbs-portal-login-form"`、`name="pbs-portal-login-form"`、`method="post"`。
- Portal User Code input 的 `name` 是 `pbsPortalUserCode`，`autocomplete` 是 `section-pbs-portal username`。
- Portal Password input 的 `name` 是 `pbsPortalPassword`，`autocomplete` 是 `section-pbs-portal current-password`。
- Gantt/Admin 登录页 form 存在 `id="altair-login-form"`、`name="altair-login-form"`、`method="post"`。
- Gantt/Admin User Name input 的 `name` 是 `altairUserCode`，`autocomplete` 是 `section-altair username`。
- Gantt/Admin Password input 的 `name` 是 `altairPassword`，`autocomplete` 是 `section-altair current-password`。
- Gantt/Admin autofill sync 和 submit 仍能读取改名后的字段。

### 手工验证

需要真实 Chrome 验证，因为浏览器密码管理器行为不能完全由 jsdom / Playwright 断言。

建议步骤：

1. 使用同一个 Chrome profile。
2. 清理或准备两组已保存凭据：Portal 用户 `654`，Admin 用户 `Qin`。
3. 打开 `/pbs`，确认浏览器可提示 Portal 凭据。
4. 登录 Portal。
5. 打开 `/altair`，确认浏览器可提示 Admin 凭据。
6. 登录 Admin。
7. 回到 `/pbs` 登录页。
8. 观察 Portal 用户名是否仍被默认填成 `Qin`。
9. 打开 Chrome Password Manager 检查两组保存记录是否能以表单差异区分。

### 回归范围

- Portal password login。
- Portal SSO 登录入口不应受影响。
- Gantt/Admin password login。
- Gantt/Admin 浏览器自动填充后点击 Sign In。
- Gantt/Admin 用户名输入框 Enter 跳转密码框行为。

## 风险与缓解

风险：

- Chrome 仍可能忽略部分 DOM hints，继续按 origin 合并凭据。

缓解：

- 同时提供 `section-*`、应用特定 input `name`、form `id/name`、form `action` 多个差异信号。
- 如果该方案在真实 Chrome 中仍不稳定，再单独评估是否需要更强策略，例如 Portal 禁用默认自动填但保留浏览器密码建议，或引入用户明确选择账号的 UI。

风险：

- 改 input `name` 后，Gantt/Admin autofill sync 读取不到浏览器填充值。

缓解：

- 同步更新 `namedItem()` 读取目标，并增加测试覆盖。

风险：

- form `action` 与实际 API base 在不同环境不一致。

缓解：

- Portal 使用现有 `env.apiBaseUrl` 拼接 `/auth/session`。
- Gantt/Admin 使用现有 `LIVE_API_BASE` 拼接 `/api/auth/login`。
- React submit 仍 `preventDefault()`，`action` 主要服务浏览器凭据识别，不作为实际请求来源。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 任务很小，主要改两个登录页和相邻测试；并行会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: 单人实现时仅触碰 Portal 登录页、Gantt/Admin 登录页、相关测试和必要版本号。
- Conflict risk: 低，但两个登录页都属于认证入口，需避免同时被其他任务改动。
- Execution gate: 用户 review 并批准本 spec 后，再进入实现。

## Acceptance Criteria

- Portal 和 Gantt/Admin 登录页仍支持浏览器自动填充。
- 两套登录表单具备不同的 form `id/name/action`。
- 两套用户名/密码 input 具备不同的应用特定 `name`。
- 两套 input 使用不同 `section-*` autocomplete 分组。
- 不新增 localStorage/sessionStorage 用户名记忆。
- 不修改后端登录接口和 token 存储策略。
- Gantt/Admin autofill sync 和 submit 读取逻辑跟随字段名更新。
- 相关测试覆盖 DOM 属性和登录提交读取逻辑。
- 手工 Chrome 验证记录结果；若 Chrome 仍串填，明确记录残余风险。
