/**
 * @file CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-21
**/



#ifndef _CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULE_H_
#define _CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam.h"

class CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7326;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::RuleFuncId, CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const;

private:

	//获得连续天最后一个索引
    bool GetConsecutiveDaysLastIndex(int& lastIndex, const size_t currentIndex, const std::vector<const ROSTER*>& rosters, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const;

    //判断两个ROSTER之间是否有空白天
	bool HasBlankDayInBetween(const ROSTER* prevRoster, const ROSTER* currRoster) const;

	void ThrowRuleViolationForLatestEnd(const ROSTER* roster, const time_t checkoutTimeLoc, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForEarliestStart(const ROSTER* roster, const time_t checkinTimeLoc, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const;

};

#endif //_CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULE_H_
