# Portal 与 Gantt 恢复浏览器凭据自动填充实施计划

1. 用共享的 `useCredentialAutofillSync` 替换凭据拦截 hook，仅同步浏览器静默写入的表单值到 React 状态。
2. Gantt 登录表单恢复标准 `autocomplete`，使用 `section-altair` 隔离凭据分组。
3. PBS Portal 登录表单恢复标准 `autocomplete`，使用 `section-pbs` 隔离凭据分组。
4. 更新单元测试与 Playwright 登录测试，覆盖标准属性、非只读输入和静默填值同步。
5. 执行共享 UI 类型检查、两端定向测试、UI 规范检查和 GitNexus 变更范围检查。
