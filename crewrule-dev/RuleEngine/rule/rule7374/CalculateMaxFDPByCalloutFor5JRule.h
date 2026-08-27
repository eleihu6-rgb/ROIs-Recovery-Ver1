/**
 * @file CalculateMaxFDPByCalloutFor5JRule.h
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-28
**/

#ifndef _CALCULATEMAXFDPBYCALLOUTFOR5JRULE_H_
#define _CALCULATEMAXFDPBYCALLOUTFOR5JRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFDPByCalloutFor5JRuleParam.h"

class CalculateMaxFDPByCalloutFor5JRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7374;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateMaxFDPByCalloutFor5JRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFDPByCalloutFor5JRule::RuleFuncId, CalculateMaxFDPByCalloutFor5JRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxFDPByCalloutFor5JRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<MaxFDPByCalloutFor5JRuleParam> _ruleParams;

	void ParseParam(const InputType& input);
	void CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster);
	bool CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const MaxFDPByCalloutFor5JRuleParam& ruleParam);

	static int CalculateIgnoredMinutes(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFDPByCalloutFor5JRuleParam& ruleParam);
	static int CalculateDeductionMinutes(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFDPByCalloutFor5JRuleParam& ruleParam);
};

#endif //_CALCULATEMAXFDPBYCALLOUTFOR5JRULE_H_
