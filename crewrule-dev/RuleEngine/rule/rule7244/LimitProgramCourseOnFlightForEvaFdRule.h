/**
 * @file LimitProgramCourseOnFlightForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULE_H_
#define _LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitProgramCourseOnFlightForEvaFdRuleParam.h"


class LimitProgramCourseOnFlightForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7244;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitProgramCourseOnFlightForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitProgramCourseOnFlightForEvaFdRule::RuleFuncId, LimitProgramCourseOnFlightForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitProgramCourseOnFlightForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitProgramCourseOnFlightForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const std::shared_ptr<CREW>& crew, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForFootprint(const ROSTER* roster, const std::shared_ptr<TmFootprint>& cofFootprint, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForCourseCode(const ROSTER* roster, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULE_H_
