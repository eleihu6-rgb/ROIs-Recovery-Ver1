/**
 * @file CheckConsecutiveDaysOffRequirementFor5JRuleParam.h
 * @brief Rule 7366 - Parameter definitions for consecutive days off rule
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-04-16
**/

#pragma once
#ifndef _CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULEPARAM_H_
#define _CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <vector>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckConsecutiveDaysOffRequirementFor5JRule;

class CheckConsecutiveDaysOffRequirementFor5JRuleParam : public RuleParam {
    friend class CheckConsecutiveDaysOffRequirementFor5JRule;
private:
    explicit CheckConsecutiveDaysOffRequirementFor5JRuleParam(const Rule* rule) : RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7366;

    // 所属基地,多个值使用"|"分隔并支持*通配
    std::vector<std::string> _bases{};
    // 人员级别,多个值使用"|"分隔并支持*通配
    std::vector<std::string> _ranks{};
    // 人员机型,多个值使用"|"分隔并支持*通配
    std::vector<std::string> _fleets{};

    // 篩選参数 - Days Off Assignment Groups: DO的Assignment Group列表，支持 * 和 | 分开多个设置
    std::vector<std::string> _daysOffAssignmentGroups{};
    AssignmentGroupMatchExpression<Activity> _daysOffAssignmentGroupsMatch;

    // 篩選参数 - Days Off Assignments: DO的Assignment列表，支持 * 和 | 分开多个设置
    std::vector<std::string> _daysOffAssignments{};
    AssignmentMatchExpression<Activity> _daysOffAssignmentsMatch;

    // 验证参数 - Number of Sets: 区间内要几组连续休假，格式：整数，默认为1，不可为0
    int _numberOfSets{1};

    // 验证参数 - Number of Consecutive Off: 连续休假日数，格式：整数，默认为1，不可为0
    int _numberOfConsecutiveOff{1};

    // 验证参数 - Can Sets Combined: Y/N，连续休假组数能否合并
    bool _canSetsCombined{false};

    // 验证参数 - Check Period: 检查的区间，格式：整数，默认为1，不可为0
    int _checkPeriod{1};

    // 验证参数 - Check Period Mode: CW/CM/RD, calendar week/calendar month/rolling days，默认为CM
    std::string _checkPeriodMode{"CM"};

    // 验证参数 - Include Blank Day: Y/N，是否包括空白天
    bool _includeBlankDay{true};

    // 验证参数 - Include Layover Rest: Y/N，是否包括Layover Rest
    bool _includeLayoverRest{true};

    // 验证参数 - Include Pairing Base Rest: Y/N，是否包括Pairing在基地的Rest
    bool _includePairingBaseRest{true};

    void ParseParam(const DBRule& dbRule);

    // 判断机组人员是否满足资质
    bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

    // 判断roster是否匹配Days Off Assignment Group
    bool MatchDaysOffAssignmentGroup(const ROSTER* roster) const;

    // 判断roster是否匹配Days Off Assignment
    bool MatchDaysOffAssignment(const ROSTER* roster) const;
};

#endif //_CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULEPARAM_H_
