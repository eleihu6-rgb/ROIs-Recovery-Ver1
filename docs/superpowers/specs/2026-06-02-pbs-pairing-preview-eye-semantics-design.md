# PBS Pairing 预览小眼睛语义修正设计

日期：2026-06-02  
状态：待用户审核  
范围：PBS Portal Pairing 页面右侧 `EXISTING PAIRING PROPERTIES` 与 `ADD PAIRING PROPERTIES` 的 preview 入口展示和跳转语义。本文件只定义设计，不包含代码实现。

## 背景

Pairing 页面右侧 `ADD PAIRING PROPERTIES` 当前在所有可添加 property 行上都显示小眼睛。该小眼睛的业务含义是“查看这个条件可以过滤出多少 pairing / 进入 Search Pairings 预览结果”。

但 `ALL PROPERTIES` 下的普通 property 行只是“可添加的条件类型”，很多条件还没有用户填写 bid 值，例如 Pairing Number、Layover、Aircraft、Time、Duration 等。此时直接显示 preview 小眼睛，会让用户误以为 property 类型本身已经是完整过滤条件。

用户确认的正确语义是：

- 未填写的条件类型不能预览。
- 已收藏的条件可以预览，因为 favorite 是已经配置好的完整条件。
- 已添加到 `EXISTING PAIRING PROPERTIES` 的条件可以预览。
- `EXISTING PAIRING PROPERTIES` 既要保留整体预览，也要支持每条条件各自预览。

## 目标

1. 移除 `ADD PAIRING PROPERTIES > ALL PROPERTIES` 普通 property 行上的小眼睛。
2. 保留 `ADD PAIRING PROPERTIES > FAVORITED PROPERTIES` 行上的小眼睛。
3. 保留 `EXISTING PAIRING PROPERTIES` 顶部整体 Search 入口，用于预览当前所有已添加 pairing 条件组合。
4. 为 `EXISTING PAIRING PROPERTIES` 每条已添加条件提供单条 preview 小眼睛，用于只预览这一条条件。
5. 保持 add、edit、delete、favorite 保存、favorite 删除、tier toggle 等现有行为不变。
6. Search Pairings 页面继续复用已有 preview contract：单条条件 preview 使用 `previewProperty`，整体当前规则 preview 使用 `previewMode: "current-rules"` 和 `existingProperties`。

## 非目标

- 不改变 Pairing Search 的结果页布局。
- 不改变后端 preview API contract。
- 不改变已有 Pairing bid value 的保存结构。
- 不新增 “未填写条件也可查看大概结果” 的 fallback 逻辑。
- 不把 disabled 小眼睛留在 `ALL PROPERTIES` 中；避免视觉噪音和误导。

## 推荐交互

### ALL PROPERTIES

普通可添加 property 行只显示 add 按钮。

用户点击 add 后进入配置弹窗；只有在弹窗中填写完整 bid 并保存为 existing 或 favorite 后，才出现 preview 语义。

### FAVORITED PROPERTIES

Favorite 行保留：

- add 按钮：直接把 favorite 条件添加到当前 existing 条件列表。
- delete favorite 按钮：删除收藏。
- preview 小眼睛：按该 favorite 的完整 bid 条件进入 Search Pairings 单条件预览。

### EXISTING PAIRING PROPERTIES

顶部整体 Search 按钮保留：

- 使用当前 active tier 和所有 existing properties 进入 current rules preview。
- 语义是“当前已添加条件整体能过滤出多少 pairing”。

每条 existing row 新增单条 preview 小眼睛：

- 使用该行 property 的完整 bid 条件进入 Search Pairings 单条件预览。
- 语义是“这一条条件单独能过滤出多少 pairing”。
- 与 edit、delete、tier toggle 并列展示，但不能影响这些操作。

## 数据流

### Favorite 单条预览

1. 用户在 `FAVORITED PROPERTIES` 行点击小眼睛。
2. 前端调用现有 `buildPairingSearchPreviewProperty(property)`。
3. 通过 location state 导航到 `/pairing/search`：

```ts
{
  previewProperty,
  draftMeta
}
```

4. Search Pairings 页面调用 `pairingService.previewCriteria(...)`。

### Existing 单条预览

1. 用户在 `EXISTING PAIRING PROPERTIES` 某一行点击小眼睛。
2. 前端把 existing property 转换成 preview property。
3. 通过 location state 导航到 `/pairing/search`：

```ts
{
  previewProperty,
  draftMeta
}
```

4. Search Pairings 页面调用 `pairingService.previewCriteria(...)`。

### Existing 整体预览

沿用当前整体 Search 行为：

```ts
{
  previewMode: "current-rules",
  initialTier,
  existingProperties,
  draftMeta
}
```

Search Pairings 页面调用 `pairingService.previewCurrentRules(...)`。

## 实现边界

建议修改集中在：

- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/features/pairing/pairing-property-transform.ts` 或现有 mapper/helper，如果需要复用 existing -> preview 转换
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- 必要时补充 `pbs-portal/src/shared/i18n/locales/en.ts` 的 aria label 文案

不应修改后端 API、contracts 或数据库结构。

## 验收标准

1. `ALL PROPERTIES` 的普通 property 行不再出现小眼睛。
2. `FAVORITED PROPERTIES` 行仍显示小眼睛，点击后进入 Search Pairings 单条件预览。
3. `EXISTING PAIRING PROPERTIES` 顶部整体 Search 仍可预览当前全部已添加条件。
4. `EXISTING PAIRING PROPERTIES` 每条已添加条件显示单条小眼睛。
5. 点击 existing 单条小眼睛后，只用该条 property 调用 `previewCriteria`，不会带上全部 existing properties。
6. 点击顶部整体 Search 后，仍调用 `previewCurrentRules`，不会退化成单条预览。
7. 普通 available property 的 add、favorite property 的 add/delete、existing property 的 edit/delete/tier toggle 行为保持不变。

## 测试设计

### 自动化测试

建议更新 Pairing 页面测试：

1. `ALL PROPERTIES` 普通 property 不显示 preview action。
2. `FAVORITED PROPERTIES` favorite property 显示 preview action，点击后导航到 Search Pairings 并触发 `previewCriteria`。
3. `EXISTING PAIRING PROPERTIES` 每行显示单条 preview action。
4. 点击 existing 单条 preview action 后，`previewCriteria` 的 payload 只包含该 property。
5. 顶部整体 Search 仍触发 `previewCurrentRules`，并携带当前 active tier 和 existing properties。

### 人工 QA 测试

需要新增或更新 PBS Pairing 测试案例，建议路径：

```text
docs/test-cases/pbs/pairing/2026-06-02-preview-eye-semantics.md
```

覆盖：

- ALL PROPERTIES 无小眼睛。
- FAVORITED PROPERTIES 可单条预览。
- EXISTING 顶部整体预览。
- EXISTING 单条条件预览。
- add/edit/delete/favorite/tier toggle 回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次修正集中在 Pairing 右侧面板和页面测试，拆分多 agent 的协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing` 相关组件、测试和必要文案；不触碰后端。
- Conflict risk: Low-Medium。主要风险是误伤 favorite、existing 单条 preview、current rules 整体 preview 三种入口的区分。
- Execution gate: 用户审核并批准本 spec 后，再进入实现。

## 待用户确认

本设计确认后进入实现。实现时只调整 preview 小眼睛的显示与导航语义，不改变 Pairing bid 保存结构，也不修改后端 preview contract。
