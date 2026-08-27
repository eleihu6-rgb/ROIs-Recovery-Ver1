/**
 * @file LimitFleetSectorByQaulificationForHXRule.h
 * @brief
**/

#ifndef _LIMITFLEETSECTORBYQAULIFICATIONFORHXRULE_H_
#define _LIMITFLEETSECTORBYQAULIFICATIONFORHXRULE_H_

#include <string>
#include <unordered_map>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitFleetSectorByQaulificationForHXRuleParam.h"

class LimitFleetSectorByQaulificationForHXRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7494;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitFleetSectorByQaulificationForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitFleetSectorByQaulificationForHXRule::RuleFuncId, LimitFleetSectorByQaulificationForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitFleetSectorByQaulificationForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<LimitFleetSectorByQaulificationForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);
	std::unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> GetMandayMap(const std::shared_ptr<CREW>& crew) const;
	int CountMatchedFleetSectorsInRange(const std::unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& mandayMap,
		time_t startUtc, time_t endUtc, const LimitFleetSectorByQaulificationForHXRuleParam& ruleParam) const;
	void ThrowRuleViolation(std::shared_ptr<CREW> crew,
		const std::string& qualification,
		const time_t windowStartUtc,
		const time_t windowEndUtc,
		const int sectorsInWindow,
		const LimitFleetSectorByQaulificationForHXRuleParam& ruleParam) const;
};

#endif //_LIMITFLEETSECTORBYQAULIFICATIONFORHXRULE_H_
