# PBS Portal UI 迁移设计文档

**日期：** 2026-04-20  
**作者：** Codex + lei  
**状态：** 已确认，待评审  
**优先级：** UI 1:1 还原 → React 重建 → 功能迁移 → 数据层替换

---

## 背景

`pbs-portal` 当前已经建立了 React 基础工程、认证基线、Portal 壳层、请求层和测试基线，但现有 UI 只是 foundation 级别，并不满足业务方对视觉与页面结构的要求。

用户已经明确要求：

- 参考 `/Users/lei/Codehub/flair-crew-portal`
- UI 需要 **完全 1:1 还原**
- 参考项目中已经做出的部分功能也要迁过来
- 最终实现必须是 **React**，不能混入 Vue 运行时或 Vue 组件
- 第一阶段先还原 UI 和前端交互，再第二阶段统一替换为 `pbs-portal` 自己的数据源
- 路由、模块命名、品牌素材和品牌文案都与参考项目保持一致

这意味着本次工作不是“参考其视觉风格”，而是把 `flair-crew-portal` 作为 **React 重建蓝本**。

---

## 目标

1. 将 `pbs-portal` 重建为 `flair-crew-portal` 的 React 版 1:1 门户
2. 保持参考项目的路由结构、布局、视觉、交互、品牌素材和模块命名
3. 保留 `pbs-portal` 已有的 React 底层基础设施，不回退到 Vue 方案
4. 第一阶段保留参考项目已有的 mock 与前端逻辑组织，优先确保 1:1 还原
5. 第二阶段在不破坏 UI 的前提下，统一切换为 `pbs-portal` 的 `service + Query` 数据层

---

## 非目标

- 本阶段不保留当前 `pbs-portal` 的旧门户命名，如 `/portal/home`、`/portal/pbs`
- 本阶段不引入 Vue、Pinia、Vue Router、VueUse 或 `reka-ui`
- 本阶段不强行做跨项目共享抽象，不以 `packages/ui` 抽取为优先目标
- 本阶段不先接真实接口再补 UI，还原优先级高于真实数据接入
- 本阶段不做独立手机 H5 版本

---

## 源项目范围

参考项目 `flair-crew-portal` 当前已经具备以下可迁移部分：

- 登录页
- 顶部导航与主布局
- Dashboard 页面及其三栏结构
- `days-off / reserve / layer / award` 页面
- 共享 `calendar / schedule / panel` 组件
- 模块级 `mock / types / layout constants`
- 认证前端流程与部分交互行为
- 品牌素材：
  - `login-background.png`
  - `login-logo.png`
  - `login-topbar.png`
  - `avatar.png`

这些内容将作为 React 重建时的直接参考来源。

---

## 总体方案

选择 **壳层优先 + 模块分批 1:1 迁移**。

### 为什么不一次性整站平移

- 改动面过大，难以及时发现布局偏差和交互回归
- Vue -> React 的迁移需要对生命周期、状态和路由行为逐个翻译
- 当前 `pbs-portal` 已有基础设施，如果整站直接覆盖，容易把底层边界也一起打乱

### 为什么不先做共享组件再组页面

- 用户当前优先级是“尽快看到与参考项目一致的页面”
- 过早做组件抽象会拉慢 1:1 还原进度
- 共享组件应围绕“页面还原”服务，而不是先做组件库工程

### 推荐迁移原则

- **视觉 1:1**
- **结构 1:1**
- **交互 1:1**
- **素材 1:1**
- **路由 1:1**
- **实现层全部为 React**

---

## 保留与替换边界

### 保留的基础设施

以下内容继续保留，作为长期可维护的 React 底盘：

- `React + TypeScript + Vite`
- `React Router`
- `Zustand` 认证与 UI 状态基线
- `TanStack Query + request + services`
- `Vitest + Playwright`
- `shared/config`、`shared/query`、`shared/services`、`shared/types`

### 替换的表现层

以下内容将被参考项目的 React 版实现整体替换：

- 当前 `PortalShell`
- 当前 `/portal/*` 路由命名与导航命名
- 当前 `home / pbs / calendar / messages / notices / settings` 页面
- 当前 portal 文案与视觉 token
- 当前通用门户式布局与缩放策略

