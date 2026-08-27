#pragma once
#ifndef _CALCULATEINEXPERIENCEDCREWFOR5JRULE_H_
#define _CALCULATEINEXPERIENCEDCREWFOR5JRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateInexperiencedCrewFor5JRuleParam.h"

class CalculateInexperiencedCrewFor5JRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7363;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateInexperiencedCrewFor5JRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateInexperiencedCrewFor5JRule::RuleFuncId, CalculateInexperiencedCrewFor5JRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateInexperiencedCrewFor5JRule() override = default;

	void Calculate(std::vector<const ROSTER*>& rosters, string crewId) const;

private:
	std::vector<CalculateInexperiencedCrewFor5JRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

};

#endif //_CALCULATEINEXPERIENCEDCREWFOR5JRULE_H_