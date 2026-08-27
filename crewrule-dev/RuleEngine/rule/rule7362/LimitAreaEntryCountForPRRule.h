/**
 * @file LimitAreaEntryCountForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-11
**/

#ifndef _LIMITAREAENTRYCOUNTFORPRRULE_H_
#define _LIMITAREAENTRYCOUNTFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitAreaEntryCountForPRRuleParam.h"

class LimitAreaEntryCountForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7362;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitAreaEntryCountForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitAreaEntryCountForPRRule::RuleFuncId, LimitAreaEntryCountForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitAreaEntryCountForPRRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitAreaEntryCountForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);
	
	bool CheckRule(const vector<Segment*>& segments, const string& base, const LimitAreaEntryCountForPRRuleParam& ruleParam) const;

private:

	void ThrowRuleViolation(const Segment* firstSegment, const Segment* lastSegment, const int actualEntryTimes, const LimitAreaEntryCountForPRRuleParam& ruleParam) const;

};

#endif //_LIMITAREAENTRYCOUNTFORPRRULE_H_
