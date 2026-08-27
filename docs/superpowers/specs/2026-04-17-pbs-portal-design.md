# PBS Portal 前端设计文档

**日期：** 2026-04-17  
**作者：** Codex + lei  
**状态：** 已确认，待评审  
**优先级：** 架构基线 → 项目脚手架 → 核心门户页面 → 测试基线

---

## 背景

`pbs-portal` 是 ROIS-AI 新建的员工综合门户前端，面向员工侧使用，不是后台管理台。当前目录中尚未建立实际前端工程，只有空白的项目文档。项目需要在一开始就确定长期可维护的技术路线，避免后续随着模块增加而出现目录失控、状态混乱、请求策略分裂和 UI 复用边界不清的问题。

用户已经明确了以下关键约束：

- 员工自助门户，不是运营后台
- 终端以电脑和 Pad 为主
- 采用最小工作宽度，小于阈值后整体等比例缩放
- UI 风格参考 `packages/ui`
- 页面实现优先使用 `Tailwind CSS + shadcn/ui + Heroicons`
- 组件先在 `pbs-portal` 内沉淀，稳定后再按需上提到 `packages/ui`
- 状态管理以 `TanStack Query + Zustand` 为核心，`ahooks/useRequest` 只做补充
- 英文优先，但必须预留 i18n 扩展
- 登录方式支持账号密码，并预留企业 SSO 接入
- 测试基线采用 `Playwright + Vitest`
- 项目目标强调性能优先

---

## 目标

1. 建立适合员工综合门户的企业级 React 前端基线
2. 从一开始明确模块边界、状态边界和共享边界
3. 保证性能优先，避免无效请求、无效重渲染和过早抽象
4. 兼容账号密码登录与未来 SSO 回跳，不锁死认证实现
5. 为后续 PBS、消息、公告、日历、个人设置等模块扩展提供稳定骨架

---

## 非目标

- 本阶段不实现移动手机端 H5 专用布局
- 本阶段不建设复杂后台 RBAC 系统
- 本阶段不强制把组件抽到 `packages/ui`
- 本阶段不引入重量级一体化 UI 框架
- 本阶段不同时支持多语言，只预留国际化结构

---

## 方案选型

### 候选方案

**方案 A：Feature-Sliced 企业门户架构**  
按业务域拆分 `features`，配合 `app shell + shared` 三层结构，强调长期维护和清晰边界。

**方案 B：App Shell + 页面驱动架构**  
优先快速搭壳，页面平铺推进，后续再按复杂度整理结构。

**方案 C：Portal Host + Shared UI 强复用架构**  
门户保持很薄，大量基础能力提前抽到 `packages/ui`。

### 选择

选择 **方案 A**，但用接近方案 B 的交付节奏推进。

原因：

- 最适合员工综合门户这种中长期持续加模块的形态
- 有利于控制模块边界、状态边界和请求封装边界
- 更容易兼容“账号密码登录 + SSO 扩展”
- 比方案 C 更适合当前 `packages/ui` 仍在早期阶段的现实情况

---

## 技术栈

### 核心栈

- React
- TypeScript
- Vite

### UI 层

- Tailwind CSS
- shadcn/ui
- Heroicons

### 状态与数据层

- TanStack Query
- Zustand

### 工具层

- ahooks
- lodash（浏览器端实现优先 `lodash-es`）
- dayjs
- axios

### 路由与测试

- React Router
- Playwright
- Vitest
- React Testing Library

---

## 总体架构

建议采用 `app / features / shared` 三层结构：

```text
pbs-portal
├── src
│   ├── app
│   ├── features
│   │   ├── auth
│   │   ├── home
│   │   ├── pbs
│   │   ├── calendar
│   │   ├── messages
│   │   ├── notices
│   │   └── settings
│   ├── shared
│   │   ├── components
│   │   ├── hooks
│   │   ├── services
│   │   ├── stores
│   │   ├── utils
│   │   ├── config
│   │   ├── constants
│   │   ├── types
│   │   └── i18n
│   └── main.tsx
└── public
```

### 职责边界

- `app`
  只承载应用级壳层能力，例如 Router、Provider、Portal Layout、错误边界、会话初始化、最小宽度缩放容器
- `features`
  按业务域拆分页面、局部组件、query hooks、业务模型和模块级服务
- `shared`
  放跨业务域共享的组件、工具、请求封装、UI store、i18n 和配置

约束：

- 不建立全局 `pages / api / store` 技术平铺目录
- 不把服务端状态放进 Zustand
- 不把单模块私有组件过早丢到 `shared`

---

## 路由与布局设计

### 一级路由分区

```text
/
├── /login
├── /auth/callback
└── /portal/*
```

### 路由职责

- `/login`
  账号密码登录入口，同时提供企业登录按钮
- `/auth/callback`
  处理 SSO 回跳、会话恢复和失败落点
- `/portal/*`
  员工正式工作区，承载主布局和所有业务模块

### 一期门户菜单

- Home
- My PBS
- Calendar
- Messages
- Notices
- Settings

### 布局策略

`/portal/*` 统一采用桌面工作台布局：

- 顶部全局栏
- 左侧主导航
- 中部内容区

### 最小宽度缩放机制

设计基准：

- 推荐工作宽度：`1440px`
- 最小工作宽度：`1280px`

