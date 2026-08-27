#pragma once
#ifndef _CALCULATEMINRESTBYBLOCKTIMEFORPRRULE_H_
#define _CALCULATEMINRESTBYBLOCKTIMEFORPRRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestByBlockTimeForPRRuleParam.h"

class CalculateMinRestByBlockTimeForPRRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7311;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestByBlockTimeForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestByBlockTimeForPRRule::RuleFuncId, CalculateMinRestByBlockTimeForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMinRestByBlockTimeForPRRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<CalculateMinRestByBlockTimeForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap);

	bool CalculateDuty(Duty* duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam);

};

#endif //_CALCULATEMINRESTBYBLOCKTIMEFORPRRULE_H_