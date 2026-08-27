/**
 * @file CalculateRestDiscretionRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATERESTDISCRETIONRULE_H_
#define _CALCULATERESTDISCRETIONRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestDiscretionRuleParam.h"


class CalculateRestDiscretionRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6111;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateRestDiscretionRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateRestDiscretionRule::RuleFuncId, CalculateRestDiscretionRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateRestDiscretionRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;


private:

    std::vector<RestDiscretionRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* currDuty, Duty* nextDuty, const RestDiscretionRuleParam& ruleParam, const std::string& base);

};

#endif //_CALCULATERESTDISCRETIONRULE_H_
