/**
 * @file CheckFdpAndFtDiscretionForFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKFDPANDFTDISCRETIONFORFDRULE_H_
#define _CHECKFDPANDFTDISCRETIONFORFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FdpAndFtDiscretionForFdRuleParam.h"


class CheckFdpAndFtDiscretionForFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6008;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckFdpAndFtDiscretionForFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckFdpAndFtDiscretionForFdRule::RuleFuncId, CheckFdpAndFtDiscretionForFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckFdpAndFtDiscretionForFdRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<FdpAndFtDiscretionForFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(bool& next, const Duty* currDuty, const vector<Duty*>& duties, const FdpAndFtDiscretionForFdRuleParam& ruleParam) const;

	//抛出违反FDP Discretio转规则的告警
	void ThrowFdpDiscretioRuleViolation(const Duty* duty) const;

	//抛出违反FT Discretio转规则的告警
	void ThrowFtDiscretioRuleViolation(const Duty* duty) const;

	//抛出违反DP Discretio转规则的告警
	void ThrowDPDiscretioRuleViolation(const Duty* duty) const;

};

#endif //_CHECKFDPANDFTDISCRETIONFORFDRULE_H_
