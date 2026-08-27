# PBS Line 混合添加与配置收藏交互设计

日期：2026-05-28  
状态：补充视觉交互规则，待用户确认  
范围：Line 页面 `ADD LINE PROPERTIES` 中可用条件的添加方式、配置弹窗、收藏行为；本文件只定义需求和方案，不包含实现改动。

## 背景

当前 Line 页面使用共享 `RuleBidRightPanel`，可用条件列表里点击 `+` 会直接添加。这个对固定 Line 条件是合理的，因为很多 Line 条件没有可配置参数：

- `Max Credit Window`
- `Min Credit Window`
- `Clear Schedule and Start Next Bid Group`
- `No Same Day Pairings`
- `Waive No Same Day Duty Starts`

但现在 Line 增加了更复杂的条件：

- `Forget Line`
- `Min Base Layover`
- `Commuter Pattern`

这些条件需要用户先配置 bid 值再添加。尤其 `Commuter Pattern` 要配置类似：

```text
5 on / 4 off
4 on / 4 off
4-5 on / 4 off
```

因此 Line 不应该完全照 Days Off / Pairing “全部弹窗”，也不应该全部直接添加。更合理的是混合模式：

- 简单固定条件直接添加。
- 需要配置的条件先弹窗。
- 收藏行为跟 Pairing / Days Off 的配置收藏语义对齐。

## 目标

1. 保留简单 Line 条件点击 `+` 直接添加。
2. 对需要配置的 Line 条件点击 `+` 打开配置弹窗。
3. 对需要配置的 Line 条件点击心形时，也打开配置弹窗保存“配置后的收藏”。
4. Favorited 中已经配置好的收藏，点击 `+` 直接添加，不重复弹窗。
5. 不破坏现有 Line 直接添加、合并 tier、防重复、删除、patch 行为。
6. 尽量复用共享 `RuleBidRightPanel` 和现有 `PairingBidControl`，不重写大面板。
7. `ADD LINE PROPERTIES` 的列表区域只作为“选择入口”，不要把需要弹窗配置的 bid 控件直接铺在列表里，避免用户误以为可以在列表内编辑。

## 条件分类

### 直接添加条件

这些条件没有用户需要配置的 bid 值，点击 `+` 直接添加：

| Code | Name | 默认 bid |
| --- | --- | --- |
| `401` | `Max Credit Window` | `flag` |
| `402` | `Min Credit Window` | `flag` |
| `403` | `Clear Schedule and Start Next Bid Group` | `flag` |
| `404` | `No Same Day Pairings` | `flag` |
| `405` | `Waive No Same Day Duty Starts` | `flag` |

点击收藏心形：

- 可直接收藏默认配置。
- 不弹窗。
- 在 `ALL PROPERTIES` 列表中继续显示爱心 icon。

### 需要配置弹窗的条件

这些条件点击 `+` 先打开配置弹窗：

| Code | Name | 原因 |
| --- | --- | --- |
| `406` | `Forget Line` | 需要输入 line number |
| `407` | `Min Base Layover` | 需要输入 duration |
| `408` | `Commuter Pattern` | 需要配置 work/off block pattern |

点击收藏心形：

- `ALL PROPERTIES` 列表中不显示爱心 icon，避免用户误以为可以直接收藏默认值。
- 这些条件的 configured favorite 通过 `LineBidDialog` 内的 `Save Favorite` 完成。
- 未来如果需要从列表心形触发配置收藏，需要另行确认交互；本轮不做。

### Favorited 已配置项

如果 available property 来源是 `favorite`：

- 点击 `+` 直接添加该已配置 favorite。
- 保留删除收藏入口，用于移除 configured favorite。
- 不再次弹出配置弹窗。
- `BID` 列展示保存时的已配置 bid 值，帮助用户区分不同收藏。

## 列表视觉规则

### All Properties

`ADD LINE PROPERTIES` 的 `ALL PROPERTIES` tab 是添加入口，不是配置表单。

