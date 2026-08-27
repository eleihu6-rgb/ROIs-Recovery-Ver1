#pragma once
#ifndef _CHECKCREWCOUNTRYLIMITATIONRULE_H_
#define _CHECKCREWCOUNTRYLIMITATIONRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckCrewCountryLimitationRuleParam.h"

class CheckCrewCountryLimitationRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7011;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckCrewCountryLimitationRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCrewCountryLimitationRule::RuleFuncId, CheckCrewCountryLimitationRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckCrewCountryLimitationRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRuleForPairing(SharedPtr<CREW> crew, Pairing* pairing);

private:

	std::vector<CheckCrewCountryLimitationRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};

#endif //_CHECKCREWCOUNTRYLIMITATIONRULE_H_