### 翻译迁移的内容

以下内容可从参考项目迁移，但必须转换为 React 实现：

- `MainLayout.vue` -> `MainLayout.tsx`
- `DashboardTopNav.vue` -> `DashboardTopNav.tsx`
- `LoginPage.vue` -> `LoginPage.tsx`
- `DashboardPage.vue` -> `DashboardPage.tsx`
- `DaysOffPage.vue` -> `DaysOffPage.tsx`
- `ReservePage.vue` -> `ReservePage.tsx`
- `LayerPage.vue` -> `LayerPage.tsx`
- `AwardPage.vue` -> `AwardPage.tsx`
- `mock.ts / types.ts / layout constants`
- `MonthGridCalendar.vue`
- `ScheduleLayerMatrix.vue`
- `PanelStripHeader.vue`
- schedule builders 和布局 helper
- 品牌静态资源

---

## 路由与信息架构

迁移完成后，`pbs-portal` 路由结构应与参考项目一致：

```text
/
├── /login
├── /dashboard
├── /days-off
├── /reserve
├── /layer
├── /award
├── /403
├── /404
└── /500
```

同时保留与参考项目一致的兜底行为：

- `/` 默认跳转 `/dashboard`
- 未匹配路径统一跳转 `/404`

### 顶部导航信息架构

顶部导航项顺序必须与参考项目一致：

1. `Dashboard`
2. `Days Off`
3. `Pairing`
4. `Line`
5. `Reserve`
6. `Layer`
7. `Award`
8. `Standing Bid`

其中：

- `Pairing / Line / Standing Bid` 第一阶段不实现独立业务页
- 但必须作为真实导航项出现在顶栏中
- 行为与参考项目一致，当前点击统一跳转 `/404`
- 它们 **不是** 独立业务路由
- React 版不新增 `/pairing`、`/line`、`/standing-bid` 三个真实页面路径

active 合同：

- 当前 path 为 `/404` 时，所有 path 指向 `/404` 的导航项按参考项目逻辑计算 active
- 不额外发明“只高亮最后点击项”的修正逻辑

### 路由行为

- `/` 默认跳转到 `/dashboard`
- 登录页未认证可访问，已认证用户进入时跳转回目标页或 `/dashboard`
- 业务模块页统一挂载在 `MainLayout`
- 未认证访问业务页时跳转 `/login?redirect=<target>`
- 系统页行为与参考项目一致

### 认证回调合同

认证回调合同必须在 spec 中明确，不保留“后面再决定”的状态。

最终选择：

- **以参考项目行为为准**
- SSO 完成后回到 `/login?token=<token>` 这一入口
- 登录页负责识别 `token` 并完成登录收尾
- 当前 React foundation 中已有的 `/auth/callback` 路由不再作为目标实现路线

这是一次明确的迁移收敛，而不是保留双回调协议。

### SSO 与登录回跳的权威流程

本次迁移中，SSO 与登录回跳行为采用以下唯一合同：

1. 未认证用户访问业务页时，跳转到 `/login?redirect=<target>`
2. 用户在登录页点击 SSO 按钮时：
   - 继续通过 React 侧 `auth-service` 发起 SSO
   - 在浏览器离开前安全保存当前 `redirect` 目标
3. SSO 门户完成后回到 `/login?token=<token>`
4. 登录页检测到 `token` 后：
   - 暂停普通登录页的 session bootstrap 竞争逻辑
   - 将 `token` 交给 React 侧认证能力完成登录收尾
   - 优先恢复离开前保存的安全 `redirect` 目标
   - 若不存在有效目标，则跳转 `/dashboard`
5. 密码登录成功后遵循相同的安全回跳规则

说明：

- 参考项目的可见 URL 形态保持不变，仍然是 `/login?token=...`
- `redirect` 的跨 SSO 保留策略作为 React 版的工程增强保留
- 当前 React foundation 中的 `/auth/callback` 属于旧合同，迁移时直接收敛到 `/login?token=...`

### redirect 优先级与清理规则

redirect 规则固定如下：

