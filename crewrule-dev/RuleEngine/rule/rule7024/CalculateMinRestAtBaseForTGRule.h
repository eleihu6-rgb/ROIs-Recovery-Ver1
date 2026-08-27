/**
 * @file CalculateMinRestAtBaseForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-31
**/



#ifndef _CALCULATEMINRESTATBASEFORTGRULE_H_
#define _CALCULATEMINRESTATBASEFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestAtBaseForTGRuleParam.h"


class CalculateMinRestAtBaseForTGRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7024;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestAtBaseForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestAtBaseForTGRule::RuleFuncId, CalculateMinRestAtBaseForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestAtBaseForTGRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MinRestAtBaseForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CalculateDuty(Duty* lastDuty, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const;
};

#endif //_CALCULATEMINRESTATBASEFORTGRULE_H_
