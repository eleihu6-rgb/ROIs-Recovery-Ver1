/**
 * @file CalculateGroundRosterMinRestFor5JRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-18
**/


#ifndef _CALCULATEGROUNDROSTERMINRESTFOR5JRULE_H_
#define _CALCULATEGROUNDROSTERMINRESTFOR5JRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "GroundRosterMinRestFor5JRuleParam.h"

class CalculateGroundRosterMinRestFor5JRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7373;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CalculateGroundRosterMinRestFor5JRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateGroundRosterMinRestFor5JRule::RuleFuncId, CalculateGroundRosterMinRestFor5JRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateGroundRosterMinRestFor5JRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<GroundRosterMinRestFor5JRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(ROSTER* roster);
};

#endif //_CALCULATEGROUNDROSTERMINRESTFOR5JRULE_H_