- `401-405`：
  - `BID` 列显示 `--`。
  - 保留爱心 icon，可直接收藏/取消收藏普通 favorite。
  - 显示 `TIERS`，因为这些条件不会弹窗，用户需要在列表里选择 Tx 后再添加。
  - 点击 `+` 直接添加。
- `406-408`：
  - `BID` 列显示 `--`。
  - 隐藏爱心 icon。
  - 隐藏 `TIERS`，因为这些条件会弹窗，Tx 应在弹窗里和 bid 一起配置。
  - 点击 `+` 打开 `LineBidDialog` 配置后添加。

这样做的原因：

- `406-408` 的真实配置在弹窗内完成，列表里直接显示 `1`、`013:00`、pattern 输入框会造成“这里可以编辑”的错觉。
- `401-405` 没有可配置 bid，保留爱心是安全的，因为它只表示收藏固定条件模板。
- `BID` 列统一显示 `--` 后，Line 的可用列表更像一个清晰的 property picker。

### Favorited Properties

`FAVORITED PROPERTIES` tab 展示用户已经保存过的 favorite：

- 普通 favorite：可显示 `--` 或固定状态摘要；点击 `+` 直接添加。
- configured favorite：显示保存时的 bid 摘要，例如 `5 days on / 4 days off` 或 `013:00`。
- `TIERS` 只读展示，不允许在收藏列表里修改。
- 普通 favorite 和 configured favorite 都统一显示删除收藏入口，删除 icon 和确认弹窗对齐 Days Off。
- Favorited 中不显示爱心 icon，语义改为“在 All 里收藏，在 Favorited 里删除”。
- configured favorite 点击 `+` 直接添加，不再弹窗。

## 交互设计

### 添加配置弹窗

新增 Line 专用弹窗：

```text
LineBidDialog
```

标题：

```text
Configure Line Bid
<property name>
```

内容：

- `BID`
  - 复用 `PairingBidControl`
  - 根据 bid type 渲染：
    - `stepper`：Forget Line
    - `text`：Min Base Layover
    - `days-off-on-pattern`：Commuter Pattern
- `Apply to Tx`
  - 显示 T1-T7
  - 默认 T1
- 操作：
  - `Cancel`
  - `Add Bid`
  - 如果由收藏触发且支持 configured favorite，则显示 `Save Favorite`

### 添加按钮行为

点击可用 property 的 `+`：

```text
if source === favorite:
  直接添加
else if propertyCode in [406, 407, 408]:
  打开 LineBidDialog
else:
  直接添加
```

### 收藏按钮行为

点击心形：

```text
if source === favorite:
  走删除收藏入口
else if propertyCode in [406, 407, 408]:
  ALL PROPERTIES 不显示心形；配置收藏只能在 LineBidDialog 内 Save Favorite
else:
  直接保存普通 favorite
```

## 数据流

### 添加配置条件

1. 用户点击 `406/407/408` 的 `+`。
2. 打开 `LineBidDialog`。
3. 用户配置 bid 和 Tx。
4. 点击 `Add Bid`。
5. 调用现有 `lineService.addCurrentDraftProperty`。
6. 成功后：
   - patch `linePageDataQueryKey`。
   - invalidate `tierPageDataQueryKey`。
   - 关闭弹窗。

### 保存配置收藏

1. 用户点击 `406/407/408` 的 `+`。
2. 打开 `LineBidDialog`。
3. 用户配置 bid 和 Tx。
4. 点击 `Save Favorite`。
5. 调用 `lineService.favoriteProperty` 或新增 configured favorite 版本。

当前 Line service 的 favorite API 是按 propertyCode 保存普通 favorite；如果它不支持保存 bid/tier 配置，则需要扩展成 configured favorite，行为对齐 Days Off。

推荐本轮做法：

- Line favorite 服务改为保存 configured favorite payload，至少对 `406/407/408` 可保存配置。
- `401-405` 继续走普通 favorite，不需要保存 configured favorite payload。

## 后端/API 影响

