#pragma once
#ifndef _CALCULATEDUTYALOFTINMANDAYFORPRRULE_H_
#define _CALCULATEDUTYALOFTINMANDAYFORPRRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateDutyAloftInMandayForPRRuleParam.h"

class CalculateDutyAloftInMandayForPRRule : public CalculateRule<map<time_t, int>> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7310;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateDutyAloftInMandayForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateDutyAloftInMandayForPRRule::RuleFuncId, CalculateDutyAloftInMandayForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateDutyAloftInMandayForPRRule() override = default;

	//返回值：计算manday的Duty Aloft(机组在飞机上时间), map<localDay, 机组在飞机上时间(Duty Aloft)(分钟数)>
	map<time_t, int> Calculate(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<CalculateDutyAloftInMandayForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

};

#endif //_CALCULATEDUTYALOFTINMANDAYFORPRRULE_H_