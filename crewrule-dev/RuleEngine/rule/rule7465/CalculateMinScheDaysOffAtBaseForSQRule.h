/**
 * @file CalculateMinScheDaysOffAtBaseForSQRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/



#ifndef _CALCULATEMINSCHEDAYSOFFATBASEFORSQRULE_H_
#define _CALCULATEMINSCHEDAYSOFFATBASEFORSQRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinScheDaysOffAtBaseForSQRuleParam.h"


class CalculateMinScheDaysOffAtBaseForSQRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7465;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinScheDaysOffAtBaseForSQRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinScheDaysOffAtBaseForSQRule::RuleFuncId, CalculateMinScheDaysOffAtBaseForSQRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinScheDaysOffAtBaseForSQRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MinScheDaysOffAtBaseForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CalculateDuty(Pairing* pairing, const MinScheDaysOffAtBaseForSQRuleParam& ruleParam);

};

#endif //_CALCULATEMINSCHEDAYSOFFATBASEFORSQRULE_H_
