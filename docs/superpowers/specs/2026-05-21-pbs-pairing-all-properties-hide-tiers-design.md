# PBS Pairing ALL PROPERTIES 隐藏 Tiers 设计

## 背景

Pairing 页面 `ADD PAIRING PROPERTIES` 下包含 `ALL PROPERTIES` 与 `FAVORITED PROPERTIES` 两个列表。`ALL PROPERTIES` 表示可添加的条件模板，还不是用户已经配置好的 bid；此时展示 Tiers 会让用户误以为模板已经绑定到某些 Tx。

Days Off 页面已经采用更清晰的语义：模板列表不展示 Tiers，配置弹窗、已添加条件、已配置收藏才展示或选择 Tiers。Pairing 需要与该交互保持一致。

## 目标

- `ALL PROPERTIES` 中不显示 Tiers。
- `ALL PROPERTIES` 隐藏 Tiers 后使用与 Days Off 一致的两列布局，收回右侧空列并让 Bid 区域自然扩展。
- `ALL PROPERTIES` 不显示旧的 inline edit 铅笔入口，配置统一从加号弹窗进入。
- 点击 `ALL PROPERTIES` 的加号后，配置弹窗仍显示并允许选择 Tiers。
- `FAVORITED PROPERTIES` 仍显示保存好的 Tiers，且保持禁用展示态。
- `FAVORITED PROPERTIES` 的禁用 Tier 视觉状态与 Days Off 对齐：未选中为浅灰底灰字，已选中仍保留紫色选中态，不出现可交互 hover 感。
- `EXISTING PAIRING PROPERTIES` 仍显示并允许编辑 Tiers。
- `EXISTING PAIRING PROPERTIES` 显示 edit 入口，允许用户修改已添加 Pairing bid 的 Mode、Quantifier、Bid 和 Tiers；保存时走现有 PATCH 接口。

## 范围

- 仅修改 `pbs-portal` Pairing 前端展示层和相关测试。
- 不修改接口契约、后端服务、数据库表结构或收藏数据语义。
- 不改变可添加条件、已收藏条件、已添加条件的数据来源。

## 实现方案

推荐在 Pairing 表格渲染层增加显式展示控制：

- `PairingPropertyTableHeader` 支持是否展示 Tiers 标题。
- `AvailablePairingPropertyRow` 支持是否展示 Tiers 单元。
- 隐藏 Tiers 时使用两列布局，避免保留原四列中的空 Tier 区域。
- 移除 Pairing 可添加列表的旧 inline edit 入口与编辑器，避免与 Configure 弹窗形成双入口。
- Existing 行新增 edit 按钮，复用 Pairing Configure 弹窗，确认按钮为 `UPDATE BID`，保存后调用现有 `patchCurrentDraftProperty`。
- `PairingRightPanel` 根据当前 tab 控制展示：
  - `activeTab === "all"` 时隐藏。
  - `activeTab === "favorited"` 时显示。

不在数据转换层清空 `tiers`，避免影响配置弹窗默认选择、收藏新增和已有保存逻辑。

## 验收标准

- Pairing `ALL PROPERTIES` 不出现 `TIERS` 标题或 Tier 按钮。
- Pairing `ALL PROPERTIES` 行布局不保留空 Tier 列，Bid 宽度与 Days Off 的隐藏 Tiers 布局对齐。
- Pairing `ALL PROPERTIES` 不出现 edit 铅笔按钮；点击加号后仍可在配置弹窗内修改 Mode、Quantifier、Bid 和 Tiers。
- Pairing `FAVORITED PROPERTIES` 仍出现 `TIERS` 标题和禁用态 Tier 展示。
- Pairing `FAVORITED PROPERTIES` 的 Tier 禁用样式与 Days Off 一致。
- Pairing `EXISTING PAIRING PROPERTIES` 可打开 edit 弹窗并更新已添加 bid。
- 打开配置弹窗后仍可以选择 Tiers。

## 测试计划

- 补充/调整 Pairing 页面测试，验证 `ALL PROPERTIES` 不展示 Tiers。
- 验证切换到 `FAVORITED PROPERTIES` 后仍展示 Tiers。
- 运行 Pairing 页面相关测试，必要时运行前端测试子集。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Pairing 前端展示组件与测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing` 相关组件与测试。
- Conflict risk: 低。
- Execution gate: 用户已确认本设计后执行。
