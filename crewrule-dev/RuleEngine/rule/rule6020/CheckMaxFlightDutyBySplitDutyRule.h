/**
 * @file CheckMaxFlightDutyBySplitDutyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXFLIGHTDUTYBYSPLITDUTYRULE_H_
#define _CHECKMAXFLIGHTDUTYBYSPLITDUTYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyBySplitDutyRuleParam.h"


class CheckMaxFlightDutyBySplitDutyRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6020;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckMaxFlightDutyBySplitDutyRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxFlightDutyBySplitDutyRule::RuleFuncId, CheckMaxFlightDutyBySplitDutyRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxFlightDutyBySplitDutyRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<MaxFlightDutyBySplitDutyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam) const;

	void ThrowRuleViolationForMinFDPAfterTransit(const Duty* duty) const;

	void ThrowRuleViolationForMinRest(const Duty* duty) const;
};

#endif //_CHECKMAXFLIGHTDUTYBYSPLITDUTYRULE_H_
