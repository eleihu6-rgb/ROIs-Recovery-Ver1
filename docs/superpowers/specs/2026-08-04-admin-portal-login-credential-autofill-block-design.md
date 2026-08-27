# Admin / PBS Portal 登录凭据自动填充阻断设计

## 背景与结论

SIT 中 Admin（Gantt）和 PBS Portal 使用同一域名、不同路径。用户先登录 Portal，再登录 Admin，之后重新打开 Portal 时，Chrome 可能把 Admin 的用户名和密码填入 Portal。

现有两轮修复都仍在当前分支，并未被回滚：

- `c7b4aca9` 使用不同的 form、field name 和 autocomplete section 区分两个登录页。
- `deb1e84c` 在 Portal 表单及输入框上设置 `autocomplete="off"`。

问题仍然发生，是因为 Chrome 密码管理器主要按 origin 和登录表单启发式判断，可能忽略 `autocomplete="off"`，而同域不同路径不能形成可靠的密码库隔离。同时，Admin 当前还设置了 `autocomplete="on"`，并在页面加载后主动读取浏览器自动填入的值。

本轮采用产品已确认的规则：**Admin 和 PBS Portal 登录页都不允许自动带入浏览器记住的账号或密码。**

## 目标

1. 每次打开 Admin 或 PBS Portal 登录页时，在用户尚未主动操作凭据字段前，用户名和密码字段均为空。
2. 从 Portal 切换到 Admin、再切回 Portal 时，任一页面在首次展示及受保护阶段都不得静默出现另一页面或本页面之前使用的凭据。
3. 页面不得主动读取、同步或保留浏览器自动填入的凭据。
4. 用户主动点击或通过键盘进入字段后，仍可正常输入、显示/隐藏密码、按 Enter 提交并完成登录。
5. 不改变认证 API、密码加密、会话 token、SSO、redirect 或登录成功后的页面行为。

## 浏览器能力边界

网页无法删除或禁止用户在 Chrome 密码管理器中保存凭据，也无法对所有浏览器扩展作绝对控制。本功能承诺的是：

- 应用自身不持久化用户名或密码；
- 登录页初次展示及字段受保护期间不接受浏览器静默自动填值；
- 用户未主动操作输入框前，字段保持为空；
- 用户点击字段或通过键盘进入编辑后，浏览器扩展或密码管理器仍可能展示候选项。用户主动点选候选项产生的填入不属于静默自动填充，网页无法禁止该行为；
- 同域名且不改变浏览器设置的前提下，网页不能绝对禁止 Chrome 密码库保存凭据。本方案以“应用不保存、初始不带入、受保护阶段不接受、用户主动输入可用”为可验证承诺。

## 推荐方案

### 1. 两个页面统一关闭凭据自动填充语义

- Admin form 从 `autocomplete="on"` 改为关闭自动填充。
- Admin 用户名和密码字段移除 `section-altair username/current-password`。
- Portal 保持专属字段身份，但不再只依赖 `autocomplete="off"`。
- 两边用户名和密码字段均明确使用 `autocomplete="off"`，不再声明 `username`、`current-password` 或其他凭据语义。
- 两边均不得在 localStorage、sessionStorage、Zustand 或其他应用状态中保存登录凭据。

最终 DOM 属性必须一致如下：

| 页面 | 元素 | `name` | `autocomplete` | 初始 `readOnly` |
|------|------|--------|----------------|------------------|
| Admin | form | `altair-login-form` | `off` | 不适用 |
| Admin | username | `altairUserCode` | `off` | `true` |
| Admin | password | `altairPassword` | `off` | `true` |
| Portal | form | `pbs-portal-login-form` | `off` | 不适用 |
| Portal | username | `pbsPortalUserCode` | `off` | `true` |
| Portal | password | `pbsPortalPassword` | `off` | `true` |

### 2. 增加“用户主动操作后解锁”的输入保护