1. 若 URL query 中存在安全的 `redirect`，优先使用它
2. 若 query 中没有安全 `redirect`，再读取保存的安全 return-to
3. 若两者都不存在，回退到 `/dashboard`

清理规则：

- 登录成功后立即清理已消费的存储 return-to
- 登出后清理存储 return-to
- 用户手动访问 `/login` 且没有 `redirect`、没有 `token` 时，清理陈旧 return-to
- 非法、空值、非安全路径一律清理并按 `/dashboard` 回退

### 现有 `/portal/*` 基线的迁移边界

当前 `pbs-portal` foundation 中与 `/portal/*` 绑定的内容，必须被视为第一阶段明确迁移范围：

- 旧路由树
- 旧 `PortalShell`
- 旧导航结构
- 旧 `return-to` helper
- 旧针对 `/portal/*` 的认证回跳测试

这些内容不能“先保留再兼容”，而是要在第一阶段直接切换到：

- `/dashboard / days-off / reserve / layer / award`
- 以及系统页 `/403 / 404 / 500`

`return-to` 校验逻辑也必须同步升级，只接受新的安全目标路径。

### 旧入口的发布切换规则

为降低 cutover 风险，首个 React 版发布允许保留 **短期重定向 shim**，但它不是最终长期合同。

兼容范围仅包括：

- 旧 `/auth/callback`
- 旧 `/portal/*` 书签或外部链接

兼容目标：

- `/auth/callback` 收敛到 `/login?token=...`
- `/portal/*` 映射到新的业务页路径，若无法精确映射则回退 `/dashboard`

要求：

- 实施计划必须明确该 shim 的保留期限
- 最终目标仍然是只保留参考项目同构路由树

### 顶部导航

顶部导航需要 1:1 还原以下行为：

- 登录后固定顶栏
- 菜单项顺序与参考项目一致
- active 状态与底部高亮条一致
- 随屏宽缩放
- 当空间不足时将尾部菜单折叠到 overflow 菜单
- 右上角展示通知、设置、退出、头像和用户名

---

## 页面与共享组件迁移顺序

为避免“阶段”同时表示执行批次与数据切换阶段，本文统一术语如下：

- **迁移批次**：指 UI React 化的实施顺序
- **数据阶段**：指模块 mock -> 真实数据源的切换阶段

### 迁移批次 1：品牌入口与主框架

范围：

- 登录页 1:1 React 重建
- `MainLayout` 1:1 React 重建
- `DashboardTopNav` 1:1 React 重建
- 顶部导航项与 overflow 行为的基础实现
- 静态品牌素材迁入
- 系统页 `403 / 404 / 500`
- 路由守卫行为对齐参考项目
- 根路由、catch-all、`redirect` 参数与系统页行为对齐参考项目
- `/portal/*` 基线路由和旧回跳逻辑切换到新路由体系

交付结果：

- 打开系统即可看到与参考项目一致的登录与主框架

### 迁移批次 2：共享核心组件 + Dashboard 1:1 还原

范围：

- `MonthGridCalendar`
- `ScheduleLayerMatrix`
- `PanelStripHeader`
- `schedule-panel-layout`
- 共享 schedule / calendar types
- builders 和辅助函数
- `DashboardPage`
- `DashboardLeftPanel`
- `DashboardSchedulePanel`
- `DashboardRightPanel`
- Dashboard 页面缩放策略
- dashboard mock / types / builders

交付结果：

- `/dashboard` 页面肉眼级 1:1

### 迁移批次 3：业务模块页面批量迁移

范围：

- `/days-off`
- `/reserve`
- `/layer`
- `/award`

这些页面共享同类结构：

- 左侧 schedule 区
- 右侧模块面板
- 同类缩放策略
- 同类 mock 和局部交互

交付结果：

- 参考项目中已完成的核心业务页全部完成 React 化

### 数据阶段 2：业务模块真实数据切换

范围：

- 用 `pbs-portal` 现有 `service + Query` 替换模块 mock 数据
- 将页面从临时前端交互数据切到真实服务端状态
- 收束认证和业务模块的真实接口契约

交付结果：

- 保持 1:1 UI 不变的前提下，页面数据来源切换为 `pbs-portal` 自身数据层

