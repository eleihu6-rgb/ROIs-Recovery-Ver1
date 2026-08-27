# PBS Admin 隐藏 YEG Test Package 设计

## 背景

PBS Admin Tools 的 Algorithm Export 区域当前同时显示 `Current Package` 和 `YEG Test Package`。其中 `YEG Test Package` 使用固定的 YEG 14 人测试范围。

只读检查确认：Engine Server 在无法取得 Scenario crew 范围时，仍会调用 Live Server 的 YEG 14 人导出接口作为旧流程回退。因此，本次不能删除后端接口、固定人员范围或 Engine Server 调用链。

## 目标

- 在 PBS Admin Tools 页面隐藏 `YEG Test Package` 按钮。
- 页面仅向管理员提供 `Current Package` 导出入口。
- 保持现有算法运行与旧回退链路不变。

## 范围

### 修改

- Gantt `Admin Tools` 页面不再渲染 `YEG Test Package` 按钮。
- 更新对应 Playwright 回归，确认按钮不可见且 `Current Package` 仍可见。

### 保留

- Live Server `/api/admin/algorithm-export/yeg-test-package` 接口。
- Live Server 固定 YEG 14 人的导出逻辑。
- Engine Server 的 `fetch_yeg_test_package` 及其回退行为。
- 现有后端和 Engine Server 测试。
- Gantt 前端下载服务中的兼容能力；本次不扩大为后端清理。

## 交互与错误处理

- 页面不显示禁用态、提示或占位，只移除按钮。
- `Current Package` 的筛选、加载态、下载和错误处理保持不变。

## 验收标准

1. Admin Tools 的 Algorithm Export 区域不显示 `YEG Test Package`。
2. `Current Package` 正常显示并可继续下载。
3. 页面布局在移除第二个按钮后无空白占位或错位。
4. Live Server 的 YEG 导出接口和 Engine Server 回退代码未被修改。
5. Gantt TypeScript、UI 标准检查和相关 Playwright 用例通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个页面和一处 E2E，拆分成本高于收益。
- Suggested split: 单 Agent 完成 UI、测试与验证。
- Write boundaries: Gantt Admin Tools 页面和对应 Gantt E2E。
- Conflict risk: 工作区存在其他未提交改动，实施时只触碰本需求对应代码块。
- Execution gate: spec 审查通过且用户确认实施后开始。
