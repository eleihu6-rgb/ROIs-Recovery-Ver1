/**
 * @file CheckUnassignedCourseForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKUNASSIGNEDCOURSEFOREVAFDRULE_H_
#define _CHECKUNASSIGNEDCOURSEFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckUnassignedCourseForEvaFdRuleParam.h"


struct RosterProgramCourse;


class CheckUnassignedCourseForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7250;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckUnassignedCourseForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckUnassignedCourseForEvaFdRule::RuleFuncId, CheckUnassignedCourseForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckUnassignedCourseForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<CheckUnassignedCourseForEvaFdRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    //assignedProgramCourse：分配的programCourse, tmProgramCourse: assignedProgramCourse前一节未分配课程
    void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& assignedProgramCourse, const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const;

private:
    //针对同一阶段phase，若某个seq课程排课，则小于该seq的课程未排课则告警
    bool CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) const;

    //针对同一阶段phase，若最大max seq课程未排课，则小于max seq未排课则告警
    bool CheckRuleOnlyMaxSeq(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) const;

};


#endif //_CHECKUNASSIGNEDCOURSEFOREVAFDRULE_H_
