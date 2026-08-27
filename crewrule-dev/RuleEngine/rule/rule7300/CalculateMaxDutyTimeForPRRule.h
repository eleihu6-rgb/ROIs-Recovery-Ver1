/**
 * @file CalculateMaxDutyTimeForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-10
**/



#ifndef _CALCULATEMAXDUTYTIMEFORPRRULE_H
#define _CALCULATEMAXDUTYTIMEFORPRRULE_H

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxDutyTimeForPRRuleParam.h"


class CalculateMaxDutyTimeForPRRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7300;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMaxDutyTimeForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxDutyTimeForPRRule::RuleFuncId, CalculateMaxDutyTimeForPRRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxDutyTimeForPRRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMaxDutyTimeForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty *duty, const CalculateMaxDutyTimeForPRRuleParam& ruleParam);

};

#endif //_CALCULATEMAXDUTYTIMEFORPRRULE_H
