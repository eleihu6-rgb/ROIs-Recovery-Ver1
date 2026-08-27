#pragma once
#ifndef _CALCULATEMAXDPBYCOMPLEMENTFORPRRULE_H_
#define _CALCULATEMAXDPBYCOMPLEMENTFORPRRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxDPByComplementForPRRuleParam.h"

class CalculateMaxDPByComplementForPRRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7313;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMaxDPByComplementForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxDPByComplementForPRRule::RuleFuncId, CalculateMaxDPByComplementForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMaxDPByComplementForPRRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<CalculateMaxDPByComplementForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* duty, const CalculateMaxDPByComplementForPRRuleParam& ruleParam, const int dutyComposition);

	int GetMinComposition(const CalculateMaxDPByComplementForPRRuleParam& ruleParam);

	int GetDutyComposition(const Duty* duty);

};

#endif //_CALCULATEMAXDPBYCOMPLEMENTFORPRRULE_H_