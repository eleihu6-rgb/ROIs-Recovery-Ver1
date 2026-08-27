#ifndef _CHECKMAXFLIGHTTIMERULE_H_
#define _CHECKMAXFLIGHTTIMERULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyTimeRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxFlightDutyTimeRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6107;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMaxFlightDutyTimeRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxFlightDutyTimeRule::RuleFuncId, CheckMaxFlightDutyTimeRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxFlightDutyTimeRule() override = default;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<MaxFlightDutyTimeRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckMaxFlightTime(const Duty* duty, const ROSTER* roster = NULL) const;

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXFLIGHTTIMERULE_H_
