/**
 * @file CalculateMinRestForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMINRESTFOREVAFDRULE_H_
#define _CALCULATEMINRESTFOREVAFDRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestForEvaFdRuleParam.h"


class CalculateMinRestForEvaFdRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7100;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestForEvaFdRule::RuleFuncId, CalculateMinRestForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestForEvaFdRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMinRestForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty *duty, const CalculateMinRestForEvaFdRuleParam& ruleParam);

	int GetDutyMinRest(const Duty* duty, const CalculateMinRestForEvaFdRuleParam& ruleParam) const;

	int GetFDPMinutesForMRT(const Duty* duty) const;
};

#endif //_CALCULATEMINRESTFOREVAFDRULE_H_
