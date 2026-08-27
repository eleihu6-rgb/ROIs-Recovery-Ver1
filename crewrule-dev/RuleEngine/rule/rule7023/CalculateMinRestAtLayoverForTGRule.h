/**
 * @file CalculateMinRestAtLayoverForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/



#ifndef _CALCULATEMINRESTATLAYOVERFORTGRULE_H_
#define _CALCULATEMINRESTATLAYOVERFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestAtLayoverForTGRuleParam.h"


class CalculateMinRestAtLayoverForTGRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7023;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestAtLayoverForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestAtLayoverForTGRule::RuleFuncId, CalculateMinRestAtLayoverForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestAtLayoverForTGRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMinRestAtLayoverForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties, const string& base);

	bool CalculateDuty(Duty *duty, const string& base, const CalculateMinRestAtLayoverForTGRuleParam& ruleParam);
};

#endif //_CALCULATEMINRESTATLAYOVERFORTGRULE_H_
