# 版本号管理（Version Bumping）

> 从根 `CLAUDE.md` 移出的完整规范；根指南保留强制要点摘要。

> 版本号用于快速确认当前本机/部署运行态，不再写入 tracked 源码，避免每次提交都修改同一个文件。

- **版本来源**：`live-server/version.tmp`（JSON，本机运行态文件，已加入 `.gitignore`），由 `scripts/version-state.mjs` 创建、读取、递增。
- **格式**：全局 Gantt 显示 `Ver:B{backend}/F{frontend}/R{rule}`；PBS 显示 `Ver:B{pbsBackend}/F{pbsFrontend}`。
- **展示位置**：gantt 顶部导航与 ThemeSwitcher 下拉中（与 `__APP_VERSION__` 的 commit/构建时间并列）。
- **递增时机**：
  - `gantt` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `frontend`。
  - Vite HMR 完成热更新时，自动递增全局 `frontend` 并推送到页面。
  - `live-server` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `backend`。
  - `connector-server` 执行 `npm run dev` / `npm run build` 前，自动递增全局 `backend`。
  - `pbs-server` 执行 `npm run dev` / `npm run build` 前，自动递增 `pbsBackend`。
  - `pbs-portal` 执行 `npm run dev` / `npm run build` 前，自动递增 `pbsFrontend`。
- **不要手动修改 tracked 文件来 bump 版本**；`gantt/src/version.ts` 已废弃并删除。
- **永不回退**：版本号只增不减，不复用旧值。若需手动修正本机运行态，仅编辑 ignored 的 `live-server/version.tmp`。
- 纯文档（`docs/`、`*.md`）、注释、E2E 测试数据等非运行代码改动可不递增。

