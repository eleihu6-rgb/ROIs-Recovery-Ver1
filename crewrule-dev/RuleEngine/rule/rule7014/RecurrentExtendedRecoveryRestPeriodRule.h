#pragma once
#ifndef _RECURRENTEXTENDEDRECOVERYRESTPERIODRULE_H_
#define _RECURRENTEXTENDEDRECOVERYRESTPERIODRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RecurrentExtendedRecoveryRestPeriodRuleParam.h"

class RestPeriod;

class RecurrentExtendedRecoveryRestPeriodRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7014;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit RecurrentExtendedRecoveryRestPeriodRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RecurrentExtendedRecoveryRestPeriodRule::RuleFuncId, RecurrentExtendedRecoveryRestPeriodRule::AvailableInterface) {
		ParseParam(input);
	}
	~RecurrentExtendedRecoveryRestPeriodRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<RecurrentExtendedRecoveryRestPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};

#endif //_RECURRENTEXTENDEDRECOVERYRESTPERIODRULE_H_
