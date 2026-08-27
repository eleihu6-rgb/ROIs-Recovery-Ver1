/**
 * @file LimitDepOrArrStationForPairingRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-19
**/

#ifndef _LIMITDEPORARRSTATIONFORPAIRINGRULE_H_
#define _LIMITDEPORARRSTATIONFORPAIRINGRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitDepOrArrStationForPairingRuleParam.h"


class LimitDepOrArrStationForPairingRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 3003;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitDepOrArrStationForPairingRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitDepOrArrStationForPairingRule::RuleFuncId, LimitDepOrArrStationForPairingRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitDepOrArrStationForPairingRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

private:

	std::vector<LimitDepOrArrStationForPairingRuleParam> _ruleParams;

	void ParseParam(const InputType& input);


	bool CheckRule(const Pairing* pairing, const LimitDepOrArrStationForPairingRuleParam& ruleParam) const;

	void ThrowRuleViolation(const Pairing* pairing, const LimitDepOrArrStationForPairingRuleParam& ruleParam) const;

};

#endif //_LIMITDEPORARRSTATIONFORPAIRINGRULE_H_
