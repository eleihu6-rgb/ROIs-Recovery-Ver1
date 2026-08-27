#pragma once
#ifndef _CHECKMINRESTRULE_H_
#define _CHECKMINRESTRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestRuleParam.h"


class CheckMinRestRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7007;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMinRestRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestRule::RuleFuncId, CheckMinRestRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMinRestRule() override = default;

	bool CheckRule(vector<SharedPtr<ROSTER>>& rosters) const;

private:

	std::vector<MinRestRuleParam> _ruleParams;

	void ParseParam(const InputType& input);


	void ThrowRuleViolation() const;
};

#endif //_CHECKMINRESTRULE_H_
