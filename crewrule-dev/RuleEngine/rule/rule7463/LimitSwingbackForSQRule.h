/**
 * @file LimitSwingbackForSQRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-16
**/

#ifndef _LIMITSWINGBACKFORSQRULE_H_
#define _LIMITSWINGBACKFORSQRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitSwingbackForSQRuleParam.h"


class LimitSwingbackForSQRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7463;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitSwingbackForSQRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitSwingbackForSQRule::RuleFuncId, LimitSwingbackForSQRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitSwingbackForSQRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitSwingbackForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	//检查Swingback
	bool CheckRule(const vector<Duty*>& duties, const LimitSwingbackForSQRuleParam& ruleParam) const;

	//抛出违反Swingback的告警
	void ThrowRuleViolation(const int swingbackCount, const Duty* firstDuty, const Duty* lastDuty, const LimitSwingbackForSQRuleParam& ruleParam) const;

};

#endif //_LIMITSWINGBACKFORSQRULE_H_
