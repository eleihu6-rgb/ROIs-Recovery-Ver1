/**
 * @file LimitInexpCrewForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITINEXPCREWFOREVAFDRULE_H_
#define _LIMITINEXPCREWFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitInexpCrewForEvaFdRuleParam.h"


class LimitInexpCrewForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7262;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitInexpCrewForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitInexpCrewForEvaFdRule::RuleFuncId, LimitInexpCrewForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitInexpCrewForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitInexpCrewForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitInexpCrewForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const ROSTER* roster, const Segment* segment, const LimitInexpCrewForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITINEXPCREWFOREVAFDRULE_H_
