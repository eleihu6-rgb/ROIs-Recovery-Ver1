#pragma once
#ifndef _CHECKMAXEARLYDUTYINANYCONSECUTIVEDAYRULE_H_
#define _CHECKMAXEARLYDUTYINANYCONSECUTIVEDAYRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam.h"
#include "../period/WorkPeriod.h"
#include "legacyDefine.h"

class CheckMaxEarlyDutyInAnyConsecutiveDayRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6034;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CheckMaxEarlyDutyInAnyConsecutiveDayRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxEarlyDutyInAnyConsecutiveDayRule::RuleFuncId, CheckMaxEarlyDutyInAnyConsecutiveDayRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxEarlyDutyInAnyConsecutiveDayRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool CheckHasDutyMoreThanMaxTimesInDays(vector<WORKDUTY_TIMES*> workTimes, int maxTimes, string unit, int checkRange) const;

	int GetDutyNumberInRange(time_t start, time_t end, vector<WORKDUTY_TIMES*> workTimes) const;

	std::vector<CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXEARLYDUTYINANYCONSECUTIVEDAYRULE_H_
