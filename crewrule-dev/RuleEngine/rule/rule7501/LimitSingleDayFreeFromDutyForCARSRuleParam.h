/**
 * @file LimitSingleDayFreeFromDutyForCARSRuleParam.h
 * @brief 法规 7501 参数模型（Table 行：PERIOD / UNIT / MIN LIMITS / DUTY END BUFFER 等）。
 *
 * 典型配置：
 * - 168 RH, MIN LIMITS=1  — 任意 168 小时滚动窗口内至少 1 个 SDFD
 * - 672 RH, MIN LIMITS=4  — 任意 672 小时滚动窗口内至少 4 个 SDFD
 */

#ifndef _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULEPARAM_H_
#define _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class LimitSingleDayFreeFromDutyForCARSRule;

class LimitSingleDayFreeFromDutyForCARSRuleParam : public RuleParam {
    friend class LimitSingleDayFreeFromDutyForCARSRule;

private:
    explicit LimitSingleDayFreeFromDutyForCARSRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7501;

    /**
     * @brief 从逗号分隔测试字符串解析参数（单测 / RuleTool 用）。
     *
     * 字段顺序：BASES,RANKS,FLEETS,TEAMS,PERIOD,UNIT,DUTY END BUFFER,MIN LIMITS,SEVERITY
     */
    void ParseParam(const std::string& paramString);

    /**
     * @brief 从 DBRule.params 键值对解析参数（生产库 / ro_input 用）。
     *
     * 识别键：BASES, RANKS, FLEETS, TEAMS, PERIOD, UNIT, DUTY END BUFFER, MIN LIMITS, SEVERITY
     */
    void ParseParam(const DBRule& dbRule);

    /**
     * @brief 判断组员在检查时间段内是否匹配本参数行的适用范围。
     *
     * 通过 Utility::isCrewQualified 匹配 BASE/RANK/FLEET/TEAM；未配置或 * 表示全匹配。
     *
     * @param crew             待检查组员
     * @param checkedStartTime 法规检查起点 UTC
     * @param checkedEndTime   法规检查终点 UTC
     * @return true 本行参数适用于该组员
     */
    bool MatchCrewQualification(const SharedPtr<CREW>& crew,
                                const time_t& checkedStartTime,
                                const time_t& checkedEndTime) const;

    std::vector<std::string> _bases{};
    std::vector<std::string> _ranks{};
    std::vector<std::string> _fleets{};
    std::vector<std::string> _teams{};

    int _period{};                       ///< 滚动窗口长度（与 _unit 配合，RH 时为小时数）
    std::string _unit{};                 ///< 窗口单位：RH=滚动小时（已实现）；CD=日历天（当前跳过）
    std::string _dutyEndBuffer;          ///< Duty 结束后计入休息前的缓冲，如 "00:30"
    int _dutyEndBufferMinutes = 0;       ///< _dutyEndBuffer 转分钟，用于 True Rest 裁剪
    int _minLimits = 1;                  ///< 窗口内要求的最少完全包含 SDFD 数量
};

#endif  // _LIMITSINGLEDAYFREEFROMDUTYFORCARSRULEPARAM_H_