两个登录页的凭据输入框首次渲染为只读且值为空。每个字段独立使用以下状态机：

| 状态 | 字段行为 | 进入条件 | 离开条件 |
|------|----------|----------|----------|
| `protected` | `readOnly=true`，React state 与 DOM value 必须为空；拒绝浏览器静默填值 | 首次渲染、重新挂载、`pageshow` 的 BFCache 恢复 | 字段收到可信的 `pointerdown`，或字段已聚焦后收到用于编辑的 `keydown` |
| `unlocked` | `readOnly=false`，允许正常编辑；停止该字段的自动清理任务 | 用户主动操作对应字段 | 首次真实编辑产生非空或删除操作后进入 `edited`；保持空值时仍可继续编辑 |
| `edited` | 只服从受控 React state，不再运行自动清理 | 用户真实输入/删除 | 页面卸载、新的登录页实例，或 BFCache `pageshow` 恢复时重新回到 `protected` |

事件规则：

- `focus` 本身不解锁，因为 Admin 当前存在 `autoFocus`，程序化聚焦不能被当作用户意图。
- 鼠标/触摸在 `pointerdown` 阶段同步解除当前 DOM input 的 `readOnly`，确保随后的 focus 可以直接输入。
- 键盘 Tab 进入只读字段后，首个编辑键的 `keydown` 同步解除 `readOnly`，默认字符输入继续执行，不能吞掉首字符。
- 用户名字段按 Enter 跳到密码字段时，只移动焦点；密码字段仍保持 `protected`，直到用户的下一次编辑键或 pointer 操作。
- 所有异步清理任务执行前必须再次检查字段仍为 `protected`；一旦进入 `unlocked/edited` 必须取消，禁止覆盖真实输入。
- 页面通过 BFCache `pageshow` 恢复到登录页时，无论恢复前是否编辑过，两个字段都重置为 `protected` 并清空 React state 与 DOM value。这是登录凭据页面的安全规则，返回登录页不保留未提交输入；正常已登录页面流程不受影响。

在字段仍为 `protected` 期间：

- 页面加载、BFCache 恢复以及字段处于保护状态的整个期间，拦截或清理浏览器写入 DOM 的凭据值；不使用一个可能提前结束的固定“填充窗口”；
- 不将浏览器写入的 DOM 值同步进 React state；
- 用户一旦主动开始输入，立即停止清理，绝不覆盖用户输入。

该保护只用于登录凭据字段，不影响业务表单。

### 3. 删除 Admin 的主动 autofill 同步

删除 Admin 登录页当前在 mount 后 250ms 读取 form DOM 并写回 `userCode/password` state 的逻辑。该逻辑与新规则直接冲突，是当前 Admin 接受浏览器凭据的明确入口。

同时修改 Admin `handleSubmit`：登录 payload 只能来自受控的 `userCode/password` React state，不得再从 `form.elements` 读取并优先使用 DOM value。这样即使浏览器或扩展绕过只读保护修改了 DOM，也不能被应用直接提交。

### 4. 保持现有交互与认证链路

- 登录页视觉布局和文案不变。
- 用户名、密码校验不变。
- Password show/hide、清空、Enter 键和 loading/error 状态不变。
- Admin 继续调用现有 `useAuthStore.login`。
- Portal 继续调用现有加密登录流程及 SSO 流程。

## 不采用的方案

### 仅使用 `autocomplete="off"`

现网已经使用且仍复现，不能继续作为唯一措施。

### 使用隐藏 dummy 用户名/密码字段吸收自动填充

依赖浏览器启发式，容易随 Chrome 版本变化，也可能影响无障碍和密码管理器行为，不作为首选。

### 拆分域名

隔离效果最好，但产品已明确 Admin 与 Portal 保持同一域名，因此不在范围内。

## 影响范围

