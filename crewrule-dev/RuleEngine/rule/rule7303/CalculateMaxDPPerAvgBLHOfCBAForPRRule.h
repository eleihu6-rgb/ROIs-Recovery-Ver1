/**
 * @file CalculateMaxDPPerAvgBLHOfCBAForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-27
**/



#ifndef _CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULE_H
#define _CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULE_H

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam.h"


class CalculateMaxDPPerAvgBLHOfCBAForPRRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7303;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMaxDPPerAvgBLHOfCBAForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxDPPerAvgBLHOfCBAForPRRule::RuleFuncId, CalculateMaxDPPerAvgBLHOfCBAForPRRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxDPPerAvgBLHOfCBAForPRRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty *duty, const std::string& base, const CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam& ruleParam);

};

#endif //_CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULE_H
