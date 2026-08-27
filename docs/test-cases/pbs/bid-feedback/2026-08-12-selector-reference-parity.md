# PBS Bid Feedback Selector 参考原型对齐测试用例

## 1. 测试目标

验证 `/api/bid-feedback/current` 的 Pairing 匹配不再复用 Pairing Search 的 Current Rules / Tier-AND 逻辑，而是按参考原型的 Feedback Selector 独立计算：

- Current Bid 有内容时使用 Current；Current 完全为空时回退 Standing；
- Pairing 候选包含当前 Period 重叠的 `FLY` 和 `RES`，不按 Crew Base / Rank / Division 过滤；
- 每个 Pairing bid 先做正向 selector 命中，再按 Award/Avoid 和 Tier 权重加减分；
- 最终只展示 Award / Avoid，Neutral 不展示，但仍参与 A1 等冲突分析。

## 2. 自动化覆盖

后端 focused 测试：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/bid-feedback/bid-feedback-service.test.ts src/services/bid-feedback/bid-feedback-pairing-matcher.test.ts
```

覆盖点：

- Pairing Preference；
- Airport Preference，含 final return-to-base landing 跳过和 layover minimum；
- Efficient Flying 全局 FLY distribution，RES 不参与；
- Pairing Check-In / Check-Out Time；
- Flight Legs per Duty，Deadhead 不计入 FLY legs；
- Work Day Preference Award-only 和 open-ended check-in window；
- Pairing Length 使用重新计算的 calendar span，单侧范围不生效；
- Flight Number Preference；
- Redeye Preference 使用 live dictionary 配置窗口；
- Month-End Carryover，Avoid 固定按 1 day carry-out；
- Deadhead Flying；
- Time Between Flights；
- RES pairing 无 segment 时仍可被 Pairing-level selector 命中；
- DB fact SQL 包含 `FLY` + `RES`，不需要 segment exists。

## 3. 人工主流程

1. 登录 PBS Portal，进入有当前 Bid Period 的 Crew。
2. 创建或准备 Pairing bids：
   - Award Pairing Length 2-3 days；
   - Avoid Redeye；
   - Award Airport Preference layover city；
   - Avoid Deadhead Flying；
   - Award Time Between Flights。
3. 打开 Bid Feedback。
4. 确认 Award / Avoid 列表按 selector 命中的 Pairing 展示，不受 Pairing Search 当前筛选条件影响。
5. 修改 Pairing Search 的 Base、Rank、Current Rules、Tier 条件后再次打开 Bid Feedback，确认结果不随 Pairing Search 条件变化。
6. 对同一 Pairing 同时设置 Award 和 Avoid，同 Tier 抵消时确认该 Pairing 不出现在 Award/Avoid 列表，但 A1 conflict 仍出现。

## 4. 边界数据

- 准备一个 `RES` assignment group pairing，允许没有 `pairing_segment` 行：
  - Pairing Preference 应可命中；
  - Duty / Leg 级 selector 不应命中。
- 准备一个跨 Bid Period 月末的 Pairing：
  - Award Month-End Carryover 使用配置的 `days`；
  - Avoid Month-End Carryover 只要 carry out 至少 1 day 即命中。
- 准备一个 final FLY leg 回到 base 的 Pairing：
  - Airport landing 避免把最终回 base landing 计为偏好命中；
  - 中途 landing / layover 仍应命中。
- 准备一个 Pairing 的存量 `duration_days` / `tafb` 与 scheduled start/end calendar span 不一致：
  - Pairing Length 应按 scheduled start/end 重新计算的天数。

## 5. 通过标准

- `/api/bid-feedback/current` 不调用 Pairing Search condition builder；
- Feedback 结果不会被 Crew Base / Rank / Division 或 Pairing Search UI 当前筛选窄化；
- Award eligibility 仍显示 Rule Engine unavailable；Avoid eligibility 为 `null`；
- Redeye / Efficient Flying 配置变化后，cache key 不复用旧结果；
- 接口错误仍通过现有 Bid Feedback 页面错误状态展示，不暴露 SQL、stack trace 或原始异常。
