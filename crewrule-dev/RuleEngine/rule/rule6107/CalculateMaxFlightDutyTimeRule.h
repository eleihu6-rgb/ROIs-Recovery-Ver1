#ifndef _CALCULATEMAXFLIGHTDUTYTIMERULE_H_
#define _CALCULATEMAXFLIGHTDUTYTIMERULE_H_

#include <string>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyTimeRuleParam.h"
#include "../period/WorkPeriod.h"

class CalculateMaxFlightDutyTimeRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6107;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateMaxFlightDutyTimeRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFlightDutyTimeRule::RuleFuncId, CalculateMaxFlightDutyTimeRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMaxFlightDutyTimeRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<MaxFlightDutyTimeRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateFlightTime(Duty* duty, const ROSTER* roster = NULL);
};




#endif //_CALCULATEMAXFLIGHTDUTYTIMERULE_H_