- `gantt/src/components/auth/login-page.tsx`
- Gantt 登录页相关 Vitest / Playwright
- `pbs-portal/src/features/auth/pages/login-page.tsx`
- Portal 登录页相关 Vitest / Playwright
- PBS Auth QA 人工测试用例

不修改 live-server、pbs-server、数据库或认证接口。

## 错误处理与安全

- 不记录用户名和密码到日志。
- 不新增浏览器存储。
- 输入保护不得改变密码请求加密方式。
- 登录失败仍使用现有页面错误状态，不新增重复 toast。
- 清理逻辑必须只在用户尚未主动编辑时运行，避免清除真实输入；唯一例外是 BFCache 恢复到登录页，此时按安全规则统一清空未提交凭据。

## 测试设计

### 自动化测试

1. Admin 与 Portal 登录页首次渲染时两个字段均为空且处于 `protected`。
2. 模拟浏览器在用户操作前直接修改 input DOM value，保护逻辑将其清空且不写入 React state。
3. `focus` 和 Admin 的 `autoFocus` 不解除保护；pointer 操作可解锁；Tab 后首个编辑键不会丢失字符。
4. 用户名按 Enter 跳转密码后，密码仍受保护；用户输入后跨越最长异步清理周期，值仍完整保留。
5. Admin 不再包含主动 autofill DOM 同步逻辑及允许自动填充的属性。
6. 向 Admin input DOM 注入非 state 值后提交，最终 payload 仍只包含受控 state，不能提交被注入值。
7. Portal 与 Admin 仍可手动输入并提交原有登录 payload。
8. `pageshow`/BFCache 恢复到登录页时，统一清空静默值和未提交的真实编辑，并重新进入 `protected`。
9. 密码显示/隐藏、Enter 提交、SSO 与 redirect 相关既有测试继续通过。

### Playwright 与人工 Chrome 验证

自动化浏览器无法直接控制真实 Chrome 密码库，因此必须同时执行人工回归：

前置条件：

- 使用一个专门的干净 Chrome profile，禁用第三方密码管理扩展，记录 Chrome 版本。
- 开启 Chrome 的密码保存与自动登录/自动填充功能。
- 确认账号 A（Portal）和账号 B（Admin）均已保存到同一 SIT origin 的 Chrome 密码库；在 Chrome Password Manager 中可以看到对应条目。

步骤：

1. 同一 Chrome、同一 SIT 域名，先用已保存账号 A 登录 Portal。
2. 登出后用已保存账号 B 登录 Admin。
3. 再打开 Portal 登录页，不操作字段，等待至少 2 秒；账号和密码必须保持为空。
4. 再打开 Admin 登录页，不操作字段，等待至少 2 秒；账号和密码必须保持为空。
5. 两边分别通过鼠标和键盘开始输入，等待至少 2 秒后输入值仍保留，并能正常登录。
6. 使用前进/后退及刷新返回登录页，不操作字段并等待至少 2 秒，字段仍为空。
7. 若密码管理器弹出候选列表，不选择任何条目；候选 UI 可以出现，但不得在未选择时静默写入字段。

## 验收标准

1. Admin 和 Portal 登录页首次可见且用户尚未操作字段时，用户名和密码为空。
2. 同域名、不同路径切换时，在 `protected` 阶段不会静默串填凭据。
3. 用户主动输入不会被保护逻辑清除；通过 BFCache 返回登录页时统一清空属于明确的安全例外。
4. 登录、SSO、redirect、错误反馈和会话恢复没有回归。
5. 两个页面均有真实 UI Playwright 回归；Chrome 密码库场景有人工测试记录。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个登录页的行为必须保持一致，改动规模小且测试契约紧密，拆分会增加实现偏差。
- Suggested split: 单一实现者依次修改共享行为、Admin、Portal 和测试。
- Write boundaries: 仅限两个登录页、相关测试及 QA 文档。
- Conflict risk: 低；但必须保留工作区已有无关文件。
- Execution gate: 用户审核并批准本 spec 后才能开始实现。
