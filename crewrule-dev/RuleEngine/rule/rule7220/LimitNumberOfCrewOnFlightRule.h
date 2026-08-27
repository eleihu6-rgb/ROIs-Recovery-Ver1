/**
 * @file LimitNumberOfCrewOnFlightRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITNUMBEROFCREWONFLIGHTRULE_H_
#define _LIMITNUMBEROFCREWONFLIGHTRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitNumberOfCrewOnFlightRuleParam.h"


class LimitNumberOfCrewOnFlightRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7220;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitNumberOfCrewOnFlightRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitNumberOfCrewOnFlightRule::RuleFuncId, LimitNumberOfCrewOnFlightRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitNumberOfCrewOnFlightRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitNumberOfCrewOnFlightRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitNumberOfCrewOnFlightRuleParam& ruleParam) const;

	void ThrowRuleViolation(const ROSTER* roster, const Segment* segment, const LimitNumberOfCrewOnFlightRuleParam& ruleParam) const;

};

#endif //_LIMITNUMBEROFCREWONFLIGHTRULE_H_
