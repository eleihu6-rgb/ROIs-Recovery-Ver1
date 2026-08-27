# 开发上下文（2026-06-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-11 15:21:22 CST
- Wing：`pbs`
- Topic：`pairing-calendar-and-search-business-context`
- Title：pairing-calendar-and-search-business-context
- Git branch：`main`

## 本轮对话上下文

本轮 PBS 业务上下文汇总，供新窗口恢复时使用。

核心业务结论：
1. Pairing Search 结果卡片
- /fpqe/pbs/pairing/search 展示任务环 pairing。
- 卡片增加 duty-level KPI：FDP、F/H、D/H、CRD；用户要求缩写使用 FDP、F/H、D/H、CRD。
- 之前提到 DH 不要展示，后续改成 D/H 这个展示口径；不要保留看似兼容但实际语义不清的旧字段。
- Duty 日期需要显示月日，时间用 HHMM 口径。
- 结果卡片的 REPORT / DATE / DEP / ARR 按 pairing base 时区展示。
- 右侧 mini calendar 按 duty 在 pairing base 时区下的覆盖日期点亮，不再按 pairing duration_days 简单点亮。
- 数据库存 UTC，前端/后端展示逻辑要明确转换到业务 base 时区，避免浏览器本机时区参与业务判断。

2. Pairing duty 与 pairing 时间关系
- duty brief/report 可能早于第一段航班起飞，因为 duty 包含 brief/report，不只包含 flight leg。
- 如果数据库统一 UTC，展示统一转 base，则 UTC 与 UTC 比、base 与 base 比，逻辑不会混乱。
- 用户确认：右侧日历点亮应按 duty 日期，而不是 pairing duration_days。

3. 左侧 BIDDING CALENDAR 点击日期搜索 Pairing occurrence
- 用户点击左侧日历日期时，业务含义是“当前登录人的 base-local 日期”。
- 前端仍只传 originDate 和 periodCode，不传 base/zone。
- 后端 /pairing-search/pairing-occurrences/by-date 使用当前 actor 的 crewId/userCode 查 pbs_user.base，再查 live airport.zone_id，把 pairing start_utc/end_utc 转到登录人 base zone 后筛选。
- pbs_user.base 缺失时 fallback live crew_base 当前主基地；zone_id 缺失或无效时 fallback UTC。
- 这条链路已实施并验证：pbs-server 聚焦测试、npm run build、npm test 通过。

4. 左侧 BIDDING CALENDAR 新增 Days Off / Pairing 的 tier 默认选择
- Days Off 已确认：没有已有记录的日期，打开弹窗时不默认选择任何 tier；已有记录则显示已有 tier。
- Pairing 新增日期入口之前仍按当前 active tier 默认勾选，例如 T1 -> T1-T7、T4 -> T4-T7。
- 客户不喜欢这个默认行为，要求 Pairing 也和 Days Off 一样：新增时默认不选 tier，让用户自己勾选。
- 已实施：pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx 中新增 Pairing pending action 的 selectedTiers 改为 []。
- 已有 Pairing bid 的详情/编辑仍从 draft property active tiers 初始化，继续显示已有 tier，不受影响。
- 已补测试 shared-bidding-workbench-layout.test.tsx：active T3 时新增 Pairing 不默认勾选任何 tier，用户手动选 T3/T7 才保存。
- 已补 QA 文档：docs/test-cases/pbs/pairing-calendar/2026-06-11-pairing-calendar-no-default-tier-selection.md。

当前已写文档：
- docs/superpowers/specs/2026-06-11-pbs-pairing-calendar-click-base-date-search-design.md
- docs/superpowers/specs/2026-06-11-pbs-pairing-calendar-no-default-tier-selection-design.md
- docs/test-cases/pbs/pairing-calendar/2026-06-11-calendar-click-base-date-search.md
- docs/test-cases/pbs/pairing-calendar/2026-06-11-pairing-calendar-no-default-tier-selection.md
- docs/dev-context/2026-06-11-pbs-pairing-calendar-base-date-search.md
- docs/dev-context/2026-06-11-pbs-pairing-calendar-no-default-tier-selection.md

验证状态：
- pbs-server npm test：通过。
- pbs-server npm run build：通过。
- pbs-portal npm test -- src/app/layout/shared-bidding-workbench-layout.test.tsx：通过，33 tests。
- pbs-portal npm run lint：通过，仅既有 Fast Refresh warnings。
- pbs-portal npm run build：通过，仅既有 chunk size warning。
- pbs-portal npm test 全量仍有既有 rule-bids 失败，失败点是 action: null 字段断言不匹配；与 Pairing calendar 本轮改动无关。
- git diff --check：通过。

注意事项：
- 当前工作树仍有未提交改动和新增文档，新窗口不要 revert。
- 用户偏好：不要保留“兼容但语义不清”的旧字段或旧契约；要么对，要么错，错了再修。
- 新窗口继续时先读 NEXT_CONTEXT.md，再读 docs/dev-context/LATEST.md。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-11-pbs-pairing-calendar-and-search-business-context.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
