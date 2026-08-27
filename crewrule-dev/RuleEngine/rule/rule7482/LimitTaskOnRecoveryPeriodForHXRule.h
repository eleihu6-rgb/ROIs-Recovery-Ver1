/**
 * 在适应状态恢复期内限制任务安排规则（针对HX）
 * @file LimitTaskOnRecoveryPeriodForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-07
**/



#ifndef _LIMITTASKONRECOVERYPERIODFORHXRULE_H_
#define _LIMITTASKONRECOVERYPERIODFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "AcclimatizationForHXRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class BaseActivityPeriod;

class LimitTaskOnRecoveryPeriodForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7482;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitTaskOnRecoveryPeriodForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitTaskOnRecoveryPeriodForHXRule::RuleFuncId, LimitTaskOnRecoveryPeriodForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitTaskOnRecoveryPeriodForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<AcclimatizationForHXRuleParam> _ruleParams;

	AnrDayOffDefinition _dayOffDefinition;

	void ParseParam(const InputType& input);

private:

	void ThrowRuleViolation(const shared_ptr<BaseActivityPeriod>& activityPeriod) const;

};

#endif //_LIMITTASKONRECOVERYPERIODFORHXRULE_H_
