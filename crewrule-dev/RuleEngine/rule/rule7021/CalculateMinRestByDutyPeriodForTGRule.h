/**
 * @file CalculateMinRestByDutyPeriodForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/



#ifndef _CALCULATEMINRESTBYDUTYPERIODFORTGRULE_H_
#define _CALCULATEMINRESTBYDUTYPERIODFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestByDutyPeriodForTGRuleParam.h"


class CalculateMinRestByDutyPeriodForTGRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7021;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestByDutyPeriodForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestByDutyPeriodForTGRule::RuleFuncId, CalculateMinRestByDutyPeriodForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestByDutyPeriodForTGRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMinRestByDutyPeriodForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties, const ROSTER* roster, const string& base);

	bool CalculateDuty(Duty *duty, const ROSTER* roster, const string& base, const CalculateMinRestByDutyPeriodForTGRuleParam& ruleParam);
};

#endif //_CALCULATEMINRESTBYDUTYPERIODFORTGRULE_H_
