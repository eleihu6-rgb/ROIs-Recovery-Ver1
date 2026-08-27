# PBS Portal 登录页自动填充隔离修复设计

## 背景

用户在同一个浏览器环境中使用 Admin 和 PBS Portal 时，Portal 登录页可能被 Chrome 自动填入 Admin 侧保存过的账号和密码，例如用户名框自动出现 `Qin`。这会造成两个问题：

- 员工侧 Portal 登录页看起来像系统主动记住了上一次账号，容易误导用户。
- Admin 与 Portal 同源或相近登录表单时，浏览器密码管理器可能把不同系统的凭证混用。

## 已有修复记录

这个问题已经做过一轮修复：

- 提交：`c7b4aca9 fix: isolate login autofill forms`
- 时间：`2026-07-06 14:01:02 +0800`
- 旧 spec：`docs/superpowers/specs/2026-07-06-login-autofill-dom-isolation-design.md`

当时的修复目标是：**保留浏览器自动填充，同时通过 DOM 表单身份隔离降低 `/altair` Admin 凭证误填到 `/pbs` Portal 的概率。**

当时已完成的代码措施：

- Portal 登录 form 增加 `id="pbs-portal-login-form"`、`name="pbs-portal-login-form"`、`action`、`method="post"`、`autoComplete="on"`。
- Portal 用户名字段从通用 `name="userCode"` 改为 `name="pbsPortalUserCode"`。
- Portal 密码字段从通用 `name="password"` 改为 `name="pbsPortalPassword"`。
- Portal autocomplete 从通用 `username/current-password` 改为 `section-pbs-portal username/current-password`。
- Gantt/Admin 登录页同步改为 `altair-login-form`、`altairUserCode`、`altairPassword`、`section-altair ...`，并更新 autofill sync 读取字段。

因此，本轮不是重复做旧方案，而是处理旧方案后的残余问题：**Chrome 仍可能在同 origin 下忽略或弱化这些 DOM hint，继续把 Admin 凭证默认填入 Portal。**

当前代码事实：

- `pbs-portal/src/features/auth/pages/login-page.tsx` 中 `userCode` / `password` React state 初始值为空。
- Portal 登录页没有把用户名写入 `localStorage`。
- 登录态 token 使用 auth store / session 逻辑，不用于回填用户名。
- 当前表单已经应用 2026-07-06 的 DOM 隔离修复，但仍保留 `autoComplete="on"`、`username` 和 `current-password` 语义。

因此本轮修复目标不是清理系统保存的用户名，也不是重复做 DOM 身份隔离；目标是进一步降低浏览器把 Admin 凭证自动填入 Portal 登录表单的概率。

## 目标

1. Portal 登录页首次打开时不应自动出现 Admin 保存过的账号或密码。
2. 保持现有账号密码登录流程、SSO 登录流程、redirect return-to 逻辑不变。
3. 不改变认证 API、密码加密逻辑、auth store 或后端接口。
4. 不影响用户手动输入和提交。
5. 改动范围必须限制在登录页及其测试 / QA 文档，不触碰当前工作区其他任务文件。

## 非目标

- 不删除用户浏览器中已经保存的密码。
- 不实现跨系统账号隔离的域名 / subdomain 调整；这是部署层面方案，不在本轮代码修改范围。
- 不改变 Admin 系统登录页。
- 不新增依赖。
- 不改变 UI 视觉布局。

## 方案对比

### 方案 A：继续保留 2026-07-06 的 DOM 隔离方案

优点：

- 已经存在，无新增代码改动。
- 仍允许浏览器密码管理器按 Portal 表单保存和填充。

缺点：

- 如果当前截图是在该提交之后复现，就说明隔离强度不够，Chrome 仍可能把 Admin 凭证填进来。
- 无法解决用户截图里的误导问题。

结论：不采用。

### 方案 B：Portal 登录表单关闭默认自动填充，并避免通用 username/current-password 语义

做法：

- 将 Portal 登录 form 从 `autoComplete="on"` 改为更强的 no-autofill 语义。
- 用户名输入框使用 `autoComplete="off"`，避免被识别为通用 username。
- 密码输入框使用 `autoComplete="off"`，避免 `current-password` 触发同源保存密码默认填充。
- 保持 input `name` 仍为 Portal 专属命名，不改提交 payload。

优点：

- 改动小，集中在登录页。
- 不影响认证链路和后端。
- 对当前问题最直接。

缺点：

