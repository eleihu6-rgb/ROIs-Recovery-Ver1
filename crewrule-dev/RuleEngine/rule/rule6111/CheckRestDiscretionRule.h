/**
 * @file CheckRestDiscretionRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKRESTDISCRETIONRULE_H_
#define _CHECKRESTDISCRETIONRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestDiscretionRuleParam.h"


class CheckRestDiscretionRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6111;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckRestDiscretionRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckRestDiscretionRule::RuleFuncId, CheckRestDiscretionRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckRestDiscretionRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<RestDiscretionRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(bool& next, const Duty* currDuty, const Duty* nextDuty, const RestDiscretionRuleParam& ruleParam, const std::string& base) const;

	//抛出违反Rest Discretio转规则的告警
	void ThrowRestDiscretioRuleViolation(const Duty* duty) const;

};

#endif //_CHECKRESTDISCRETIONRULE_H_
