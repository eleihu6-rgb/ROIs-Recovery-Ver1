/**
 * @file CheckRestForLateArrivalOrEarlyStartRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKRESTFORLATEARRIVALOREARLYSTARTRULE_H_
#define _CHECKRESTFORLATEARRIVALOREARLYSTARTRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestForLateArrivalOrEarlyStartRuleParam.h"


class CheckRestForLateArrivalOrEarlyStartRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7015;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckRestForLateArrivalOrEarlyStartRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckRestForLateArrivalOrEarlyStartRule::RuleFuncId, CheckRestForLateArrivalOrEarlyStartRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckRestForLateArrivalOrEarlyStartRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<RestForLateArrivalOrEarlyStartRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* currRoster, const ROSTER* nextRoster, const RestForLateArrivalOrEarlyStartRuleParam& ruleParam) const;

	//抛出违反规则的告警
	void ThrowMinGapBetweenRostersRuleViolation(const ROSTER* currRoster, const ROSTER* nextRoster) const;
	void ThrowNextRosterShouldNotBeforeTimeRuleViolation(const ROSTER* currRoster, const ROSTER* nextRoster) const;

};

#endif //_CHECKRESTFORLATEARRIVALOREARLYSTARTRULE_H_