需要检查当前 Line favorite API：

```text
PUT /line-bids/current/favorites/:propertyCode
```

如果只能保存 propertyCode，无法保存 configured bid。

为了支持配置收藏，需要新增或扩展：

```text
POST /line-bids/current/favorites
```

payload 类似 Days Off configured favorite：

```json
{
  "draftKey": "...",
  "periodCode": "...",
  "bidContext": "Current",
  "property": {
    "propertyCode": 408,
    "name": "Commuter Pattern",
    "bid": {
      "type": "days-off-on-pattern",
      "minDaysOff": 4,
      "minDaysOn": 5,
      "maxDaysOn": 5
    },
    "tiers": ["T1"]
  }
}
```

如果后端已有通用 favorite 表结构可以复用，优先复用，不新增表。

## 不做范围

- 不改变 Pairing / Days Off 页面交互。
- 不让所有 Line 条件都弹窗。
- 不把 Line 复杂条件移到 Days Off。
- 不实现最终 optimizer 对 `Commuter Pattern` 的排班打分。
- 不改变 `408` 的基本校验语义。

## 测试范围

### 前端

更新 `line-page.test.tsx`：

1. `401 Max Credit Window` 点击 `+` 仍直接调用 add API。
2. `408 Commuter Pattern` 点击 `+` 打开 `LineBidDialog`。
3. 在弹窗配置 `5 on / 4 off` 后，点击 `Add Bid`，payload 正确。
4. `406 Forget Line` 和 `407 Min Base Layover` 点击 `+` 打开配置弹窗。
5. `ALL PROPERTIES` 中 `401-405` 显示爱心，点击心形直接保存 favorite。
6. `ALL PROPERTIES` 中 `406-408` 不显示爱心。
7. `ALL PROPERTIES` 中 `401-408` 的 `BID` 列都显示 `--`，不显示可编辑控件。
8. `408` 在弹窗内点击 `Save Favorite` 保存 configured favorite。
9. configured favorite 来源的 `408` 点击 `+` 直接添加。
10. `ALL PROPERTIES` 中 `401-405` 显示可选 `TIERS`，`406-408` 不显示 `TIERS`。
11. `FAVORITED PROPERTIES` 中所有 favorite 都显示删除 icon，且 tier 为只读展示。

### 后端

如果新增 configured favorite API：

1. 保存 `408 Commuter Pattern` configured favorite 成功。
2. 保存非法 `408` configured favorite 返回 400。
3. 删除 configured favorite 使用 stable favorite key。

## 验收标准

1. Line 简单条件仍可一键添加。
2. `Forget Line` / `Min Base Layover` / `Commuter Pattern` 添加前弹窗配置。
3. `Commuter Pattern` 能通过弹窗配置 `5 on / 4 off`。
4. 配置型 Line 条件可保存 configured favorite。
5. Favorited 里的配置项可直接添加。
6. `ALL PROPERTIES` 的 `BID` 列不再显示 Line bid 输入控件，统一显示 `--`。
7. `ALL PROPERTIES` 中只有不需要弹窗的 `401-405` 显示爱心 icon；需要弹窗的 `406-408` 不显示爱心 icon。
8. `ALL PROPERTIES` 中只有不需要弹窗的 `401-405` 显示可选 `TIERS`；需要弹窗的 `406-408` 隐藏 `TIERS`。
9. `FAVORITED PROPERTIES` 中所有 favorite 都不显示爱心，统一显示删除 icon，tier 只读。
10. Line 页面测试、相关后端测试、portal build、pbs-server build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务横跨 Line 前端交互、Line favorite API、缓存更新和测试，但核心链路高度耦合；拆分容易在同一文件冲突。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/line/*`、`pbs-server/src/services/line/*`、contracts 和必要测试。
- Conflict risk: 中等。共享 `RuleBidRightPanel` 可能需要轻微扩展，需谨慎保持 Pairing/Days Off 不变。
- Execution gate: 用户确认本 spec 后再开始实现。
