/**
 * @file CalculateFdpAndFtDiscretionForCCRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEFDPANDFTDISCRETIONFORCCRULE_H_
#define _CALCULATEFDPANDFTDISCRETIONFORCCRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FdpAndFtDiscretionForCCRuleParam.h"


class CalculateFdpAndFtDiscretionForCCRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6009;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateFdpAndFtDiscretionForCCRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateFdpAndFtDiscretionForCCRule::RuleFuncId, CalculateFdpAndFtDiscretionForCCRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateFdpAndFtDiscretionForCCRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

private:

    std::vector<FdpAndFtDiscretionForCCRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* prevDuty, Duty* currDuty, const FdpAndFtDiscretionForCCRuleParam& ruleParam);

};

#endif //_CALCULATEFDPANDFTDISCRETIONFORCCRULE_H_
