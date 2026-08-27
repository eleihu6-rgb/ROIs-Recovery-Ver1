#pragma once
#ifndef _CHECKSINGLEDUTYPERDAYRULE_H_
#define _CHECKSINGLEDUTYPERDAYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckSingleDutyPerDayRuleParam.h"

class CheckSingleDutyPerDayRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7009;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckSingleDutyPerDayRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSingleDutyPerDayRule::RuleFuncId, CheckSingleDutyPerDayRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckSingleDutyPerDayRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const std::vector<Duty*>& duties) const;

private:

	std::vector<CheckSingleDutyPerDayRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation(const CheckSingleDutyPerDayRuleParam& ruleParam) const;

	bool CheckRosterLevel(const ROSTER* prevRoster, const ROSTER* nextRoster, const CheckSingleDutyPerDayRuleParam& ruleParam) const;

	bool CheckDutyLevel(const Duty* prevDuty, const Duty* nextDuty, const CheckSingleDutyPerDayRuleParam& ruleParam, const std::string& base) const;

	bool CheckSegmentLevel(const Segment* prevSeg, const Segment* nextSeg, const CheckSingleDutyPerDayRuleParam& ruleParam, const std::string& base) const;

	bool IgnoreCheck(const time_t prevRosterCheckTime, const CheckSingleDutyPerDayRuleParam& ruleParam) const;
};

#endif //_CHECKSINGLEDUTYPERDAYRULE_H_
