/**
 * @file LimitMaxAttributesNumberBasedMandayForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/



#ifndef _LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULE_H_
#define _LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMaxAttributesNumberBasedMandayForPRRuleParam.h"

class LimitMaxAttributesNumberBasedMandayForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7357;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMaxAttributesNumberBasedMandayForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMaxAttributesNumberBasedMandayForPRRule::RuleFuncId, LimitMaxAttributesNumberBasedMandayForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMaxAttributesNumberBasedMandayForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitMaxAttributesNumberBasedMandayForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const;

	void statStartTimeCountMap(map<time_t, std::tuple<time_t, int>>& startTimeCountMap, const map<time_t, time_t>& mpRange, const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const;
private:
	int GetAttributesCount(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const;

	void ThrowRuleViolation(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int actTotal, const LimitMaxAttributesNumberBasedMandayForPRRuleParam& ruleParam) const;

};

#endif //_LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULE_H_
