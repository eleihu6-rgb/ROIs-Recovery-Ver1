/**
 * @file LimitTrainingRoleInTeamForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITTRAININGROLEINTEAMFOREVAFDRULE_H_
#define _LIMITTRAININGROLEINTEAMFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitTrainingRoleInTeamForEvaFdRuleParam.h"


class LimitTrainingRoleInTeamForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7245;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitTrainingRoleInTeamForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitTrainingRoleInTeamForEvaFdRule::RuleFuncId, LimitTrainingRoleInTeamForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitTrainingRoleInTeamForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitTrainingRoleInTeamForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const std::shared_ptr<CREW>& crew, const LimitTrainingRoleInTeamForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const ROSTER* roster, const LimitTrainingRoleInTeamForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITTRAININGROLEINTEAMFOREVAFDRULE_H_
