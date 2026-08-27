# Gantt PBS Algorithm Export UI 整理设计

## 背景

`PBS > PBS Admin > Admin Tools` 的 `Algorithm Export` 已支持 PBS period 下拉与 crew scope filters。当前 UI 存在层级和空间问题：顶部操作行、Scope Filters、Crew Filters 三层视觉边框叠加，页面横向空间过大但字段稀疏，按钮与输入框缺少统一节奏。

## 目标

1. 只整理 `Algorithm Export` 区域，不改变后端接口和导出行为。
2. 把 period 选择与下载按钮整理成紧凑 toolbar。
3. 筛选条件参考 `Crew Bid Import` 的直接表单风格，不再显示 `Scope Filters`、`Crew Filters` 或数量 badge。
4. 统一按钮、下拉、filter 字段高度和横向间距。
5. 保留 `Current Package` 主按钮和 `YEG Test Package` 次按钮的优先级。

## 设计

- `Algorithm Export` 内部直接展示条件和按钮：
  - 条件字段：`Period Code`、`Division`、`Status`、`Bases`、`Fleet Quals`。
  - 操作按钮：`Current Package`、`YEG Test Package`。
- 条件布局参考 `Crew Bid Import`：字段用紧凑 grid，按钮放在右侧或窄屏下换行。
- `FILTER` 摘要保留在底部浅色条。
- 不新增说明文字，不新增业务逻辑。

## 对齐细化

- `Algorithm Export` 使用同一个 grid 管理条件和按钮：
  - 大屏：`Period Code / Division / Status / Bases / Fleet Quals / Buttons` 共用一行基线。
  - 窄屏：字段按两列或单列自然换行，按钮跟随表单下方。
- `Fleet Quals` 虽然内部仍使用可添加 tag 的交互，但外层呈现为完整 32px 高输入框，避免只有一个小 `+ Add` 按钮导致视觉塌陷。
- `FILTER` 摘要与条件字段左边缘对齐，并横跨条件字段区域。

## 验收标准

1. `Algorithm Export` 不再显得三层边框叠加。
2. Period 与下载按钮在同一行形成清晰操作区。
3. 页面上不再出现 `Scope Filters`、`Crew Filters` 和筛选数量 badge。
4. `Fleet Quals` 与其它条件字段的输入区域高度一致。
5. 大屏下条件字段与按钮的顶部、底部节奏一致。
6. `gantt && npx tsc --noEmit` 通过。
7. 浏览器截图确认没有重叠、空白过大或文字溢出。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单个前端区域的样式整理，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `gantt/src/components/pbs/pbs-admin-tools.tsx`、`gantt/src/components/pbs/algorithm-export-scope-filters.tsx`。
- Conflict risk: 低。
- Execution gate: 用户已确认按紧凑版整理。
