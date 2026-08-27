# PBS Pairing 条件 Migration 恢复设计

> 状态：已批准执行
>
> 日期：2026-07-13

## 目标

将远端 `f8_pbs` 的 Pairing 条件 catalog 与已落地的 Portal / Server 契约重新对齐，补齐审计确认遗漏的 migration，且不回退 Airport Preference `168` 的最新结构。

## 审计事实

- `103` 仍是旧的 `Pairing Check-In Time`，`111` 仍为可见的 `Pairing Check-Out Time`；旧 rule group 分别为 469 与 43。
- `112` 仍使用旧 operator / `int` validation，而不是 Pairing Length Preference 契约。
- Airport Preference `168` 的新契约与旧数据清理已经存在；但旧 Airport / Flight Legs 入口被后续 visibility restore 重新显示。
- 数据库没有 migration ledger；本次以最终数据库状态而非执行记录作为依据。

## 执行范围

1. 执行现有 `2026-07-12-pbs-pairing-check-time-unified-condition.sql`。
   - 合并为 `Pairing Check-In / Check-Out Time`。
   - 隐藏旧 `111`，删除旧 `103/111` bid group / favorite；不转换旧 payload。
2. 执行现有 `2026-07-13-pbs-pairing-length-preference.sql`。
   - 仅同步 `112` 的 catalog metadata，不删除数据。
3. 新增前向 migration，仅设置以下旧入口为不可见：`101, 104, 108, 119, 123, 124, 130`。
   - 保持 `is_active` 与数据不变。
   - 不修改 `168`，不重跑旧 Airport migration，避免覆盖新契约。

## 验收

- `103` 名称与 validation 变为 unified Check-Time；`111` 不可见/不活跃；旧 `103/111` group 清零。
- `112` 的 operator 为 `null`，validation 为 `pairing_length_preference`。
- 上述七个旧 Airport / Flight Legs 入口不可见；`168` 仍为 Airport Preference 最新 validation。
- 执行后以远端只读查询验证，不提交 Git。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 所有动作写同一个远端 PBS catalog 与 bid 表，必须顺序执行并立即核验。
- Conflict risk: 高；Check-Time migration 为破坏性删除。
