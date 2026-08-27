# @rois/ui 共享组件库规范

gantt 和 pbs-portal 共用此组件库，确保全平台风格统一。

## 核心原则

- **所有 UI 组件必须来自 `@rois/ui`**，gantt 和 pbs-portal 禁止各自定义基础组件
- 功能模块特有的组件放各自项目内，但必须基于 `@rois/ui` 的基础组件组合
- 新增通用组件先加到 `packages/ui`，不要在单个项目里造轮子

## 技术栈

- UI 组件：**shadcn/ui**（基于 Radix UI，组件代码统一维护在此）
- 样式：**Tailwind CSS**（原子化样式，使用 `cn()` 工具合并 class）
- 表格：**TanStack Table** + shadcn Table 封装（排序/筛选/分页/虚拟滚动）
- 表单：**React Hook Form + Zod**（与后端 Zod schema 共享类型定义）
- 图标：**Lucide React**（统一图标库，禁止混用其他图标库）
- 日期处理：**date-fns**
- 通知：**sonner**（Toast）

## 目录结构

```
src/
├── components/      # shadcn/ui 基础组件（Button/Input/Dialog/Table 等）
├── composites/      # 业务通用组合组件（DataTable/SearchForm/PageHeader 等）
├── layout/          # 布局组件（Sidebar/Header/PageContainer）
├── theme/           # 主题配置（5种配色 + 亮暗模式）
├── i18n/            # 国际化（默认英语，支持中英切换）
├── lib/             # 工具函数（cn() 等）
└── index.ts         # 统一导出
```

## 主题

- 5 种配色：Ocean Blue（默认）/ Emerald Green / Sunset Orange / Royal Purple / Slate Gray
- 每种主题支持亮/暗两套模式
- 通过 `ThemeProvider` + `useTheme()` 实现，选择持久化到 localStorage
- **禁止**硬编码颜色值，必须使用 Tailwind 语义化 class（如 `bg-primary`、`text-muted-foreground`）

## 国际化（i18n）

- 默认语言：**英语**，支持中英文切换
- 通过 `I18nProvider` + `useI18n()` 实现，选择持久化到 localStorage
- 使用方式：`const { t } = useI18n()`，然后 `t.common.confirm`
- **禁止**在组件中硬编码中英文文本，所有 UI 文本必须通过 `t` 引用

## 样式规范

- 优先使用 Tailwind class，**禁止**自定义 CSS 文件（全局 reset 除外）
- **设计 token 唯一来源是 `src/styles/globals.css` 的 `@theme`**（颜色、字体 `--font-sans`/`--font-mono`、字号 `--text-*`、圆角 `--radius`）
- **字号只用 8 级命名刻度**（`text-3xs`/`2xs`/`xs`/`sm`/`base`/`lg`/`xl`/`2xl`），**禁止**任意 `text-[Npx]`；完整刻度、迁移映射、字体/字重/间距规则见根 CLAUDE.md「样式与排版标准」
- 响应式使用 Tailwind 断点（`sm:` `md:` `lg:`）
- **禁止**使用行内 style，除非动态计算（如 Canvas 定位）

## 组件使用规范

- 同一功能只用一种组件实现；业务弹窗统一用 `AppDialog`（`composites/app-dialog.tsx`，蓝色标题栏 + 左上图标 + 右上关闭 + 右下按钮区 + 可拖拽，标准见根 CLAUDE.md），不要直接拼裸 `Dialog`/`DialogContent`，也不要混用 `Modal`/`Drawer`/`Popover` 代替弹窗
- 按钮样式统一使用 `Button` 的 variant（`default`/`destructive`/`outline`/`ghost`）
- 表单输入统一使用 shadcn 的 `Input`/`Select`/`DatePicker` 等，禁止引入第三方输入组件
- 数据表格统一使用封装好的 `DataTable`（基于 TanStack Table），禁止自行实现表格
- 提示/通知统一使用 `Toast`（sonner），禁止混用 alert/notification
