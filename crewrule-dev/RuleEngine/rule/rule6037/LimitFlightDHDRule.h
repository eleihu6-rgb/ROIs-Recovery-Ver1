/**
 * @file LimitFlightDHDRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITFLIGHTDHDRULE_H_
#define _LIMITFLIGHTDHDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitFlightDHDRuleParam.h"


class LimitFlightDHDRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6037;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitFlightDHDRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitFlightDHDRule::RuleFuncId, LimitFlightDHDRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitFlightDHDRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitFlightDHDRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(bool& next, const Duty *duty, const std::string& base, const LimitFlightDHDRuleParam& ruleParam) const;

	void ThrowNotAllowedRuleViolation(const Duty* duty, const Segment* segment) const;

	void ThrowMustDHDRuleViolation(const Duty* duty, const Segment* segment) const;

};

#endif //_LIMITFLIGHTDHDRULE_H_
