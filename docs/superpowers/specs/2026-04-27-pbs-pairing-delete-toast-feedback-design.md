# PBS Pairing 操作反馈 Message 设计

## 背景

PBS Pairing 页面已有删除、移除收藏等异步操作，但部分失败路径目前静默处理，用户无法判断操作是否已经成功保存到后端。截图中的已选 Pairing Property 垃圾桶删除是主要问题，同时 Pairing 模块内的取消收藏也属于同类“移除”操作，应一起补齐反馈。

前一版实现方向混用了 `toast` 命名和 message 语义，导致 `packages/ui` 边界不清晰。用户期望的是类似 Ant Design `message` 的轻量顶部居中反馈：一行短提示、自动消失、不占据业务面板布局。因此本次从 `packages/ui` 新增独立 `message` 能力，不修改原有 `toast.tsx`。

最新交互要求继续扩大到 Pairing 添加和收藏类操作：`ADD PAIRING PROPERTIES` 中点击加号成功添加到现有条件后也需要 message；收藏/取消收藏的 pending 状态需要像添加、删除一样有明确禁用样式；取消收藏不再弹二次确认弹窗，点击实心爱心后直接调用取消收藏接口。

## 目标

- 为 PBS Pairing 模块内添加、删除、收藏、取消收藏类异步操作提供成功和失败 message 风格提示。
- 当前展示英文文案，保留后续国际化扩展入口。
- 保持现有布局、pending disabled、乐观更新和失败回滚行为；仅取消收藏移除二次确认弹窗。
- 遵循项目 UI 规则：通知能力由 `packages/ui` 统一提供，PBS Portal 不直接实现基础提示组件。
- 不引入新的通知库；`message` 底层可复用 `packages/ui` 已采用的 `sonner`。

## 范围

本次覆盖以下操作：

- `/pairing` 已选 Pairing Property 垃圾桶删除。
- `/pairing` 可选 Pairing Property 加号添加到现有条件。
- `/pairing` 可选 Pairing Property 收藏与取消收藏。
- `/pairing/search` 搜索条件添加到当前 Pairing。
- `/pairing/search` 搜索条件收藏与取消收藏。

本次不覆盖：

- Pairing 搜索预览请求本身的加载/失败展示体系。
- Days Off、Line、Layer 等其他 PBS 模块的提示体系。
- 新增中文 locale 或运行时语言切换能力。

## 交互设计

删除 Pairing Property：

- 后端确认删除成功后显示顶部居中 success message：`Pairing property deleted.`
- 删除失败后显示顶部居中 error message：`Unable to delete pairing property.`
- 删除请求 pending 期间继续禁用结构性变更按钮。
- 删除失败时保持现有失败处理策略：不把失败结果误认为已保存，并通过 message 明确告知用户。

添加 Pairing Property：

- `/pairing` 中点击 `ADD PAIRING PROPERTIES` 列表的加号，后端确认添加成功后显示 success message：`Pairing property added.`
- `/pairing/search` 中把搜索条件添加到当前 Pairing，后端确认添加成功后同样显示 success message：`Pairing property added.`
- 添加失败后显示 error message：`Unable to add pairing property.`
- 添加请求 pending 期间保留现有禁用策略，避免重复点击和重复写入。

收藏：

- 点击空心爱心后立即乐观更新为已收藏，同时让收藏按钮呈现 pending 禁用状态。
- 后端确认收藏成功后显示 success message：`Favorite saved.`
- 收藏失败后回滚为未收藏，并显示 error message：`Unable to save favorite.`
- 收藏接口 pending 期间阻止重复点击。推荐让当前模块内收藏按钮都处于 disabled 状态，避免并发收藏请求使用过期 `draftMeta`。

取消收藏：

- 用户点击实心爱心后不再出现 `Remove favorite property?` 二次确认弹窗，直接发起取消收藏请求。
- 点击后立即乐观更新为未收藏，同时让收藏按钮呈现 pending 禁用状态。
- 后端确认取消收藏成功后显示顶部居中 success message：`Favorite removed.`
- 取消收藏失败后显示顶部居中 error message：`Unable to remove favorite.`
- 保留当前乐观更新与失败回滚：失败时恢复收藏状态，并显示失败 message。

## 技术方案

采用 `@rois/ui` 统一 message API + PBS Pairing i18n key 的方式：

- 新增 `packages/ui/src/components/message.tsx`，实现独立 message 组件能力，底层复用 `sonner`：
  - `Message`：全局挂载组件，默认 `position="top-center"`，表现为类似 Ant Design message 的顶部居中轻提示。
  - `message.success(...)` / `message.error(...)`：业务调用 API。
  - Message 宽度按内容自适应，最大宽度 500px；短文案不铺满容器，长文案允许换行。
  - 成功状态使用绿色视觉，失败状态使用红色视觉，图标颜色与状态保持一致。
  - Sonner 外层定位容器不使用 `fit-content` 作为 `--width`，避免触发 `overflow-wrap:anywhere` 的 min-content 收缩而把英文逐字竖排；实际 message 条目用 `max-content` + `maxWidth` 控制自适应宽度。
