# PBS Portal 开发态 UI Inspector 设计文档

**日期：** 2026-04-21  
**作者：** Codex + lei  
**状态：** 已确认，待用户复核  
**优先级：** 开发效率提升 / 仅开发环境生效

---

## 背景

`pbs-portal` 当前已经有稳定的登录后主布局和多个业务页面，但在本地开发和联调过程中，缺少一种快速识别“当前 UI 节点对应哪个页面壳层或组件区域”的轻量工具。

用户提供的参考来自：

- `/Users/lei/Codehub/Royce-Flair/frontend`

其中 `RedisMonitorPage` 使用了一个顶部放大镜按钮来开启 UI Inspector，开启后可对页面节点做悬停高亮并显示当前 UI 标识。用户明确表示喜欢这个思路，希望将其迁入 `pbs-portal`，但要求：

1. 只在开发环境出现
2. 正式环境完全不显示
3. 只作用于登录后的主业务页，不作用于 `/login`
4. 第一阶段只做：
   - 顶部放大镜开关
   - 悬停高亮
   - 显示当前 UI id

---

## 目标

1. 在 `pbs-portal` 登录后的主业务页提供一个开发态 UI Inspector
2. 点击顶部放大镜按钮后，可在悬停时高亮当前元素
3. 浮层只显示 `data-uiid`，不再回退显示 `data-testid`
4. 退出 Inspector 后，所有高亮和浮层状态应立即清理
5. 生产环境不渲染入口，不挂载 Inspector 行为

---

## 非目标

本次不做以下内容：

- 不在 `/login` 页面启用 Inspector
- 不做点击锁定、复制 id、冻结 tooltip 等增强交互
- 不自动生成不稳定的运行时匿名 id
- 不复刻参考项目里的 `data-uid` 自动打标方案
- 不一次性给全站所有节点补齐 `data-uiid`

---

## 用户体验

### 入口

- 入口放在登录后顶部导航 [dashboard-top-nav.tsx](/Users/lei/Codehub/rois-ai/pbs-portal/src/app/layout/dashboard-top-nav.tsx) 的右侧操作区
- 入口样式为一个轻量放大镜按钮
- 按钮只在开发环境渲染
- 按钮激活后应有明确激活态

### 开启后行为

- 鼠标移动到带标识的元素上时，当前元素显示高亮边框
- 页面显示一个跟随鼠标或固定贴近鼠标的小浮层
- 浮层文案规则：
  - 只读 `data-uiid`
  - 如果最小命中 DOM 没有 `data-uiid`，则向上查找最近祖先的 `data-uiid`
  - 整条祖先链都没有 `data-uiid` 时不显示任何 id

### 关闭后行为

- 关闭按钮后立即移除当前高亮
- 隐藏 tooltip
- 注销事件监听，避免开发态无意义开销

---

## 识别规则

### 优先级

按以下顺序查找当前元素最近祖先节点上的标识：

1. `data-uiid`

### 最小 DOM 命中

- 高亮应命中鼠标下的最小 HTMLElement，而不是最近的带标识容器
- tooltip 使用该最小 DOM 作为起点，向上查找最近的 `data-uiid`
- 不跨越 `document.body` 继续查找
- 这样既能保持高亮定位精确，也能让浮层显示稳定的业务标识

### 为什么不用自动生成 id

自动生成匿名 id 虽然覆盖面高，但有两个问题：

1. 不稳定，刷新或结构调整后会变化
2. 不利于联调沟通，不能作为长期可依赖标识

因此本次设计明确不生成匿名 id，避免制造“看似可用、实际上不可复用”的开发信息。

---

## 技术方案

选择 **轻量级 Dev Inspector** 方案：

- 顶栏负责开关状态
- Inspector hook 负责 DOM 命中、高亮和 tooltip 状态
- Overlay 组件负责展示 tooltip
- 通过 `import.meta.env.DEV` 控制是否渲染

该方案比完整复刻参考项目更轻，更适合 `pbs-portal` 当前的长期维护边界。

---

## 组件划分

### 1. 顶栏入口

位置：

- `pbs-portal/src/app/layout/dashboard-top-nav.tsx`

职责：

- 仅在开发环境显示 Inspector 按钮
- 管理 `enabled` 开关状态
- 在启用时渲染 Overlay

不负责：

- DOM 遍历
- tooltip 定位
- 高亮 class 管理

### 2. Inspector Hook

建议新增：

- `pbs-portal/src/shared/hooks/use-ui-inspector.ts`

职责：

- 监听 `mousemove`
- 找出当前命中的可识别节点
- 维护当前命中元素引用
- 切换高亮 class
- 计算 tooltip 的屏幕位置
- 输出当前命中的 id 文本
- 在关闭和卸载时做完整清理

### 3. Overlay 组件

建议新增：

- `pbs-portal/src/shared/components/dev/ui-inspector-overlay.tsx`

职责：

