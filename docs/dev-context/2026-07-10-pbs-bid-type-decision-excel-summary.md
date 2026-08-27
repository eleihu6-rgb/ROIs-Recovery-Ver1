# 开发上下文（2026-07-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-10 13:44:44 CST
- Wing：`pbs`
- Topic：`bid-type-decision-excel-summary`
- Title：bid-type-decision-excel-summary
- Git branch：`main`

## 本轮对话上下文

本轮主要是 PBS bid type / NPBS 对照 / Jen feedback 的阶段性整理，没有修改产品代码或数据库。

用户先要求基于 NPBS 文档、Jen 的 bid type clarification、以及我们给 Jen 的 QA 回复，整理一份客户可读的 Excel。目标不是实现功能，而是形成讨论材料：说明“我们最初按 NPBS 做了哪些条件，对应到当前系统哪些 bid conditions；Jen 现在建议这些条件要删除、保留、改名、合并还是增强；最终 TO-BE 应该是什么样子”。

重要输入文件：
- /Users/lei/Codehub/rois-ai/init-docs/Flair_PBS_Bid_Type_Analysis_May_Jul_Aug_Dec_2025.docx
- /Users/lei/Codehub/rois-ai/init-docs/Jenife_Bidding_Type_Clarification_20260707.docx
- /Users/lei/Downloads/QA.docx

先前生成并维护过的底稿：
- /Users/lei/Downloads/npbs_bid_conditions_merged.xlsx
  - 用于 NPBS 条件与当前系统 visible bid condition 的基础对照。
  - A 列前增加了 Type/Portal Area 分组，并按 DaysOff / Pairing / Line / Reserve 分类。
  - NPBS 的 Award/Avoid 合并、Any/Every 合并在 NPBS Merge 列说明。
  - 当前系统对应条件放在同一行；多个条件用 ` / ` 分隔。
  - 空白/无对应项用灰色块帮助识别。

阶段总结 Excel：
- /Users/lei/Downloads/pbs_bid_type_decision_summary.xlsx
  - 用户后来手动删除了部分列，当前结构需要尊重，不要再用旧 builder 覆盖。
  - 当前 `Decision Summary` 只有 6 列：Portal Area, NPBS Original Condition, Current System Condition, Action, TO-BE, Jen Request / Rationale。
  - 这个文件表达完整链路：NPBS 原始条件 -> 我们系统当前对应条件 -> Action -> TO-BE -> Jen 原始意见/理由。
  - Action 包括 Keep / Enhance / Rename / Merge + Enhance / Remove / Confirm / New Target 等。
  - NPBS 原始条件必须展示出来，因为客户需要知道“我们原来按 NPBS 做了什么，现在 Jen 要怎么变更”。
  - 空白对应项要用灰色框展示，表示 NPBS 有但当前系统没有对应，或系统有但 NPBS 没对应。
  - 已隐藏但曾经对应 NPBS 的系统条件需要标注 `(currently hidden)`，例如 115 Any/Every Leg With Employee Number、120 Any Duty On Time、125 Credit Per Time Away From Base、165 Work Start Station。

英文版 Excel：
- /Users/lei/Downloads/pbs_bid_type_decision_summary_en.xlsx
  - 用户在原 Excel 上做了一部分手动修改后，要求把文档内容全改成英文，且不要覆盖他删除列/调整结构的行为。
  - 我没有重新跑旧生成脚本覆盖原文件，而是读取当前 /Users/lei/Downloads/pbs_bid_type_decision_summary.xlsx，用 openpyxl 另存为英文版。
  - 英文版保留了用户当前 workbook 的 sheet、列数、样式和合并单元格结构，只替换含中文的单元格文本。
  - 校验过 residual_count = 0，表示没有残留中文字符或中文标点。
  - 英文版保留当前结构：Decision Summary 40x6、Proposed Final List 21x4、Action Legend 8x2、NPBS Mapping Base 63x5。

Excel 支撑脚本和中间文件在：
- /tmp/rois-npbs-bid-excel/data.json
- /tmp/rois-npbs-bid-excel/system-visible.json
- /tmp/rois-npbs-bid-excel/build.mjs
- /tmp/rois-npbs-bid-excel/decision-build.mjs
注意：用户已经手动修改了 /Users/lei/Downloads/pbs_bid_type_decision_summary.xlsx，后续如果只做文案翻译/小调整，优先直接读取当前 xlsx 修改并另存，不要重新运行 decision-build.mjs 覆盖用户手动调整。

当前重要业务整理结论：
- DaysOff 方向：Prefer Off 做主入口并增强；Min Consecutive Days Off 可改名为 Long Stretch Off / Compressed Flying，但是否独立入口需确认；Max Consecutive Days On、Days Off / Days On Pattern 可由 Commuter Pattern 覆盖；Employee Schedule Preference 未在 Jen 最终两入口中出现，需要单独确认。
- Pairing 方向：Pairing Number -> Pairing Preference；Airport Preference 汇总 landing/layover/layover duration/date range/min max；Pairing Check-In / Check-Out Time 合并增强；保留 Check-In，移除 Departure Time；Flight Legs per Duty 汇总 Total Legs In Pairing / First Duty / Last Duty；Work Day Preference 取代 Any/Every Duty On Date/Day；Pairing Length 加 date range；Flight Number Preference 改名增强；Redeye 加 definition/time window/date range；Duty Duration 加 specific date/date range；Carry-Out Days 改 Month End Carryover；Any/Every Sit Length 改 Time Between Flights；Deadhead Legs/Day 合并为 Deadhead Flying。
- Pairing 待确认/移除：Pairing Total Credit 需确认 remove 还是并入 Efficient Flying；Average Daily Credit / Average Daily Block / Pairing Total Block 倾向并入 Efficient Flying，但 127 仍需确认；TAFB 移除；Enroute Check-In/Out 移除；Any/Every Leg With Employee Number 因 HR/privacy/consent 移除；Work Start Station 移除；Any Duty On Time 移除；Credit Per Time Away From Base 移除并入 efficient flying 概念。
- Line 方向：Min/Max Credit Window 合并为 Credit Preference；Clear Schedule and Start Next Bid Group、No Same Day Pairings、Waive No Same Day Duty Starts、Forget Line 移除；Min Base Layover 保留并加系统最小值限制；Commuter Pattern 保留并加 legality/math feasible limits；Most Flying In Least Working Days 改 Efficient Flying；Reserve/Flying Date Pattern 改 Mixed Block Pattern；Reserve 调整为 avoid-reserve-only 需最终确认。
- Reserve 方向：Reserve Preference 作为整合入口，覆盖 dates、date ranges、short call type、half-month，细节还需 Jen 建议。

新的 AGENTS.md 规则已由用户在会话中贴出并声明替换旧规则。重点：代码/行为变更必须先 requirement confirmation 和 brainstorming；本轮主要是 Excel/文档整理，属于机械文档处理，不涉及产品行为变更。后续如果进入实现 PBS bid type 改动，必须先写 spec 并等用户确认。

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
2. 本文件：`docs/dev-context/2026-07-10-pbs-bid-type-decision-excel-summary.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
