# PBS Crew Bid Import Layover In + Duration 组合条件解析设计

## 背景

June 2026 CLASS bid 文件中，crew `2038` 的 Default Bid 包含：

```text
Avoid Pairings If Any Layover In CUN
Avoid Pairings If Any Layover In CUN And Of Duration > 015:00
```

当前导入 mapper 已支持：

- `Any/Every Layover In Airport`，property `104`
- `Any/Every Layover Duration`，property `119`

但第二条组合语句被错误解析为一个机场条件，机场值变成 `CUN AND OF DURATION > 015:00`，导致报告里看起来像机场字段脏数据。

## 目标

将 `Any/Every Layover In <airport-list> And Of Duration <comparison>` 解析为同一个 tier 下的组合条件：

- property `104`: `Any/Every Layover In Airport`
- property `119`: `Any/Every Layover Duration`

这样报告可以明确区分：

- 解析层面：条件已支持
- 数据层面：如果目标 period/base/rank 下没有该 layover airport，则仍记录 `airport_not_in_pairing_period`

## 范围

本次只调整 live-server crew bid import mapper 和测试。

不改变 pairing search SQL、不新增 property、不调整 UI。

## 解析规则

新增优先匹配规则，放在普通 `Any/Every Layover In` 之前：

```text
^(Any|Every) Layover In <airports> And Of Duration <duration comparison>$
```

解析结果：

- 主条件：property `104`，operator `In`，`paramA=<airports>`，`paramC=any/every`
- 组合条件：property `119`，operator/param 按现有 duration parser 解析，`paramC=any/every`

示例：

```text
Avoid Pairings If Any Layover In CUN And Of Duration > 015:00
```

映射为：

```text
Tn Avoid 104 In CUN paramC=any
Tn Avoid 119 > 015:00 paramC=any
```

## 验收标准

- Mapper 单测覆盖 `Any Layover In CUN And Of Duration > 015:00`
- crew `2038` dry-run 不再出现机场值 `CUN AND OF DURATION > 015:00`
- 如果 Jun 2026 `YEG FA` pairing pool 仍没有 `CUN` layover，crew `2038` 仍可因数据匹配不到而 failed，但失败原因应只指向 `CUN` 不在目标期 layover airport 中

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 mapper 和对应测试，拆分没有收益。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/services/crew-bid-import/crew-bid-property-mapper.ts` 及其测试。
- Conflict risk: 低。
- Execution gate: 用户已确认处理该组合解析问题。
