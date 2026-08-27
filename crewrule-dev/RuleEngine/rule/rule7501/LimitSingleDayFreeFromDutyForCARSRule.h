/**
 * @file LimitSingleDayFreeFromDutyForCARSRule.h
 * @brief 法规 7501 — CARS 滚动小时窗口内最少 Single Day Free from Duty (SDFD) 检查。
 *
 * 法规问题：在任意长度为 PERIOD 小时的滚动窗口内，组员是否拥有不少于 MIN LIMITS 个
 * 完全包含于该窗口的 SDFD。
 *
 * 实现分三阶段：
 * 1. BuildTrueRestPeriods   — 从 WorkPeriod 提取 True Rest（含 duty-end buffer）
 * 2. BuildValidSdfdList     — 从 True Rest 裁剪合法 SDFD（连续 Local Night + 最小休息）
 * 3. CheckSweepRollingWindows — 事件扫描滑窗，O(N log N) 校验全部候选窗口起点
 *
 * 当前仅实现 UNIT=RH（Rolling Hours）；UNIT=CD 参数会被跳过。
 */

#ifndef _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULE_H_
#define _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULE_H_

#include <memory>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../framework/period/WorkPeriod.h"
#include "LimitSingleDayFreeFromDutyForCARSRuleParam.h"

class LimitSingleDayFreeFromDutyForCARSRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7501;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    /**
     * @brief 构造 7501 规则实例，并从 RuleInput 解析全部参数行（168 RH/1、672 RH/4 等）。
     */
    explicit LimitSingleDayFreeFromDutyForCARSRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, LimitSingleDayFreeFromDutyForCARSRule::RuleFuncId,
                    LimitSingleDayFreeFromDutyForCARSRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitSingleDayFreeFromDutyForCARSRule() override = default;

    /**
     * @brief 7501 规则主入口：对组员全部 roster 执行滚动 SDFD 检查。
     *
     * 流程：
     * - 按应用模式确定 checkedStart/checkedEnd（OPTIMIZER 用场景边界，否则用 roster 起止）
     * - 将 roster 转为 WorkPeriod 列表
     * - 逐条匹配参数（BASE/RANK/FLEET/TEAM）并调用 CheckRollingRequirement
     *
     * @param rosters 待检查组员的 roster 列表（按时间排序）
     * @return true 全部参数行通过；false 至少一行违规（编辑器模式下可能仍继续检查其余行）
     */
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    std::vector<LimitSingleDayFreeFromDutyForCARSRuleParam> _ruleParams;

    /**
     * @brief 从 RuleInput 加载参数：优先 dbRules，否则 fallback 到 ruleParamString（测试用）。
     */
    void ParseParam(const InputType& input);

    /**
     * @brief 对单条参数行（如 168 RH min=1）执行完整三阶段 SDFD 滚动检查。
     *
     * 仅 UNIT=RH 且 period/minLimits 有效时执行；否则直接返回 true。
     * 扫描区间：[checkedStart - period, min(checkedEnd, lastDutyEnd + period)]。
     *
     * @param ruleParam       参数行（period、unit、minLimits、dutyEndBuffer 等）
     * @param workPeriods     组员全部 WorkPeriod（duty/ground 等）
     * @param rosters         组员 roster 列表（ROSTER_OPTIMIZER 下用于 PA/CR 来源判断）
     * @param checkedStartUtc 法规检查起点（roster 或场景边界，整点舍入）
     * @param checkedEndUtc   法规检查终点（末 roster restStrUtc 或场景边界）
     * @return true 所有合法滚动窗口内 SDFD 数 >= minLimits；false 存在违规窗口
     */
    bool CheckRollingRequirement(const LimitSingleDayFreeFromDutyForCARSRuleParam& ruleParam,
                                 const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
                                 const std::vector<const ROSTER*>& rosters,
                                 time_t checkedStartUtc,
                                 time_t checkedEndUtc) const;

    /**
     * @brief 写入 CREW 级违规：设置 legalMessage、RULE_VIOLATION 及 operation_result 明细。
     *
     * 违规窗口为 sweep 找到的最差窗口（SDFD 数最少）；type=CREW_VIOLATION，rosterId=-1。
     *
     * @param ruleParam      触发的参数行
     * @param windowStartUtc 违规滚动窗口起点（UTC）
     * @param windowEndUtc   违规滚动窗口终点（UTC）= 起点 + period 小时
     * @param totalSdfd      该窗口内完全包含的 SDFD 数量
     */
    void ThrowRuleViolation(const LimitSingleDayFreeFromDutyForCARSRuleParam& ruleParam,
                            time_t windowStartUtc,
                            time_t windowEndUtc,
                            int totalSdfd) const;
};

#endif  // _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULE_H_
