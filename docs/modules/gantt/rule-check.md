# Gantt 法规检查集成

## 触发时机

- 初次加载 roster 数据后 800ms 自动全量检查
- Roster 修改后 500ms 防抖增量检查（仅变化的 crew）
- 法规集合切换后 300ms 全量重检
- Pairing 分配到 crew 后立即检查

## 检查范围

- 仅检查 `pairingId > 0` 且含 FLT/DHD 飞行段的任务
- 地面任务（OFF/SL/SBY）不检查

## 告警级别

| 级别 | 数值 | 铃铛颜色 | 行为 |
|------|------|---------|------|
| INFO | 1 | 黄色 | 仅提示 |
| WARNING | 2 | 黄色 | 允许操作，显示告警 |
| ERROR | 3 | 红色 | 阻止操作（确认弹窗） |

## 违规显示

### Canvas 层
- 任务块右上角：铃铛图标 + severity 颜色
- 左侧面板：crew 行违规圆点

### 浮动 Tooltip
- hover 有违规的任务 → 显示详情卡片（severity 色点 + 规则名 + 消息）
- 离开任务后 800ms 延迟隐藏（非 300ms，给足移入时间）
- 离开 tooltip 后也有 400ms 缓冲（可重新进入）
- 桥接区域：invisible div 覆盖鼠标到 tooltip 间空白，防止中途消失
- tooltip 偏移 +8px（靠近鼠标），可滚动查看多条违规

### StatusBar 面板
- 点击违规数展开全局违规列表
- ERROR/WARNING 计数 badge

### 确认弹窗
- 使用原生 fixed overlay（`z-[9999]`）实现，不依赖 `@rois/ui` Dialog 组件，确保在所有 gantt 覆盖层之上
- ERROR → "Operation Blocked"，只能取消
- WARNING → "Violations Detected"，可继续或取消
- ESC 键 / 点击遮罩 / 右上角关闭按钮均可取消

## 法规集合

- 默认 `ccar121_gantt`（CCAR-121 全量 21 条规则）
- 工具栏下拉选择器可切换
- 切换后清空旧违规 + 重新检查
- 法规集合可通过 **Rule Config Page** 进行管理配置（详见 [法规配置页面](./rule-config.md））

## 法规配置管理

Rule Config Page（`ActiveModule = 'rule'`）提供法规集合的管理界面：

- 创建/删除法规集合
- 配置集合内法规的启用状态、参数覆盖、严重级别覆盖
- 自定义违规消息模板（`{variable}` 插值语法）
- 拖拽排序法规执行顺序

相关文档：[法规配置页面](./rule-config.md）

## 批量检查

- 使用 `/api/rules/check/batch` 单次 HTTP 请求
- 所有 pairing 打包为一个 batch

## 增量检查

- 对比前后 RosterItem[]，找出 crewId/时间/pairing/assignmentGroup 变化的 crew
- 只检查变化的 crew，保留未变 crew 的旧违规

## 详细文档

- [法规引擎集成](../04-rule-engine/gantt-integration.md)
- [CCAR-121 法规条目](../04-rule-engine/rule-catalog.md)
