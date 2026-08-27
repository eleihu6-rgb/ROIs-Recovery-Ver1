#pragma once
#ifndef _RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULE_H_
#define _RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULE_H_

#include <string>
#include <tuple>
#include <vector>
#include <utility>
#include <mutex>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestrictDhdAndPositionOnFreightForSQRuleParam.h"

struct ThroughFlightRoutes {
	std::string depStation;
	std::string arrStation;
	std::string flightNumber;
	std::vector<std::pair<const Segment*, const Segment*>> throughSegments; // pair of first leg and second leg of through flight
};

class RestrictDhdAndPositionOnFreightForSQRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7461;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit RestrictDhdAndPositionOnFreightForSQRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RestrictDhdAndPositionOnFreightForSQRule::RuleFuncId, RestrictDhdAndPositionOnFreightForSQRule::AvailableInterface) {
		ParseParam(input);
	}
	~RestrictDhdAndPositionOnFreightForSQRule() override = default;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const vector<Duty*>& duty) const;

private:
	std::vector<RestrictDhdAndPositionOnFreightForSQRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation(const Segment* segment, const std::string& violatingRoute, const Segment* passengerAlternative) const;

	bool CheckSingleDuty(const Duty* duty, const std::vector<std::string>& bases) const;

	bool CheckHomeBaseFlight(const Segment* seg, const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam) const;

	bool CheckOutsideFlight(const Segment* seg, const RestrictDhdAndPositionOnFreightForSQRuleParam& ruleParam) const;

	const std::vector<ThroughFlightRoutes>& _getThroughFlightRoutes() const;

	mutable std::once_flag _throughFlightRoutesOnce;
	mutable std::vector<ThroughFlightRoutes> _cachedThroughFlightRoutes;

};

#endif //_RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULE_H_
