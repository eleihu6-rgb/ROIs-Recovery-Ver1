/**
 * @file CheckCrewOperatingRecencyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKCREWOPERATINGRECENCYRULE_H_
#define _CHECKCREWOPERATINGRECENCYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CrewOperatingRecencyRuleParam.h"


class CheckCrewOperatingRecencyRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7016;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckCrewOperatingRecencyRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCrewOperatingRecencyRule::RuleFuncId, CheckCrewOperatingRecencyRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckCrewOperatingRecencyRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CrewOperatingRecencyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const CrewOperatingRecencyRuleParam& ruleParam) const;

	//抛出违反规则的告警(在过去X天内，无飞行任务告警)
	void ThrowLastOperatingRuleViolation(const ROSTER* roster) const;

	//抛出违反规则的告警(在过去X天内，飞行任务未执行某机型任务)
	void ThrowLastFleetRuleViolation(const ROSTER* roster) const;

	//抛出违反规则的告警(在过去X天内，飞行任务未执行某机场任务)
	void ThrowLastAirportRuleViolation(const ROSTER* roster) const;

};

#endif //_CHECKCREWOPERATINGRECENCYRULE_H_
