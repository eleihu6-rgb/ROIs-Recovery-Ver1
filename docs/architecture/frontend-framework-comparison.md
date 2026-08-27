# 前端 UI 框架选型对比

> 用于 ROIS-AI 项目前端（Gantt 排班系统 + PBS 机组申请系统）

---

## 候选框架一览

| 框架 | GitHub 星数 | 背景 | 特点 |
|------|------------|------|------|
| Ant Design (antd) | 93k+ | 蚂蚁集团 | 企业级组件库，组件最全，ProComponents 加持 |
| MUI (Material UI) | 94k+ | Google Material 风格 | 社区最大，定制灵活，Material 设计语言 |
| shadcn/ui | 82k+ | 社区驱动 | 可复制组件集合，基于 Radix UI + Tailwind CSS |
| Mantine | 27k+ | 社区驱动 | 全功能组件库，内置 hooks/表单/通知/日期 |
| Chakra UI | 38k+ | 社区驱动 | 简洁易用，样式系统好，组件偏基础 |
| Radix UI | 16k+ | WorkOS | 无样式底层组件（Headless），只管行为和无障碍 |
| NextUI | 22k+ | 社区驱动 | 基于 Radix，现代美观，偏 C 端 |
| Arco Design | 4k+ | 字节跳动 | 企业级，设计现代，组件质量高 |
| TDesign | 3k+ | 腾讯 | 企业级，稳定，组件丰富 |

---

## 重点对比：Ant Design vs shadcn/ui

这两个方案最适合本项目，详细对比如下：

### Ant Design

**优势：**
- 开箱即用组件最多（100+ 组件）
- ProTable：高级表格，内置筛选/分页/搜索/编辑，排班数据展示直接可用
- ProForm：高级表单，支持分步/弹窗/联动，法规配置表单可快速实现
- ProLayout：后台布局模板，菜单/面包屑/多 Tab 开箱即用
- 中英文文档完善
- 蚂蚁集团维护，10+ 年历史，大量企业生产验证
- Claude AI 生成 antd 代码质量高

**劣势：**
- 包体积较大（按需引入可缓解）
- 样式定制需覆盖 CSS，改起来不够灵活
- 设计风格偏传统企业后台，不够现代
- 升级大版本时（如 v4→v5）迁移成本较高

**适用场景：**
- 快速出活，减少基础组件开发时间
- 大量表格/表单的企业后台系统

---

### shadcn/ui + Tailwind CSS

**优势：**
- **不是传统组件库**，而是可复制的组件代码集合
- 组件代码直接在你的项目里，随意修改，不受框架版本升级影响
- 基于 Radix UI（无障碍和交互行为）+ Tailwind CSS（原子化样式）
- 风格现代简洁，高度可定制
- 当前 React 社区**最热门的方案**
- Claude AI 对 shadcn + Tailwind 的代码生成质量**极高**（训练数据最丰富）
- 包体积极小（按需复制，无运行时依赖）
- 与自研 Canvas Gantt 配合更自然（样式系统统一）

**需要搭配的生态库：**

| 能力 | 库 | 说明 |
|------|-----|------|
| 高级表格 | **TanStack Table** | 排序/筛选/分页/虚拟滚动/列固定 |
| 表单 | **React Hook Form + Zod** | 表单校验，与后端 Zod schema 复用 |
| 日期选择 | **date-fns + shadcn DatePicker** | 轻量日期处理 |
| 图表 | **Recharts** | 基于 D3，声明式图表 |
| 图标 | **Lucide React** | shadcn 默认图标库 |

**劣势：**
- 没有 ProTable/ProForm 这类高级封装，复杂表格需要自己基于 TanStack Table 组合
- 上手需要了解 Tailwind CSS 的写法
- 组件不如 antd 数量多，部分功能需自行实现

**适用场景：**
- 需要高度定制化的项目
- 注重现代 UI 风格
- 不想被组件库版本绑定

---

## 综合对比表

| 对比项 | Ant Design | shadcn/ui + Tailwind |
|--------|-----------|---------------------|
| 上手速度 | **快**，开箱即用 | 中等，需组合搭配 |
| 定制自由度 | 中（覆盖样式较麻烦） | **极高**（代码在项目里） |
| 复杂表格 | **ProTable 内置** | TanStack Table 搭配 |
| 复杂表单 | **ProForm 内置** | React Hook Form 搭配 |
| 后台布局 | **ProLayout 内置** | 需自行搭建或用模板 |
| 包体积 | 较大 | **极小**，按需引入 |
| AI 代码生成质量 | 高 | **极高**（当前最热门） |
| UI 风格 | 企业经典 | **现代简洁** |
| 版本升级风险 | 有（大版本迁移） | **无**（代码归你） |
| 与自研 Gantt 配合 | 一般（样式体系不同） | **好**（Tailwind 统一） |
| 社区活跃度 | 高 | **极高**（当前最火） |
| 文档 | 中英文完善 | 英文为主，清晰简洁 |

---

## 推荐结论

### 推荐方案：shadcn/ui + Tailwind CSS

理由：

1. **Gantt 是自研的**：项目核心是排班 Gantt，需要高度定制化，shadcn 的灵活性更匹配
2. **AI 生成效率最高**：Claude 对 shadcn + Tailwind 的代码生成最擅长，作为 AI 驱动开发的项目，这是关键优势
3. **不被框架绑定**：组件代码在项目中，不用担心版本升级破坏
4. **现代技术栈**：Tailwind + Radix 是当前 React 生态的主流方向
5. **表单校验复用**：React Hook Form + Zod 可与后端 Fastify 的 Zod schema 共享类型定义

### 需要额外搭建的能力

| 能力 | 方案 | 工作量 |
|------|------|--------|
| 高级数据表格 | TanStack Table + shadcn Table 封装 | 中等（封装一次复用） |
| 后台布局 | 基于 shadcn Sidebar + 自行搭建 | 低 |
| 表单 | React Hook Form + Zod | 低 |
| 主题切换 | Tailwind CSS 变量 + shadcn 主题 | 低 |

### PBS 移动端

如果 PBS 需要移动端适配：
- 方案 A：响应式设计（Tailwind 原生支持 `sm:` `md:` `lg:` 断点）
- 方案 B：React Native + NativeWind（如需独立 App）

---

## 待确认

- [ ] 确认使用 shadcn/ui + Tailwind CSS 方案
- [ ] 或选择 Ant Design 方案
- [ ] 确认 PBS 端是否需要独立移动端 App
