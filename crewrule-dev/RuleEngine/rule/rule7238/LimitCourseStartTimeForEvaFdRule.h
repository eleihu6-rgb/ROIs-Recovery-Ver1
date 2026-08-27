/**
 * @file LimitCourseStartTimeForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSESTARTTIMEFOREVAFDRULE_H_
#define _LIMITCOURSESTARTTIMEFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseStartTimeForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseStartTimeForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7238;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseStartTimeForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseStartTimeForEvaFdRule::RuleFuncId, LimitCourseStartTimeForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseStartTimeForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<LimitCourseStartTimeForEvaFdRuleParam> _ruleParams;

    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    //检查训练课程开始时间、时间段限制
    bool CheckCourseStartTime(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    /*
    * 检查训练课程开始时间、时间段限制
    * @param roster 学员或教员的roster
    * @param crew 学员或教员的crew
    * @param teProgramCourse 学员的计划课程，这里注意：若roster为教员则teProgramCourse为某个学员的计划课程（目的是为了获取上课时间，此时roster.rosterId 与 teProgramCourse.rosterid不一致）
    * @param isTrainee 是否学员
    */
    bool CheckCourseStartTime(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const bool isTrainee) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForCourseStartTime(const ROSTER* roster) const;

private:

    //检查训练课程开始时间限制
    bool CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr) const;

    bool CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const;

};


#endif //_LIMITCOURSESTARTTIMEFOREVAFDRULE_H_
