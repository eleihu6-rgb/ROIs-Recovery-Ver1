/**
 * @file CheckMaxDutyPeriodRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXDUTYPERIODRULE_H_
#define _CHECKMAXDUTYPERIODRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMaxDutyPeriodRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class CheckMaxDutyPeriodRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6025;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxDutyPeriodRule::RuleFuncId, CheckMaxDutyPeriodRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxDutyPeriodRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;
private:

	std::vector<LimitMaxDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//检查地面任务
	bool CheckRule(const ROSTER* roster, const std::string& base) const;

	//检查地面任务
	bool CheckRule(const ROSTER* roster, const std::string& base, const LimitMaxDutyPeriodRuleParam& ruleParam) const;

	bool CheckRule(const vector<Duty*>& duties, const ROSTER* roster) const;

	bool CheckRule(const Duty* duty, const std::string& base, const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const;

	void ThrowRuleViolationForDP(const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const;

	void ThrowRuleViolationForDuration(const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const;

	void ThrowRuleViolationForDuration(const Duty* duty, const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const;

};




#endif //_CHECKMAXDUTYPERIODRULE_H_
