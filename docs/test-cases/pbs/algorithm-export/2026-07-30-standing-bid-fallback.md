# Standing Bid 算法导出兜底测试

## 目标

验证算法包按 crew 整体选择 Current 或 Standing，且空 Current 使用完整 Standing 兜底。

## 前置数据

准备四名测试 crew：

1. A：Current 有正式条件，同时有两个 Standing context。
2. B：Current 只有主记录或 Favorite，两个 Standing context 都有正式条件。
3. C：没有 Current，只有 `StandingLineholder`。
4. D：Current 与 Standing 都没有正式条件。

## 步骤

1. 从真实管理端算法导出入口生成目标月份 `.tgz`。
2. 解压并确认存在：
   - `DAYSOFF.csv`
   - `PAIRING_SCORE.csv`
   - `RESERVE_SCORE.csv`
   - `LINE_RULES.csv`
   - `LINE_RULES_README.md`
3. 检查 crew A：
   - 只出现 Current 结果；
   - Standing 条件没有补入或重复计数。
4. 检查 crew B：
   - `StandingLineholder` 条件进入 Days Off、Pairing、Line 对应文件；
   - `StandingReserve` 条件进入 Reserve 对应文件；
   - Favorite 不阻断 Standing。
5. 检查 crew C：
   - Standing-only crew 没有被普通导出或筛选遗漏。
6. 检查 crew D：
   - 不产生业务行；
   - CSV 结构和其他 crew 输出不受影响。
7. 使用 division、status、base、fleet filters 重复导出，确认规则不变。
8. 使用 Scenario package 重复验证，确认显式 crew scope 不会被扩大。

## 通过标准

- 每个 crew 只使用一套来源。
- Current 非空时整套优先。
- Current 为空时完整 Standing 兜底。
- 两个 Standing context 不按身份二选一。
- T1-T7 Counter、CSV 表头和列顺序不变。
- 五文件压缩包可以被现有算法正常读取。