- Chrome 对登录表单的 `autocomplete="off"` 并非绝对遵守，不能承诺 100% 阻止所有密码管理器。
- 用户可能无法在 Portal 登录页继续享受浏览器一键默认填充；仍可手动输入或通过密码管理器主动选择。

结论：推荐采用。

### 方案 C：通过隐藏 dummy input 或延迟渲染输入框绕过 Chrome autofill

优点：

- 对部分浏览器自动填充策略更强。

缺点：

- 属于对浏览器行为的 hack，维护成本高。
- 可能影响无障碍、测试稳定性和密码管理器兼容性。
- 不符合最小正确改动原则。

结论：本轮不采用；只有方案 B 仍无法缓解时再评估。

## 推荐设计

采用方案 B 作为二阶段增强。

登录页表单仍保留当前视觉和交互。用户看到的字段仍是 `User Code` 和 `Password`，提交按钮、SSO 按钮、密码显示 / 清空按钮都不变。

实现时只调整浏览器自动填充相关属性：

- form：从允许自动填充改为关闭自动填充。
- User Code input：不再使用通用 `username` token，改为 `autoComplete="off"`。
- Password input：不再使用 `current-password` token，改为 `autoComplete="off"`，避免被 Chrome 当成同源已有登录凭证目标。
- Gantt/Admin 登录页保持 2026-07-06 的隔离方案不变；本轮只收紧 Portal 端，避免扩大影响面。

如果实现后发现 Chrome 仍自动填充，才追加方案 C 的更强隔离；本轮 spec 不默认使用 hack。

## 数据流与边界

不改变数据流：

1. 用户手动输入 `userCode` 和 `password`。
2. `handleSubmit` 继续做空值校验。
3. 登录请求仍走 `useAuthSessionStore.login`。
4. `authService.login` 仍先获取公钥并加密密码，再 POST 到 `/auth/session`。
5. 登录成功后仍按现有 return-to 规则导航。

不新增前端存储，不新增后端字段。

## 测试要求

自动化测试：

- 更新或新增登录页 / router 相关 Vitest，断言登录表单和两个输入框具备 Portal 专属的 autocomplete 隔离属性。
- 保留现有 password sign-in redirect 测试，确认提交 payload 仍是 `{ userCode, password }`。

Playwright：

- 这是登录页核心交互 bug 修复，按项目规则需要真实 UI 覆盖。
- 推荐新增一个轻量 Playwright 用例：打开 `/login`，断言 `User Code` / `Password` 初始为空，并能手动输入后触发正常登录 mock 流程。
- 若现有登录 E2E 已有同类 mock 基础，可扩展现有 spec。

QA 人工测试：

- 在 `docs/test-cases/pbs/auth/` 新增测试用例。
- 覆盖同一浏览器中 Admin 已保存账号后，打开 PBS Portal 登录页不应自动显示 Admin 用户名。
- 覆盖用户仍可手动输入并登录。

验证命令建议：

- `cd pbs-portal && npm test -- <login/router related tests>`
- `cd pbs-portal && npm run lint`
- `cd pbs-portal && npm run build`
- 对应 Playwright 登录页用例

## 版本与交付

- 本轮运行代码属于 `pbs-portal` 前端改动，按项目规则需要递增 `gantt/src/version.ts` 的 `FRONTEND_VERSION`。
- 当前工作区已有用户正在修改的 `gantt/src/version.ts`。实现阶段必须先检查该文件 diff，避免覆盖或回退用户改动；如无法安全合并版本号，应明确向用户说明并等待处理。
- 纯 spec 文档本身不需要版本号递增。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本修复范围很小，主要集中在登录页属性、少量测试和 QA 文档；多 agent 协调成本高于收益。
- Suggested split: 不建议拆分。
- Write boundaries: 单一实现者负责 `pbs-portal/src/features/auth/pages/login-page.tsx`、登录相关测试、QA 文档和必要版本号。
- Conflict risk: 当前工作区已有用户改动，尤其 `gantt/src/version.ts` 已被修改；实现时必须避免误 stage / 误覆盖。
- Execution gate: 只有在用户确认本 spec 后才允许修改运行代码。

## 验收标准

1. Portal 登录页不再主动显示 Admin 保存过的用户名。
2. `User Code` 和 `Password` 初始 React state 仍为空。
3. 手动输入账号密码后仍能正常调用现有登录流程。
4. SSO 登录入口不受影响。
5. 自动化测试、Playwright 或明确说明的替代验证覆盖此回归。
6. 不修改 Standing Bid 等当前用户正在开发的无关文件。
