/**
 * @file LimitTransportLengthForSQRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/

#ifndef _LIMITTRANSPORTLENGTHFORSQRULE_H_
#define _LIMITTRANSPORTLENGTHFORSQRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitTransportLengthForSQRuleParam.h"


class LimitTransportLengthForSQRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7464;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitTransportLengthForSQRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitTransportLengthForSQRule::RuleFuncId, LimitTransportLengthForSQRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitTransportLengthForSQRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitTransportLengthForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty* duty, const LimitTransportLengthForSQRuleParam& ruleParam) const;

	void ThrowRuleViolation(const int actTransportLength, const Segment* segment, const LimitTransportLengthForSQRuleParam& ruleParam) const;

	void ThrowRouteNotAllowedViolation(const Segment* segment, const LimitTransportLengthForSQRuleParam& ruleParam) const;

};

#endif //_LIMITTRANSPORTLENGTHFORSQRULE_H_
