# PBS Crew Bid Import 英文文件选择与空 Base 设计

## 背景

Admin Tools 的 Crew Bid Import 当前使用浏览器原生文件输入。在中文系统或浏览器环境中，原生控件会显示“选择文件”“未选择任何文件”等中文文案。同时，Base 输入框被代码默认填写为 `YEG`，会在用户没有主动选择范围时限制导入数据。

## 目标

- 文件选择区域只显示产品定义的英文文案，不依赖浏览器本地化文本。
- Base 初始值为空；只有用户主动填写 Base 时才限制导入范围。
- 保持现有导入接口、文件解析、Dry Run 和 Import 流程不变。

## 设计

### 文件选择

- 保留原生 `<input type="file">`，使用项目的视觉隐藏样式而不是 `display:none` 或 `hidden`。
- 文件字段使用独立容器，不复用当前会渲染外层 `<label>` 的 `Field`，避免嵌套 button/label。
- 使用原生可聚焦的 Button 触发文件输入，文案为 `Choose TXT File`；Button 通过控件 ID/ARIA 关系指向文件输入，并天然支持 Tab、Enter 和 Space。
- 未选择文件时显示 `No file selected`。
- 选择文件后显示实际文件名。
- 继续限制 `.txt,text/plain`。
- 文件输入保留明确的英文可访问名称；状态文字通过 `aria-describedby` 和 `role="status"`/`aria-live="polite"` 让读屏可感知。

### Base

- `scopeBase` 初始值从 `YEG` 改为空字符串。
- 空字符串继续转换为 `undefined`，表示不按 Base 限制。
- 用户填写 Base 后，保持现有请求传参行为。

## 不在范围内

- 不修改 Live Server 导入接口。
- 不修改导入解析、数据写入或回滚逻辑。
- 不自动从文件名或文件内容推导 Base。
- 不修改 Period Code、Crew IDs 或导入选项。

## 验收标准

1. Crew Bid Import 页面不显示浏览器本地化的中文文件控件文案。
2. 页面显示英文 `Choose TXT File` 和 `No file selected`。
3. 选择文件后显示文件名，并保持现有文件解析行为。
4. Base 首次打开时为空。
5. Base 留空时请求不携带 `scopeBase`；填写时正常携带。
6. 未选择文件时 Dry Run 和 Import 保持禁用。
7. 可见触发按钮具备英文可访问名称，可通过 Tab、Enter/Space 触发；文件输入仍保留在无障碍树中。
8. Playwright 覆盖触发按钮、文件输入的可访问名称、Base 空值、未选文件状态以及选择后的文件名状态。
9. Gantt TypeScript、UI 标准检查和相关 Playwright 用例通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修改集中在一个组件及对应 E2E，拆分会增加冲突风险。
- Suggested split: 单 Agent 完成 UI、请求断言和验证。
- Write boundaries: `pbs-admin-tools.tsx`、对应 Gantt E2E、设计与测试文档。
- Conflict risk: 工作区已有未提交修改，实施时只修改本需求相关代码块。
- Execution gate: spec 审查通过且用户确认实施后开始。
