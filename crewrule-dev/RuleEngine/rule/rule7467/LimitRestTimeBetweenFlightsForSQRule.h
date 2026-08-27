/**
 * @file LimitRestTimeBetweenFlightsForSQRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-07
**/

#ifndef _LimitRestTimeBetweenFlightsFORSQRULE_H_
#define _LimitRestTimeBetweenFlightsFORSQRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitRestTimeBetweenFlightsForSQRuleParam.h"


class LimitRestTimeBetweenFlightsForSQRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7467;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitRestTimeBetweenFlightsForSQRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitRestTimeBetweenFlightsForSQRule::RuleFuncId, LimitRestTimeBetweenFlightsForSQRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitRestTimeBetweenFlightsForSQRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitRestTimeBetweenFlightsForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Segment* prevSegment, const Segment* currSegment, const Segment* nextSegment, const LimitRestTimeBetweenFlightsForSQRuleParam& ruleParam) const;

	void ThrowRuleViolation(const time_t restStartTimeUtc, const time_t restEndTimeUtc, const int actRestMinutes, const Segment* prevSegment, const Segment* currSegment, const Segment* nextSegment, const LimitRestTimeBetweenFlightsForSQRuleParam& ruleParam) const;

};

#endif //_LimitRestTimeBetweenFlightsFORSQRULE_H_
