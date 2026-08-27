#ifndef _CHECKSTANDBYCALLOUTDURATIONFOR5JRULE_H_
#define _CHECKSTANDBYCALLOUTDURATIONFOR5JRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckStandbyCalloutDurationFor5JRuleParam.h"

class CheckStandbyCalloutDurationFor5JRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7387;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CheckStandbyCalloutDurationFor5JRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckStandbyCalloutDurationFor5JRule::RuleFuncId, CheckStandbyCalloutDurationFor5JRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckStandbyCalloutDurationFor5JRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<CheckStandbyCalloutDurationFor5JRuleParam> _ruleParams;

	void ParseParam(const InputType& input);
	void ThrowRuleViolation(const ROSTER* standbyRoster, const ROSTER* flyRoster, const CheckStandbyCalloutDurationFor5JRuleParam& ruleParam) const;
};

#endif //_CHECKSTANDBYCALLOUTDURATIONFOR5JRULE_H_
