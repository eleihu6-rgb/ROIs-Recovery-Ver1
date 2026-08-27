# Portal 与 Live Gantt 恢复浏览器凭据自动填充设计

## 背景

Portal 与 Live Gantt 当前通过共享 `useCredentialAutofillGuard` 阻止浏览器自动填充登录凭据。该保护会让用户名和密码初始只读、持续清理浏览器静默写入的 DOM 值，并在用户主动点击或输入后才解锁。

用户反馈认为浏览器记住并自动填写账号密码更重要，即使同域名下 Portal 与 Live Gantt 偶尔串用上一次凭据，也优于每次手动输入。

## 目标

- Portal 和 Live Gantt 均恢复浏览器保存与自动填充登录凭据。
- 移除强制清空、只读解锁和轮询清理行为。
- 使用标准 autocomplete token 尽量帮助浏览器区分两个应用，但不承诺完全避免串填。
- 登录提交、校验、SSO 和错误处理保持不变。

## 设计

### Live Gantt

- 登录表单使用 `autoComplete="on"`。
- 用户名使用 `autoComplete="section-altair username"`。
- 密码使用 `autoComplete="section-altair current-password"`。
- 移除 `useCredentialAutofillGuard`、初始只读和 DOM 清理逻辑。
- 使用新的共享 `useCredentialAutofillSync` 将浏览器静默写入的表单 DOM 值同步到 React state，使按钮状态和提交值保持一致。

### Portal

- 登录表单使用 `autoComplete="on"`。
- User Code 使用 `autoComplete="section-pbs username"`。
- Password 使用 `autoComplete="section-pbs current-password"`。
- 移除 `useCredentialAutofillGuard`、初始只读和 DOM 清理逻辑。
- 使用同一个 `useCredentialAutofillSync` 同步 User Code 和 Password 的静默 autofill DOM 值。
- 保持密码登录、SSO 回调、redirect 和现有校验不变。

### 共享 UI 与状态同步

- 确认 `useCredentialAutofillGuard` 不再有其他消费者后，删除 Guard Hook 文件及公共导出。
- 新增职责单一的 `useCredentialAutofillSync`：定期读取指定 form 中的真实 credential input 值，仅当 DOM 值与当前 React value 不同时调用对应 setter。
- 同步只复制值到页面内存状态，不写入 localStorage/sessionStorage，不发起请求，也不记录日志。
- Hook 在组件卸载时清理定时器，并处理浏览器后退缓存恢复后的表单值。
- 不保留旧 Guard 的只读、清空或兼容开关。

## 测试

- 更新 Gantt 登录单元测试：表单和字段具有标准 autocomplete token，字段非只读；模拟无 `input/change` 事件的 DOM 写入后，按钮可用且提交使用同步后的凭据。
- 更新 Portal 登录单元测试：表单和字段具有标准 autocomplete token，字段非只读；模拟静默 DOM 写入后，登录调用使用同步后的凭据。
- 更新 Gantt 与 Portal Playwright：真实登录页暴露正确 autocomplete 属性，并分别覆盖静默 DOM autofill 同步。
- 删除只验证“浏览器填入后被清空”的旧断言。
- 运行 `packages/ui` 类型/构建检查，并通过全仓搜索确认旧 Guard 无剩余消费者或公共导出。

## 不在范围内

- 不保证所有浏览器或密码管理扩展严格遵循 section token。
- 不修改服务端认证、密码加密、JWT、Session 或 SSO 协议。
- 不新增“记住我”复选框。
- 不存储明文密码到 localStorage/sessionStorage。

## 验收标准

1. Portal 与 Live Gantt 登录表单允许浏览器保存和自动填充。
2. 两个应用分别使用 `section-pbs` 和 `section-altair` token。
3. 用户名和密码输入框不再初始只读，也不再被定时清空。
4. 无 `input/change` 事件的静默 DOM autofill 会同步到 React state，自动填入或手动输入的凭据均可正常提交。
5. 共享 autofill guard 无剩余消费者并被删除。
6. 新共享同步 Hook 不持久化、不记录或外发凭据，并在卸载时清理定时器。
7. `packages/ui`、Gantt、Portal TypeScript/构建、相关单元测试、Playwright 和 UI 标准检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个登录页共用同一 Hook，删除与测试更新存在严格顺序和共享边界。
- Suggested split: 单 Agent 完成共享 Hook、两个登录页及回归测试。
- Write boundaries: `packages/ui`、Gantt 登录、Portal 登录及其对应测试。
- Conflict risk: 中等；实施时避免触碰无关认证逻辑。
- Execution gate: spec 审查通过且用户确认实施后开始。
