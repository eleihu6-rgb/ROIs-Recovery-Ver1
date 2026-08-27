#pragma once
#ifndef _CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULE_H_
#define _CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckAllowedMultiSectorDutyForFreighterForSQRuleParam.h"

class CheckAllowedMultiSectorDutyForFreighterForSQRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7462;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckAllowedMultiSectorDutyForFreighterForSQRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckAllowedMultiSectorDutyForFreighterForSQRule::RuleFuncId, CheckAllowedMultiSectorDutyForFreighterForSQRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckAllowedMultiSectorDutyForFreighterForSQRule() override = default;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const Pairing* pairing) const override;

private:
	std::vector<CheckAllowedMultiSectorDutyForFreighterForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation(const Duty* duty) const;


};

#endif //_CHECKALLOWEDMULTISECTORDUTYFORFREIGHTERFORSQRULE_H_
