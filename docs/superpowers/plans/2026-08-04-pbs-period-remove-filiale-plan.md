# PBS Period 移除 Filiale 实施计划

1. 更新 Live Server Period schema、查询映射和年度生成逻辑，删除合成 Filiale，并为旧字段增加 400 回归测试。
2. 更新 Gantt Period 类型与页面，移除新增、编辑、年度生成和列表中的 Filiale。
3. 更新 Playwright，验证真实页面没有 Filiale 控件、请求体没有该字段，核心操作仍成功。
4. 运行前后端类型检查、聚焦测试、构建、UI 标准检查和真实 Playwright 回归。
5. 核对 GitNexus 影响范围与 Git diff，仅保留本任务文件，不提交 Git。
