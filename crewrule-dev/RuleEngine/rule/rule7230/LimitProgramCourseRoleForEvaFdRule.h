/**
 * @file LimitProgramCourseRoleForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITPROGRAMCOURSEROLEFOREVAFDRULE_H_
#define _LIMITPROGRAMCOURSEROLEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitProgramCourseRoleForEvaFdRuleParam.h"


class LimitProgramCourseRoleForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7230;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitProgramCourseRoleForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitProgramCourseRoleForEvaFdRule::RuleFuncId, LimitProgramCourseRoleForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitProgramCourseRoleForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitProgramCourseRoleForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitProgramCourseRoleForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const ROSTER* roster, const LimitProgramCourseRoleForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITPROGRAMCOURSEROLEFOREVAFDRULE_H_
