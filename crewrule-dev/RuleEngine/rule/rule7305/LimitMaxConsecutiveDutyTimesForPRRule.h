/**
 * @file LimitMaxConsecutiveDutyTimesForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-07
**/



#ifndef _LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULE_H_
#define _LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMaxConsecutiveDutyTimesForPRRuleParam.h"


class LimitMaxConsecutiveDutyTimesForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7305;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMaxConsecutiveDutyTimesForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMaxConsecutiveDutyTimesForPRRule::RuleFuncId, LimitMaxConsecutiveDutyTimesForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMaxConsecutiveDutyTimesForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitMaxConsecutiveDutyTimesForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const;

	int GetConsecutiveTimesOrDaysWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster, const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const;
private:


	void ThrowRuleViolation(const ROSTER* roster, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc, const int numberOfRoster,const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const;

};

#endif //_LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULE_H_