当浏览器宽度低于 `1280px` 时：

- 不重排整体结构
- 对工作区画布容器做 `transform: scale(...)`
- 根节点与浮层层不参与缩放
- 保持垂直滚动，避免复杂双轴滚动与断点坍塌

这样可以保证电脑与 Pad 横屏看到一致的信息架构，同时减少复杂响应式重排带来的布局和性能成本。

---

## 状态管理与请求层

### 状态边界

**TanStack Query**

- 管理服务端状态
- 例如：首页摘要、PBS 列表、消息列表、公告列表、用户资料、结果详情

**Zustand**

- 管理 UI 状态
- 例如：导航折叠、筛选面板开关、主题、局部浮层、工作区上下文

**ahooks / useRequest**

- 只用于命令型或一次性请求
- 例如：导出、下载、手动触发校验、非共享临时动作

### 请求层约束

统一在 `shared/services` 建立：

```text
shared/services
├── http-client.ts
├── request.ts
├── auth-service.ts
├── user-service.ts
├── notices-service.ts
├── messages-service.ts
└── pbs-service.ts
```

约束：

- 全项目只保留一个主 `axios` 实例
- 页面和组件不直接调用裸 `axios`
- query hooks 调用 service，service 再调用 request 层
- 统一处理 baseURL、超时、错误转换、401 恢复与取消请求

### 性能相关策略

- Query 配置按数据新鲜度设置 `staleTime`
- 高频页面使用预取，但不做全站盲目预热
- 列表页使用平滑占位策略，减少闪烁
- Zustand 一律通过 selector 订阅，避免整 store 重渲染

---

## 认证方案

### 登录模式

- 账号密码登录
- 企业 SSO 预留

### 前端统一会话模型

不论登录来源如何，前端统一消费同一份 session 结构：

```text
auth-session
- status
- user
- authMode
- permissions
```

### 长期基线

长期以 **cookie/session 优先，Bearer Token 兼容** 为认证策略。

原因：

- 更利于安全与会话恢复
- 避免 token 在前端到处落存
- 更适合企业门户和未来 SSO 场景

---

## 国际化方案

当前只做英文，但必须预留扩展。

建议结构：

```text
shared/i18n
├── index.ts
├── provider.tsx
├── use-i18n.ts
└── locales
    └── en
```

约束：

- 业务组件不直接硬编码最终文案
- 当前只维护 `en`
- 后续新增语言时，不改页面结构，只补 locale 资源
- 路由级或模块级语言包懒加载作为后续可选优化

---

## 组件复用策略

组件沉淀顺序固定为：

`feature local` → `portal shared` → `packages/ui`

判定规则：

- 只在一个模块内使用：留在对应 feature
- 至少两个模块复用且 API 稳定：上提到 `shared/components`
- 跨项目稳定复用：再上提到 `packages/ui`

原则：

- 页面优先使用 `Tailwind + shadcn/ui` 自上而下组合
- 不为了未来可能复用而过早抽象
- `packages/ui` 以稳定基础组件为主，不承载早期业务半成品

---

## 性能基线

`pbs-portal` 需要把性能作为默认工程约束，而不是后期补救项。

### 必须项

- 路由级懒加载
- 重模块二级拆分
- 精准 Query 缓存与失效策略
- Zustand selector 订阅
- 工作区局部缩放，不缩放全局根节点
- 避免重量级 UI 依赖
- 工具、日期和 hooks 统一来源，避免重复依赖

### 预留项

- 长列表虚拟化
- 重视图按需预取
- 首屏资源分包分析
- 关键交互性能监测

---

## 测试策略

项目采用 **Playwright + Vitest** 双层测试方案。

### Playwright

用于覆盖：

- 登录流程
- SSO 回跳
- 路由守卫
- 门户首页
- 公告与消息主流程
- PBS 主流程
- 关键回归链路

### Vitest

用于覆盖：

- hooks
- utils
- query 适配层
- 轻量组件
- 权限判断
- 格式化逻辑

### 质量门禁

至少包括：

- `tsc --noEmit`
- `eslint`
- `vite build`
- `vitest`
- 关键 `playwright` 用例

---

## 一期范围

### 包含

- 登录页
- 认证回调页
- 门户主布局
- 首页
- My PBS
- Calendar
- Messages
- Notices
- Settings
- 统一请求层
- 统一状态基线
- 测试基线

### 不包含

- 手机端专用适配
- 复杂 RBAC 管理台
- 大规模组件库抽象
- 多语言实际落地

---

## 风险与约束

1. `packages/ui` 当前仍在早期阶段，不能把它当成成熟设计系统强依赖
2. 最小宽度缩放方案需要谨慎处理浮层、拖拽与 fixed 元素定位
3. 若后端暂未提供 cookie/session 能力，前端需先兼容 Bearer Token，但不应将其固化为长期基线
4. 员工综合门户的模块增长较快，若不严格执行边界规则，后续很容易退化为技术平铺结构

---

## 下一步

1. 基于本设计创建 `pbs-portal` 工程脚手架
2. 落地 `app / features / shared` 目录骨架
3. 建立 Router、QueryClient、Zustand、i18n 和 Layout 基础设施
4. 完善 `README.md` 与 `AGENT.md`
5. 编写实现计划，再进入具体开发
