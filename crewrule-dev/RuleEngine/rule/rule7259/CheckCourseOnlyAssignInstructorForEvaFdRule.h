/**
 * @file CheckCourseOnlyAssignInstructorForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKCOURSEONLYASSIGNINSTRUCTORFOREVAFDRULE_H_
#define _CHECKCOURSEONLYASSIGNINSTRUCTORFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckCourseOnlyAssignInstructorForEvaFdRuleParam.h"



class CheckCourseOnlyAssignInstructorForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7259;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckCourseOnlyAssignInstructorForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCourseOnlyAssignInstructorForEvaFdRule::RuleFuncId, CheckCourseOnlyAssignInstructorForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckCourseOnlyAssignInstructorForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckCourseOnlyAssignInstructorForEvaFdRuleParam> _ruleParams;

    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster, const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor) const;

};


#endif //_CHECKCOURSEONLYASSIGNINSTRUCTORFOREVAFDRULE_H_
