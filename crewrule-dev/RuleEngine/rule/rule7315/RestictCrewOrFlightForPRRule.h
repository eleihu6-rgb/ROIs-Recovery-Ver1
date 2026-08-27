/**
 * @file RestictCrewOrFlightForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-09-04
**/

#ifndef _RESTICTCREWORFLIGHTFORPRRULE_H_
#define _RESTICTCREWORFLIGHTFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestictCrewOrFlightForPRRuleParam.h"

class RestictCrewOrFlightForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7315;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit RestictCrewOrFlightForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RestictCrewOrFlightForPRRule::RuleFuncId, RestictCrewOrFlightForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~RestictCrewOrFlightForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<RestictCrewOrFlightForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const RestictCrewOrFlightForPRRuleParam& ruleParam) const;

private:

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const RestictCrewOrFlightForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const RestictCrewOrFlightForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const RestictCrewOrFlightForPRRuleParam& ruleParam) const;

};

#endif //_RESTICTCREWORFLIGHTFORPRRULE_H_
