#pragma once
#ifndef _CALCULATEDUTYDPINMANDAYRULE_H_
#define _CALCULATEDUTYDPINMANDAYRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyBySplitDutyRuleParam.h"


class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class CalculateDutyDpInMandayRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6020;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateDutyDpInMandayRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateDutyDpInMandayRule::RuleFuncId, CalculateDutyDpInMandayRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateDutyDpInMandayRule() override = default;

	int Calculate(Duty *duty) override;

private:

	std::vector<MaxFlightDutyBySplitDutyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	int CalculateDuty(Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam);

	//获得重新计算的DP
	int GetMaxDP(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam);
};

#endif