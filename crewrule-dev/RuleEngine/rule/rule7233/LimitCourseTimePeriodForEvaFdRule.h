/**
 * @file LimitCourseTimePeriodForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSETIMEPERIODFOREVAFDRULE_H_
#define _LIMITCOURSETIMEPERIODFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseTimePeriodForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseTimePeriodForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7233;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseTimePeriodForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseTimePeriodForEvaFdRule::RuleFuncId, LimitCourseTimePeriodForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseTimePeriodForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<LimitCourseTimePeriodForEvaFdRuleParam> _ruleParams;

    //检查训练课程开始时间、时间段限制
    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const;

    /*
    * 检查训练课程开始时间、时间段限制
    * @param roster 学员或教员的roster
    * @param crew 学员或教员的crew
    * @param teProgramCourse 学员的计划课程，这里注意：若roster为教员则teProgramCourse为某个学员的计划课程（目的是为了获取上课时间，此时roster.rosterId 与 teProgramCourse.rosterid不一致）
    * @param isTrainee 是否学员
    */
    bool CheckCourseTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const bool isTrainee, const int offsetTZMinutes) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForCourseTimePeriod(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const std::shared_ptr<TmCourse>& tmCourse, const std::shared_ptr<TmProgramCoursePnr>& teProgramCoursePnr) const;

private:

    //检查训练课程时间段限制 - 开始时间和结束时间
    bool CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const;

    bool CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const;
};





#endif //_LIMITCOURSETIMEPERIODFOREVAFDRULE_H_
