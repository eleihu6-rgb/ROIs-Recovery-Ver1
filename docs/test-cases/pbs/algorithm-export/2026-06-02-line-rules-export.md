# PBS Algorithm Export：LINE_RULES.csv QA

日期：2026-06-02

## 覆盖范围

- `/api/admin/algorithm-export` 导出包包含 `LINE_RULES.csv`。
- 导出包包含 `LINE_RULES_README.md`。
- Line rule counter 按 `Crew_ID + Rule_ID + Rule_Type + Parameters_JSON` 聚合。
- `Reserve / Flying Date Pattern` 在 `LINE_RULES.csv` 中用 `Rule_ID=410` 表达。
- Line `Reserve` 在 `LINE_RULES.csv` 中用 `Rule_ID=427` + 显式 `action` 表达。

## 人工测试步骤

1. 使用管理员账号登录 PBS。
2. 为同一 crew 在 Current Line bid 中配置 `Target Credit Range 75-85`，选择 T1。
3. 再配置同参数 `Target Credit Range 75-85`，选择 T3 两次或通过重复数据验证 T3 counter 累加。
4. 配置 `Reserve / Flying Date Pattern`，验证普通 reserve/flying pattern 仍使用 `Rule_ID=410`。
5. 配置 Line `Reserve`，分别选择 `Award · reserve-only` 与 `Avoid · no reserve`，验证 reserve action 表达。
6. 调用：

```bash
curl -H "Authorization: Bearer <admin-token>" \
  "http://localhost:3002/api/admin/algorithm-export?periodCode=Jun%202026" \
  -o /tmp/pbs-algorithm-export-Jun-2026.tgz
```

7. 解包并检查：

```bash
tar -tzf /tmp/pbs-algorithm-export-Jun-2026.tgz
tar -xOzf /tmp/pbs-algorithm-export-Jun-2026.tgz LINE_RULES.csv
tar -xOzf /tmp/pbs-algorithm-export-Jun-2026.tgz LINE_RULES_README.md
```

## 预期结果

- 包中存在 `DAYSOFF.csv`、`PAIRING_SCORE.csv`、`LINE_RULES.csv`、`LINE_RULES_README.md`。
- `LINE_RULES.csv` 表头为：

```csv
Crew_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,T2_Counter,T3_Counter,T4_Counter,T5_Counter,T6_Counter,T7_Counter,Description
```

- `Target Credit Range 75-85` 行的 `Rule_ID=411`，`Rule_Type=TARGET_CREDIT_RANGE`。
- 相同参数在 T3 重复时，`T3_Counter` 大于 1。
- `Reserve / Flying Date Pattern` 行的 `Rule_ID=410`，`Parameters_JSON` 包含 `segments`。
- `Reserve / Award reserve-only` 行的 `Rule_ID=427`，`Rule_Type=RESERVE`，`Parameters_JSON={"action":"award","scope":"whole_bid_month"}`。
- `Reserve / Avoid no reserve` 行的 `Rule_ID=427`，`Rule_Type=RESERVE`，`Parameters_JSON={"action":"avoid","scope":"whole_bid_month"}`。
- `LINE_RULES_README.md` 包含 Rule ID 对照与 Reserve 说明。