---

## 数据与功能迁移策略

### 数据阶段 1：UI 还原期

这一阶段目标是 UI 和前端交互 1:1 还原，因此：

- **认证链路不使用 mock**
- 登录、SSO 入口、回跳、session 恢复继续复用 `pbs-portal` 已有 auth foundation
- 但登录页视觉、交互入口和回跳行为对齐参考项目
- 业务模块页面内容、日历、面板、局部前端状态允许继续使用参考项目 mock
- 类型和布局常量优先从参考项目迁入
- 仅做必要的 React 化改写，不强行将业务模块接入真实数据

### 数据阶段 2

在 UI 与交互稳定后，再统一切换到 `pbs-portal` 的数据层：

- 页面由 mock 改为 `service + Query`
- 认证行为从临时前端逻辑切到真实认证链路
- 逐步替换临时页面状态为真实业务状态

### 数据阶段 2 的模块归属

为避免第二阶段成为模糊范围，模块归属固定如下：

- `dashboard`
  - 优先复用 `user-service`、`messages-service`、`notices-service`
  - 若现有 shared service 不足，则新增 `features/dashboard/services/*`
- `days-off`
  - 使用 `features/days-off/services/*`
- `reserve`
  - 使用 `features/reserve/services/*`
- `layer`
  - 使用 `features/layer/services/*`
- `award`
  - 使用 `features/award/services/*`

统一约束：

- 所有模块服务必须基于现有 `request + Query` 基线
- 若某模块在第二阶段没有对应后端契约，则该模块明确保留 mock，不允许隐式硬接不稳定接口
- 实施计划必须逐模块标注“已接真实数据 / 暂保留 mock”

说明：

- 上述“认证行为从临时前端逻辑切到真实认证链路”只适用于参考项目的 Vue 侧行为模型
- 对 React 目标项目而言，**认证基础设施从第一阶段就继续保留并演进**
- 第二阶段真正替换的是业务模块数据，而不是已经稳定的 React 认证底盘

### 这样做的原因

- 避免“一边改 UI 一边接接口”导致偏差难以定位
- 保证第一阶段目标始终聚焦于 1:1 还原
- 让 React 基础设施在第二阶段真正承接业务数据，而不是提前打断 UI 迁移节奏

---

## React 实现要求

### 禁止内容

- 禁止引入 Vue 运行时
- 禁止保留 `.vue` 文件参与运行
- 禁止引入 Pinia、Vue Router、VueUse、`reka-ui`
- 禁止把 Vue 组件包装成兼容层继续使用

### 必须的实现映射

- `Vue Router` -> `React Router`
- `Pinia` -> `Zustand`
- `computed / reactive / ref` -> React state + derived state + hooks
- `onMounted / onBeforeMount` -> `useEffect`
- 共享组件 -> React TSX 组件
- Vue 模块路由 -> React 懒加载路由

### 迁移要求

- 行为以参考项目为准
- 代码风格以当前 `pbs-portal` React 规范为准
- 迁移中优先复用已建立的 `auth-service / request / QueryClient`
- 认证、回跳与路由守卫属于保留并演进的 React 基线，不回退到参考项目的临时实现
- 不因为追求 1:1 而把 React 工程写成 Vue 思维的直接翻译稿

---

## 第一阶段必须迁移的前端功能

“把参考项目已写出的功能也搬过来”在本 spec 中是明确范围，不允许只做静态还原。

### 登录与认证

- 用户名/密码输入与校验
- 密码显隐
- 清空密码按钮
- 密码登录提交
- SSO 登录入口
- `/login?token=...` 登录收尾
- 登录后的安全回跳

### 顶部导航与主框架

- 顶部导航 active 状态
- 顶部导航 overflow 折叠
- 右上角退出登录确认弹层
- 通知、设置、头像、用户名区域结构与视觉

### Dashboard

- 三栏布局
- schedule 面板主视觉
- 消息面板与用户信息面板
- 页面缩放行为
- schedule 区域中的 layer 选择与相关共享交互

### Days Off

