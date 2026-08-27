# PBS Pairing Number 单窗口配置交互设计

## 背景

当前 `/pairing` 右侧 `ADD PAIRING PROPERTIES` 中的 `Pairing Number` 存在两个体验问题：

1. 新增时会带默认 `M4959`，用户点击加号后不是干净配置状态。
2. `Pairing Number` 的流程被拆成两个弹窗：先打开 `Configure Pairing Bid`，点击 `ADD BID / SAVE FAVORITE` 后再打开 `Choose Pairing Run`。用户需要在两个窗口之间理解同一个条件的配置，交互语义不清晰。

用户确认：本轮只调整 `/pairing` 右侧 `ALL PROPERTIES / FAVORITED PROPERTIES / EXISTING PAIRING PROPERTIES` 里的 `Pairing Number`。`Search Pairings` 页面先不动。

## 目标

- `Pairing Number` 新增时不预填默认 pairing number。
- 未配置值时，右侧列表/摘要显示 `--`，与 `Prefer Off` 的空值体验对齐。
- 点击 `Pairing Number` 加号后，只打开一个配置弹窗。
- 在同一个 `Configure Pairing Bid` 弹窗内完成：
  - `TIERS`
  - `MODE`：`Award / Avoid`
  - `BID`：搜索并选择 `Pairing Number`
  - `Pairing Run`：选择 `Entire Month / Specific Date`
  - `Specific Date` 模式下选择 run date
  - `CANCEL / SAVE FAVORITE / ADD BID`
- `EXISTING PAIRING PROPERTIES` 里的 `Pairing Number` 编辑也使用同一个配置弹窗，不再弹第二个窗口。
- 保留当前后端保存语义：最终仍保存 `tag-list` 或 `tag-list-date` bid，不改数据库表和接口契约。

## 非目标

- 不改 `Search Pairings` 页面里的 Pairing Number criterion / occurrence 选择流程。
- 不改左侧 `BIDDING CALENDAR` 的 pairing 添加入口。
- 不改后端 API、数据库结构或 pairing occurrence 查询接口。
- 不迁移历史数据。
- 不改变非 `Pairing Number` 条件的弹窗结构和保存逻辑。

## 推荐方案

在现有 `PairingPropertyConfigDialog` 中为 `propertyCode=102 Pairing Number` 增加单窗口 occurrence 配置区，而不是继续打开独立 `PairingOccurrenceBidDialog`。

### Pairing Number 新增

1. `ALL PROPERTIES` 里的 `Pairing Number` 初始 bid 应为空：
   - `bid.type = "tag-list"`
   - `bid.values = []`
   - 不再把 mock 或默认首个 pairing number 塞进输入框。
2. 用户点击加号后打开 `Configure Pairing Bid`。
3. 弹窗内输入/搜索 Pairing Number 后，选中的 number 以输入框内 chips 显示。
4. 当已选择至少一个 Pairing Number 后，同一个弹窗内显示 `Pairing Run` 区域：
   - 默认 `Entire Month`
   - 可切换 `Specific Date`
   - `Specific Date` 下按选中的 Pairing Number 和当前 bid period 加载 occurrence，并在弹窗内选择 origin date。
5. 点击 `ADD BID` 时：
   - `Entire Month` 构造成 `tag-list`
   - `Specific Date` 构造成 `tag-list-date`
   - 继续调用现有新增保存逻辑。

### Pairing Number 收藏

1. 在同一弹窗中点击 `SAVE FAVORITE`。
2. 保存前使用与新增一致的 Pairing Number / occurrence 配置。
3. 收藏保存的是完整配置快照，不是空模板。

### Existing 编辑

1. `EXISTING PAIRING PROPERTIES` 中点击编辑 `Pairing Number` 时，打开同一个配置弹窗。
2. 如果已有 bid 是 `tag-list`，弹窗显示 `Entire Month`。
3. 如果已有 bid 是 `tag-list-date`，弹窗显示 `Specific Date`，并保留原日期。
4. 保存时继续走当前 patch 逻辑，不新增第二个 occurrence 弹窗。

## UI 行为细节

- `BID` 区只保留搜索输入框和已选 chips。
- 不显示搜索框下方的 suggestion 按钮区。
- 当 Pairing Number 为空时：
  - `ADD BID` 和 `SAVE FAVORITE` 应 disabled，或点击时提示 `Enter a Pairing Number before adding this bid.`
  - 列表摘要显示 `--`。
- `Specific Date` 模式下：
  - run date 加载中显示 loading。
  - 加载失败只用统一 message 或弹窗内单一错误提示，不重复展示错误。
  - 没有 run date 时显示空态，不能提交。
- 弹窗仍使用现有 i18n 文案体系，新文案必须加到 locale 文件，不能写死。

## 实现范围

前端：

- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
  - 增加 Pairing Number 单窗口 occurrence 区域。
  - 接收 occurrence 数据、loading/error、mode、selected occurrence 等 props。
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - 去掉 `/pairing` 右侧 Pairing Number 新增/收藏/编辑时打开第二弹窗的路径。
  - 把 occurrence 查询和选择状态传给配置弹窗。
  - 保存时在 confirm/favorite 前构造最终 bid。
- `pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx`
  - 本轮不影响 `Search Pairings`，该组件可继续保留给 Search Pairings 使用。
- Pairing mock / mapper / catalog 默认值
  - 清理 `Pairing Number` 可用属性的默认 `M4959`。

测试：

- 更新 `/pairing` 页面测试：
  - 点击 `Pairing Number` 加号只出现一个配置弹窗。
  - 新增时不显示默认 `M4959`。
  - 未选 Pairing Number 时不能添加或提示必填。
  - 选择 Pairing Number 后 `Entire Month` 可直接添加。
  - 切换 `Specific Date` 后在同弹窗选择 run date 并添加。
  - `SAVE FAVORITE` 保存完整 Pairing Number 配置。
  - Existing Pairing Number 编辑不打开第二弹窗。
- 更新控件测试：
  - `tag-list` 不显示 suggestion 按钮区。
- 新增/更新 QA 手工测试案例：
  - 路径：`docs/test-cases/pbs/pairing/2026-05-22-pairing-number-single-dialog-regression.md`

## 验收标准

1. `ALL PROPERTIES` 中 `Pairing Number` 默认值为空，摘要显示 `--`。
2. 点击 `Pairing Number` 加号只出现一个 `Configure Pairing Bid` 弹窗。
3. 弹窗内搜索并选择 Pairing Number 后，值只在 `BID` 输入框内展示。
4. 弹窗内可以选择 `Entire Month / Specific Date`。
5. `Specific Date` 的 run date 在同一弹窗内选择，不出现第二个 `Choose Pairing Run` 弹窗。
6. `ADD BID`、`SAVE FAVORITE`、Existing 编辑均保持原数据语义。
7. 不影响 `Search Pairings` 页面现有 Pairing Number occurrence 流程。
8. 相关自动化测试通过，并补充 QA 测试案例。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次主要集中在 Pairing 前端弹窗、右侧面板状态和对应测试，拆分多 agent 会触碰同一批文件，协调成本和冲突风险高于收益。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/pairing/**` 与 `docs/test-cases/pbs/pairing/**`。
- Conflict risk: Medium。当前工作树已有 Pairing UI 调整，需要顺着现有改动继续，避免覆盖用户或前序修改。
- Execution gate: 用户审核本 spec 后再进入实现。