- 根据 hook 输出渲染 tooltip
- 只负责展示，不直接操作 DOM
- 当没有命中 id 时不渲染内容

---

## 数据流

```text
DashboardTopNav
  -> 点击按钮切换 enabled
  -> 开启后渲染 UIInspectorOverlay
  -> UIInspectorOverlay 内部调用 useUIInspector(enabled)
  -> hook 监听鼠标移动
  -> hook 命中鼠标下的最小 DOM
  -> hook 以该节点为起点向上找到最近的 data-uiid
  -> hook 返回：
       - activeId
       - tooltipPosition
       - 是否显示
  -> overlay 渲染 tooltip
  -> hook 负责给目标元素加 / 去高亮 class
```

---

## 样式设计

### 顶栏按钮

- 风格参考 `Royce-Flair` 的 Inspector 开关
- 但颜色和边框应贴合当前 PBS 顶栏视觉
- 激活态应明显，但不能破坏现有右侧按钮组的视觉平衡

### 高亮样式

建议使用单独 class，例如：

- `.ui-inspector-hover`

要求：

- 使用 outline 或 inset box-shadow，避免挤压布局
- 保持足够可见性
- 不改变元素尺寸，不引发布局抖动

### Tooltip

要求：

- 固定定位
- 深色半透明背景
- 白色文字
- 小号等宽字体更适合显示技术标识
- `pointer-events: none`，避免影响鼠标命中
- z-index 高于主页面内容，但低于必要弹层的极端场景可接受

---

## 环境控制

权威规则：

- 只在 `import.meta.env.DEV === true` 时渲染 Inspector 入口和行为
- 生产环境中：
  - 不显示按钮
  - 不挂载 hook
  - 不渲染 overlay
  - 不附加开发态高亮逻辑

这样可以确保正式环境完全无感知，不引入额外运行时代码路径。

---

## 首批建议补充的 `data-uiid`

为了让第一版上线后立刻有价值，建议优先补关键骨架节点，而不是全量铺开。

首批建议范围：

1. 顶栏根节点
2. 顶栏主导航容器
3. 顶栏右侧操作区
4. 各主页面根容器
5. `Days Off` 右侧工作台壳层
6. `Pairing` 右侧工作台壳层
7. `Reserve` 主工作区壳层
8. `Layer` 右侧统计/属性壳层
9. `Award` 主内容壳层

已有 `data-testid` 的节点不再作为 tooltip 文案来源，后续如需更精确定位，应补充稳定的 `data-uiid`。

---

## 错误处理与清理策略

### 命中不到 id

- 不报错
- 不显示 tooltip
- 清除上一次高亮

### 元素被卸载

- `mousemove` 下一次命中时自动纠正
- 关闭 Inspector 时做兜底清理

### 路由切换

- 顶栏中的 Inspector 状态可以保留或重置，两者都可接受
- 推荐：保留开关状态，但在路由变化后重新依据新的 DOM 命中元素更新高亮
- 原因：开发者在多个业务页之间连续检查时体验更顺

### 组件卸载

- 移除监听器
- 移除高亮 class
- 隐藏 tooltip

---

## 测试策略

### 单元测试

至少补以下测试：

1. 开发环境下顶栏显示 Inspector 按钮
2. 非开发环境下顶栏不显示 Inspector 按钮
3. 命中最小 DOM 没有 `data-uiid` 时，仍高亮该 DOM，但 tooltip 显示最近祖先的 `data-uiid`
4. 祖先链没有 `data-uiid` 时不显示 tooltip，且不回退 `data-testid`
5. 关闭 Inspector 后高亮和 tooltip 被清除

### 回归验证

交付前至少执行：

- `npm test`
- `npm run lint`
- `npm run build`
- 仓库根 `npm run verify:pbs`

如果顶栏交互或主页面壳层受到影响，建议补跑：

- `npm run verify:pbs:e2e`

---

## 风险与控制

### 风险 1：最小 DOM 没有 `data-uiid` 时 tooltip 覆盖不足

控制：

- 本次不再回退到 `data-testid`
- 对需要精确定位的节点逐步补充稳定的 `data-uiid`

### 风险 2：高亮样式影响布局

控制：

- 使用 outline 或不占位 box-shadow
- 不使用真实 border 改尺寸

### 风险 3：开发态逻辑泄漏到生产

控制：

- 所有入口都收敛在 `import.meta.env.DEV`
- 生产环境不渲染按钮与 overlay

---

## 最终决策

本次在 `pbs-portal` 中实现一个 **仅开发环境可见的轻量级 UI Inspector**：

- 入口位于登录后顶部导航
- 点击按钮开启 / 关闭
- 悬停高亮鼠标下的最小 DOM
- tooltip 只显示最近祖先链上的 `data-uiid`
- 不自动生成匿名 id
- 不进入 `/login`
- 不在生产环境渲染

这是当前成本最低、收益最高、且最符合项目长期维护边界的方案。
