# Gantt PBS Crew Bid Import UI 对齐整理设计

## 背景

`PBS > PBS Admin > Admin Tools` 的 `Crew Bid Import` 当前把输入条件放在左侧 grid，把导入选项和按钮放在右侧 grid。两组布局的列宽、行高和基线不一致，导致用户第一眼难以判断应该先填哪些条件、再执行哪个动作。

## 目标

1. 只整理 `Crew Bid Import` 区域 UI，不改变导入接口、上传逻辑或按钮行为。
2. 参考刚整理过的 `Algorithm Export`，把 `Period Code` 改为同源下拉框。
3. 简化用户可见条件，只保留真正需要人工选择的字段。
4. 输入框、文件选择框、按钮保持 32px 高度节奏。
5. 大屏下减少左右分裂感，让条件和操作在同一视觉系统里。
6. 窄屏下自然换行，避免内容挤压或溢出。
7. 避免上传文件所属 period 不在下拉列表中时无法选择。
8. 导入成功后，用户可以直接选择本次导入记录并撤回，不需要手动按 period 查找。

## 设计

- 条件字段：
  - `Period Code`
  - `Base`
  - `Scope Crew IDs`
  - `TXT File`
- `Period Code` 使用和 `Algorithm Export` 一样的 PBS period select。
- 选择 TXT 文件后，前端读取文件头部 `Period: ...`：
  - 例如 `Period: March 2026` 转换为 `Mar 2026`。
  - 自动把该 period 加入当前下拉选项。
  - 自动把 `Period Code` 切换到该 period。
  - 若文件没有 `Period:`，保留用户当前选择。
- 隐藏 `Source Period` 和 `Scope Categories`，文件来源 period 由后端解析或留空，category 不暴露给用户。
- 隐藏导入策略 checkbox，前端固定传递默认策略：
  - `useCurrentBidWhenAvailable: true`
  - `fallbackToDefaultBid: true`
  - `firstPairingBidGroupOnly: true`
  - `overwriteCurrentBid: true`
  - `failOnUnmatchedPairing: true`
- `Dry Run` / `Import` 按钮组放在同一行。
- 若已选择文件，文件名显示在按钮组后方或下一行，保持小字号、截断显示。
- `Import` 成功后：
  - 自动记录返回的 `runId`。
  - 自动把 `Import Runs` 查询 period 切换到本次导入的 period。
  - 自动刷新 run list。
  - 自动选中本次导入记录。
- `Import Runs` 表格支持点击行选择 run。
- 选中 run 后，在表格上方显示当前选中记录和 `Rollback Selected Import` 按钮。
- Rollback 默认使用 `restorePrevious=true`，即恢复导入前旧 bid。
- 不新增说明文案，不新增业务逻辑。

## 验收标准

1. `Crew Bid Import` 不再显示 `Source Period`、`Scope Categories` 和导入策略 checkbox。
2. `Period Code` 是下拉框，并复用 PBS period options。
3. 上传 `Period: March 2026` 的 TXT 后，下拉中出现并选中 `Mar 2026`，即使后端 period options 原本没有该值。
4. 大屏下 `Period Code`、`Base`、`Crew IDs`、`TXT File`、按钮形成整齐的一行。
5. Import 成功后，不手动切 period 也能看到并选中本次 run。
6. 点击 `Rollback Selected Import` 可以撤回选中 run；已 rollback 的 run 按钮禁用。
7. `cd gantt && npx tsc --noEmit` 通过。
8. 浏览器截图确认没有重叠、文字溢出或异常空白。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单个前端区域的样式整理，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `gantt/src/components/pbs/pbs-admin-tools.tsx`。
- Conflict risk: 低。
- Execution gate: 用户已确认按统一 grid 对齐方案整理。
