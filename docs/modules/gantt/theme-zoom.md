# 主题切换 + 连续缩放

## 多主题系统

### 5 种配色方案

| 主题 | 风格 | 暗色 |
|------|------|------|
| Ocean Blue（默认） | 专业商务蓝 | 支持 |
| Dark Pro | Bloomberg 终端风 | 固定暗色 |
| Emerald Green | EVA Air 绿 | 支持 |
| Sunset Orange | 暖色调 | 支持 |
| Slate Gray | 低饱和 | 支持 |

### 一致性要求

- HTML 控件：语义化 Tailwind class（`bg-card`, `text-foreground`）
- Canvas：`getGanttColors()` / `getCssVar()` 读取 CSS 变量
- 切换即时生效，所有 Canvas 自动重绘
- localStorage 持久化

### 切换流程

```
用户选择主题 → applyThemeToDOM() 修改 :root class
             → markDirty() 触发所有 Canvas 重绘
             → getGanttColors() 读新 CSS 变量
```

## 连续缩放

### 模型

| 参数 | 说明 |
|------|------|
| `pxPerHour` | 像素/小时（越大越放大） |
| `zoomMin` | `viewportWidth / totalHours`（全日期范围撑满） |
| `zoomMax` | `viewportWidth / 24`（1 天撑满） |
| 步长 | × 1.4（放大）/ ÷ 1.4（缩小） |

### 边界处理

- 初始值 = zoomMin（全撑满）
- zoomOut 接近 min（5% 内）自动 snap 到精确 min
- setZoomBounds 在初始/已在 min 时自动 snap 到新 min
- 窗口 resize / 日期范围变化自动重算 bounds

### 按钮状态

- 到 zoomMax → `+` 按钮禁用
- 到 zoomMin → `-` 按钮禁用

### 默认日期范围

- 上月月初 ~ 下月月末（约 3 个月跨度）
- filter-store + pane-store 同步（useGanttViewport 自动同步）
- localStorage 记忆用户选择的日期范围

## 时间轴（TimeAxis）

### 两行布局

```
┌──────────────┬──────────────┬──────────────┐
│  Mar 2026    │   Apr 2026   │  May 2026    │  ← 上行：月份（居中）
├──┬──┬──┬──┬──┼──┬──┬──┬──┬──┼──┬──┬──┬──┬──┤  ← 分隔线
│29│30│31│ 1│ 2│ 3│ 4│ 5│ 6│ 7│ 8│ 9│10│..│  │  ← 下行：日期
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
```

- 每天一条竖线贯穿 header，与 Gantt 网格对齐
- 月首竖线加粗（gridColorMajor）
- 上下行之间有 0.5px 水平分隔线

### 两行自适应

| dayWidth | 上行 | 下行 |
|----------|------|------|
| ≥ 120px | 每日 `yyyy-MM-dd EEE` | 小时刻度 `HH:mm`（跳过 00:00） |
| 60-120px | 月份 `MMM yyyy` 居中 | 星期几 `EEE` |
| 12-60px | 月份 `MMM yyyy` 居中 | 日期数字居中 |
| < 12px | 月份 `MMM yyyy` 居中 | 不显示 |

小时刻度间距自适应：需要 ~35px/标签，hourStep 取整到 [1,2,3,4,6,8,12]。

### 日期颜色

| 类型 | 颜色 | CSS 变量 |
|------|------|---------|
| 工作日 | 灰色 | `--gantt-text-secondary` |
| 周末 | 柔和靛蓝 | `--gantt-text-weekend`（亮 #818cf8 / 暗 #a5b4fc） |
| 假日 | 红色加粗 | `--gantt-text-red`（预留，待假日数据导入） |

### TimeAxis 交互

| 区域 | 光标 | 操作 |
|------|------|------|
| 上行月份文字 | pointer | 点击 zoom 到该月 |
| 上行空白 / 下行 | default | → 向右拖拽 = Zoom In（选区撑满） |
| 上行空白 / 下行 | default | ← 向左拖拽 = Zoom Out（比例缩小） |
| 双击 | — | 恢复全景（zoomMin + scrollX=0） |
| 右键 | — | 月份快速跳转菜单 |

拖拽 Zoom 行为：
- **→ 向右**：蓝色选区覆盖层，松开后选区范围撑满 viewport（Zoom In）
- **← 向左**：拖拽越长缩小越多（ratio = 1 + dist/viewport × 3），视图中心稳定

### Zoom 范围

- zoomMin = `viewportWidth / totalHours`（全日期范围撑满）
- zoomMax = `viewportWidth`（1 小时撑满，绝对上限）
- ZOOM_STEP = 2x（~8 步从 1 小时回到 3 个月）
- Zoom In/Out 自动调整 scrollX 保持视图中心稳定
