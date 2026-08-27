#ifndef _CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULE_H_
#define _CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxDurationFromStandbyToFlightDutyEndForHXRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7487;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CheckMaxDurationFromStandbyToFlightDutyEndForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxDurationFromStandbyToFlightDutyEndForHXRule::RuleFuncId, CheckMaxDurationFromStandbyToFlightDutyEndForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxDurationFromStandbyToFlightDutyEndForHXRule() override = default;


	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation(const ROSTER* roster) const;
};




#endif //_CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULE_H_
