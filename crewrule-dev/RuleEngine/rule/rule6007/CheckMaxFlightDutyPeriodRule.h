#ifndef _CHECKMAXFLIGHTDUTYPERIODRULE_H_
#define _CHECKMAXFLIGHTDUTYPERIODRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyPeriodRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxFlightDutyPeriodRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6007;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty| RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMaxFlightDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxFlightDutyPeriodRule::RuleFuncId, CheckMaxFlightDutyPeriodRule::AvailableInterface){
		ParseParam(input);
	}
	~CheckMaxFlightDutyPeriodRule() override = default;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<MaxFlightDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckAcclimatizeDuty(const Duty* duty, const ROSTER* roster = NULL) const;

	bool CheckUnkownDuty(const Duty* duty, const ROSTER* roster = NULL) const;

	int GetDutyLandingNumber(const Duty* duty, std::vector<std::string> landingAssignments) const;

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXCONSECUTIVEDAYRULE_H_
