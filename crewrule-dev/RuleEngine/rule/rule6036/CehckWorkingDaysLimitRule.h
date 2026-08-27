#pragma once

#ifndef _CEHCKWORKINGDAYSLIMITRULE_H_
#define _CEHCKWORKINGDAYSLIMITRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CehckWorkingDaysLimitRuleParam.h"
#include "../period/WorkPeriod.h"

class CehckWorkingDaysLimitRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6036;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CehckWorkingDaysLimitRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CehckWorkingDaysLimitRule::RuleFuncId, CehckWorkingDaysLimitRule::AvailableInterface) {
		ParseParam(input);
	}
	~CehckWorkingDaysLimitRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CehckWorkingDaysLimitRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXCONSECUTIVENIGHTSAWAYFROMBASERULE_H_