- 保持 `packages/ui/src/components/toast.tsx` 原样，不把 message 语义塞进 toast 文件。
- 在 `packages/ui/src/index.ts` 导出 `Message`、`message` 和 message 相关类型。
- 不新增 `@rois/ui` package subpath export，沿用当前统一入口。
- PBS Portal 应用根层挂载一次 `Message`，建议放在 `AppProviders` 内与全局 provider 同层管理。
- 在 `pbs-portal/src/shared/i18n/locales/en.ts` 增加 Pairing message 文案 key，例如：
  - `pairing.message.deletePropertySuccess`
  - `pairing.message.deletePropertyError`
  - `pairing.message.addPropertySuccess`
  - `pairing.message.addPropertyError`
  - `pairing.message.saveFavoriteSuccess`
  - `pairing.message.saveFavoriteError`
  - `pairing.message.removeFavoriteSuccess`
  - `pairing.message.removeFavoriteError`
- Pairing 组件通过 `useI18n()` 获取 `t`，调用 `message.success(t(...))` 或 `message.error(t(...))`。
- 不把英文文案直接散落在 Pairing 组件中，方便后续增加中文 locale 或替换 i18n 实现。
- 撤销 PBS Portal 本地 `sonner` 直连方案：不要保留 `pbs-portal/src/shared/components/ui/toast.ts` 这种应用内基础通知封装，也不要让业务页面直接依赖 `sonner`。

## 代码影响点

- `packages/ui/src/components/message.tsx`
  - 新增 `Message` 和 `message`，复用 `sonner` 实现 Ant Design message 风格轻提示。
- `packages/ui/src/components/toast.tsx`
  - 保持原样，不承载 message 语义。
- `packages/ui/src/index.ts`
  - 导出 message 风格 API。
- `pbs-portal/package.json` / `pbs-portal/pnpm-lock.yaml`
  - PBS Portal 使用 `@rois/ui` 提供的 message API；不直接声明 `sonner`。
- `pbs-portal/src/app/providers/app-providers.tsx`
  - 挂载全局 `Message`。
- `pbs-portal/src/shared/i18n/locales/en.ts`
  - 增加 Pairing 添加、删除、收藏、取消收藏 message 文案 key。
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - 为已选属性删除、可选属性添加、收藏、取消收藏成功/失败路径补 message。
  - 删除取消收藏确认弹窗，取消收藏改为直接调用接口。
  - 收藏按钮 pending 时使用和添加/删除一致的 disabled 视觉反馈。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
  - 为搜索条件添加、收藏、取消收藏成功/失败路径补 message。
  - 删除取消收藏确认弹窗，取消收藏改为直接调用接口。
- Pairing 相关测试文件
  - 增加成功和失败 message 断言。

## 测试计划

- Pairing Page：
  - 删除已选属性成功后出现 `Pairing property deleted.`。
  - 删除已选属性失败后出现 `Unable to delete pairing property.`。
  - 添加可选属性成功后出现 `Pairing property added.`。
  - 添加可选属性失败后出现 `Unable to add pairing property.`。
  - 收藏成功后出现 `Favorite saved.`。
  - 收藏失败后出现 `Unable to save favorite.`，并确认收藏状态回滚。
  - 取消收藏成功后出现 `Favorite removed.`。
  - 取消收藏失败后出现 `Unable to remove favorite.`，并确认收藏状态回滚。
  - 点击实心爱心取消收藏时不出现 `Remove favorite property?` 弹窗。
  - 收藏接口 pending 时按钮呈现 disabled 状态，并阻止重复请求。
- Search Pairings Page：
  - 搜索条件添加到当前 Pairing 成功后出现 `Pairing property added.`。
  - 搜索条件添加失败后出现 `Unable to add pairing property.`。
  - 搜索条件收藏成功后出现 `Favorite saved.`。
  - 搜索条件收藏失败后出现 `Unable to save favorite.`，并确认收藏状态回滚。
  - 搜索条件取消收藏成功后出现 `Favorite removed.`。
  - 搜索条件取消收藏失败后出现 `Unable to remove favorite.`，并确认收藏状态回滚。
  - 点击实心爱心取消收藏时不出现 `Remove favorite property?` 弹窗。

交付前优先运行 PBS Portal 相关测试；如改动影响 provider 或 shared UI，再补跑更高层级验证。

## 验收标准

- Pairing 添加、删除、收藏、取消收藏类操作不再静默成功或静默失败。
- 成功 message 只在后端确认成功后出现。
- 失败 message 只在请求失败后出现。
- 取消收藏不再出现二次确认弹窗，点击实心爱心即可发起请求。
- 收藏/取消收藏 pending 时有明确 disabled 视觉状态，不允许重复提交。
- message 展示为顶部居中轻量提示，不使用边角 toast 位置。
- message 宽度随内容自适应，最大不超过 500px，小内容不出现整行拉伸。
- success / error 状态颜色明确区分：成功为绿色，失败为红色，状态图标同步使用对应颜色。
- 所有新增提示文案通过 i18n key 获取。
- PBS Portal 不直接引入或封装新的基础通知组件，通知基础能力来自 `packages/ui`。
- 不引入新的通知库，不改变现有页面布局和业务接口契约。
