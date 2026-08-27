/**
 * @file CalculateCheckInMinRestForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATECHECKINMINRESTFOREVAFDRULE_H_
#define _CALCULATECHECKINMINRESTFOREVAFDRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinRestForEvaFdRuleParam.h"


class CalculateCheckInMinRestForEvaFdRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7200;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateCheckInMinRestForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateCheckInMinRestForEvaFdRule::RuleFuncId, CalculateCheckInMinRestForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateCheckInMinRestForEvaFdRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CheckMinRestForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty *duty, const CheckMinRestForEvaFdRuleParam& ruleParam);

	int GetDutyMinRest(const Duty* duty, const CheckMinRestForEvaFdRuleParam& ruleParam) const;

	int GetFDPMinutesForMRT(const Duty* duty) const;
};

#endif //_CALCULATECHECKINMINRESTFOREVAFDRULE_H_