- 搜索
- `all / favorited` 标签切换
- 已有 property 的编辑 / 收藏 / 删除入口
- 可用 property 的新增 / 收藏 / 层开关 / bid 修改
- footer `cancel / reset` 行为

### Layer

- summary 区域折叠展开
- properties 区域折叠展开
- summary 项删除
- summary 项 bid 修改
- layer toggle 点击行为

### Reserve

- add bid 按钮行为壳层
- reserve heatmap
- 月历展示与选择壳层
- schedule 区域中的共享 layer 交互

### Award

- report 按钮行为壳层
- trip card 列表展示
- summary 信息展示

如果某个行为在第一阶段故意不迁移，必须在实施计划中列为明确例外，不能默默降级。

---

## 样式与品牌策略

用户已明确要求品牌元素一并照搬，因此第一阶段中：

- `Flair / ROIS CREW` 文案保留
- 参考项目静态图片素材直接迁入
- 颜色、阴影、字体层级、布局比例按参考项目还原
- 顶栏、登录背景、品牌 logo、avatar 统一照搬

实现方式：

- 使用 React + Tailwind 重建样式
- 必要时引入局部 CSS 文件还原复杂效果
- 不要求样式表达方式与参考项目一致，只要求视觉结果一致

---

## 测试策略

### 数据阶段 1 必须覆盖

- 登录页渲染
- 访客跳转登录
- 登录后回跳目标页
- SSO 从 `/login?token=...` 完成收尾
- 顶部导航主模块跳转
- 顶部导航 overflow 行为
- Dashboard 与主布局关键渲染
- `days-off / reserve / layer / award` 基本路由渲染
- `days-off / reserve / layer / award` 关键前端交互存在性验证
- 窄屏下 dashboard 缩放主路径
- smoke E2E：登录页、未认证访问业务页跳登录、关键模块导航

### 数据阶段 2 再加强

- 各模块页面主路径
- 更完整的窄屏缩放浏览器级验证
- 更完整的 shell 导航与 overflow 行为回归
- 业务模块真实数据路径与错误态

---

## 风险与规避

### 风险 1：Vue 组件直接翻译成 React 反模式

规避：

- 以行为为目标重写，不复制 Vue 状态结构
- 将页面逻辑收束到 React 组件和 hooks 中

### 风险 2：当前 `pbs-portal` 旧壳层与新壳层并存

规避：

- 新路由和新布局切入后，旧 `/portal/*` 结构整体让位
- 避免两套路由和两套导航同时存在

### 风险 3：缩放逻辑抽象错误

规避：

- 按参考项目页面各自的设计宽度实现缩放
- 不强行复用当前过于泛化的 portal shell 缩放逻辑

### 风险 4：共享组件过早工程化

规避：

- 先围绕页面还原建立共享组件
- 在页面稳定后再决定是否上提到更高共享层

### 风险 5：一边接真实接口一边还原 UI

规避：

- 第一阶段严格使用 mock / 前端交互
- 第二阶段再统一切换数据源

---

## 数据阶段 1 完成定义

当以下条件同时满足时，数据阶段 1 视为完成：

1. 登录页、主布局、顶部导航与参考项目 1:1
2. `dashboard / days-off / reserve / layer / award` 页面已在 React 中完成 1:1 还原
3. 顶部导航信息架构包含 `Pairing / Line / Standing Bid`，并与参考项目行为一致地跳转 `/404`
4. 参考项目品牌素材与文案已迁入
5. 页面前端交互与 mock 数据行为对齐参考项目
6. 登录、回跳与路由守卫行为已经切换到新路由体系
7. 第一阶段测试覆盖已验证主要页面、导航、回跳和缩放主路径
8. 整体运行在 `pbs-portal` 的 React 基座上
9. 没有 Vue 运行时残留

---

## 后续实施说明

实施时建议按以下顺序推进：

1. 迁移批次 1：品牌入口与主框架
2. 迁移批次 2：共享核心组件 + Dashboard
3. 迁移批次 3：四个业务模块页
4. 数据阶段 2：逐模块替换为真实数据

该顺序可以同时满足：

- 视觉 1:1 优先
- React 基座长期可维护
- 风险可控
- 迁移结果逐步可见
