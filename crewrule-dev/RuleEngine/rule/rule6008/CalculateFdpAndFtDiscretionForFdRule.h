/**
 * @file CalculateFdpAndFtDiscretionForFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEFDPANDFTDISCRETIONFORFDRULE_H_
#define _CALCULATEFDPANDFTDISCRETIONFORFDRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FdpAndFtDiscretionForFdRuleParam.h"


class CalculateFdpAndFtDiscretionForFdRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6008;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateFdpAndFtDiscretionForFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateFdpAndFtDiscretionForFdRule::RuleFuncId, CalculateFdpAndFtDiscretionForFdRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateFdpAndFtDiscretionForFdRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

private:

    std::vector<FdpAndFtDiscretionForFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* currDuty, vector<Duty*>& duties, const FdpAndFtDiscretionForFdRuleParam& ruleParam);

};

#endif //_CALCULATEFDPANDFTDISCRETIONFORFDRULE_H_
