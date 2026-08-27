# PBS Pairing Number 搜索语义修正设计

日期：2026-05-01  
作者：Codex  
状态：已确认，已实施

## 背景

用户在 `Pairing Number / Pairing ID` 输入框中输入 `4501` 时，系统当前会按 live 数据库内部 `pairing.id` 命中一条数据：

```text
pairing.id = 4501
pairing_label = V4146
date range = 2026-04-30 - 2026-05-01
```

这会造成业务语义混乱。AA 文档中的 `Pairing ID` 指给乘务员使用的 pairing number，例如 `V4146`，不是数据库内部行 id `4501`。

因此当前“输入内部 id 也能搜到 pairing”的行为应该取消。

## 目标

1. `Pairing Number / Pairing ID` autocomplete 只按业务 Pairing Number 搜索，也就是 live `pairing.pairing_label`。
2. 用户输入 `V4146` 可以搜到对应 pairing。
3. 用户输入内部数据库 id `4501` 不应该因为 `pairing.id=4501` 而命中 `V4146`。
4. 保存 bid 的业务值继续使用 Pairing Number，例如 `V4146`。
5. 后端返回中可以继续带 `pairingId` 作为内部元数据，供详情、debug、日历 metadata 使用，但前端搜索、展示和保存都不把它当业务 Pairing ID。
6. `Pairing Number` 条件预览和 occurrence 查询也只按 `pairing_label` 匹配，不能用 live 内部 `pairing.id` 兜底。
7. 前端用户可见搜索文案统一使用 `Pairing Number`；如确需展示 live 行 id，只能标记为 `Internal ID`。

## 不做范围

- 不把 live 内部 `pairing.id` 作为用户可搜索值。
- 不在下拉里展示 `ID 4501`。
- 不改 Pairing ID occurrence 的 `Entire Month / Specific Date` 日期口径。
- 不改跨月 carry-out 规则。
- 不迁移历史已保存 draft 数据。
- 不在本轮重命名 API route / contract 字段，例如 `/pairing-search/pairing-ids`、`pairingIdCount`，避免扩大接口破坏面；这些字段后续可以单独做兼容迁移。

## AA 口径

AA 文档里的 `Pairing ID` 实际是业务 pairing number。Search Pairings 的 mini-calendar 展示该 pairing number 在 bid month 中 originate 的日期。

例如 `V4146 (2026-04-30 - 2026-05-01)`：

- `V4146` 是用户应该搜索和 bid 的 Pairing ID / Pairing Number。
- `4501` 只是我们 live 表里的内部行 id。
- 这趟 pairing 按 `2026-04-30` originate，不算 `2026-05-01` originate。

## 实现方案

后端 `pairing-id-search-query` 修改：

- 查询条件只匹配 `upper(pairing_label) like ...`。
- 排序条件只基于 `pairing_label`。
- 仍返回内部 `pairing_id` 字段，但只作为 option metadata。
- `value` 仍为 `pairing_label`。
- `label` 展示为：

```text
V4146 (2026-04-30 - 2026-05-01)
```

当前如果 `pairing_label` 为空，不返回该 pairing，因为它没有可供用户 bid 的业务 Pairing Number。

后端 `propertyCode=102 Pairing Number` 条件修改：

- `Search Pairings` 预览条件只匹配 `upper(p.pairing_label) = any(...)`。
- occurrence 查询只匹配 `upper(p.pairing_label) = any(...)`。
- 不再使用 `p.id::text = any(...)` 或 `coalesce(p.pairing_label, p.id::text)` 作为业务匹配条件。

前端原则上不需要改接口调用：

- 仍调用 `/api/pairing-search/pairing-ids`。
- 下拉展示后端返回的 `label`。
- 选择后保存 `value`，也就是 `pairing_label`。
- 搜索框、空态、loading、错误文案改为 `Pairing Number`。
- 日历只读详情中的内部 live 行 id 标记为 `Internal ID`，不再叫 `Pairing ID`。

## 测试计划

后端：

1. 输入 `V4146`，返回 `value=V4146`，并带内部 `pairingId` metadata。
2. 输入 `4501`，如果没有 `pairing_label` 包含 `4501`，不应因为 `pairing.id=4501` 命中 `V4146`。
3. `pairing_label` 为空的数据不出现在 autocomplete 结果中。
4. occurrence 查询输入 `4501` 不应因为内部 `pairing.id=4501` 返回 `V4146`。
5. `Pairing Number` 条件预览 SQL 不再包含 `coalesce(p.pairing_label, p.id::text)`。

前端：

1. 保持 Pairing Number autocomplete 能展示业务 Pairing Number。
2. 选择后 bid value 仍是业务 Pairing Number。
3. Search Pairings 和 Pairing 主页面 occurrence 选择流程不回归。
4. 用户可见搜索与结果汇总文案使用 `Pairing Number / pairing numbers`。

验证：

- 跑后端 pairing search service/route 相关测试。
- 跑前端 pairing autocomplete/页面相关测试。
- 最后跑 `npm run verify:pbs`。

## 验收标准

1. 用户输入 `V4146` 能搜到 `V4146 (2026-04-30 - 2026-05-01)`。
2. 用户输入 `4501` 不会因为内部 `pairing.id=4501` 搜出 `V4146`。
3. 新增 Pairing Number bid 保存值是 `V4146`。
4. 内部 `pairingId` 只作为元数据保留，不作为用户搜索/展示/保存的业务值。
5. `npm run verify:pbs` 通过。
