/**
 * @file LimitMinRestLFESFlightForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LimitMinRestLFESFlightFORPRRULE_H_
#define _LimitMinRestLFESFlightFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMinRestLFESFlightForPRRuleParam.h"


class LimitMinRestLFESFlightForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7306;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMinRestLFESFlightForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMinRestLFESFlightForPRRule::RuleFuncId, LimitMinRestLFESFlightForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMinRestLFESFlightForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitMinRestLFESFlightForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMinRestLFESFlightForPRRuleParam& ruleParam) const;

private:

	void ThrowRuleViolation(const ROSTER* roster, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc, const int numberOfDuty, const LimitMinRestLFESFlightForPRRuleParam& ruleParam) const;

};

#endif //_LimitMinRestLFESFlightFORPRRULE_H_
