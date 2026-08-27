/**
 * @file LimitCourseWeekdayFor5JRule.h
 * @brief 7388法规规则类 - Course只能安排在指定weekday
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-07
**/

#ifndef _LIMITCOURSEWEEKDAYFOR5JRULE_H_
#define _LIMITCOURSEWEEKDAYFOR5JRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CourseWeekdayFor5JRuleParam.h"

struct RosterProgramCourse;

class LimitCourseWeekdayFor5JRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7388;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseWeekdayFor5JRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseWeekdayFor5JRule::RuleFuncId, LimitCourseWeekdayFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseWeekdayFor5JRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<CourseWeekdayFor5JRuleParam> _ruleParams;

    //检查课程weekday限制
    bool CheckRule(const ROSTER* roster, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const time_t checkInLoc) const;

};

#endif //_LIMITCOURSEWEEKDAYFOR5JRULE_H_