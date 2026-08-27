/**
 * @file CheckAssignmentOverlappableRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CheckAssignmentOverlappableRule_H_
#define _CheckAssignmentOverlappableRule_H_

#include <memory>
#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckAssignmentOverlappableRuleParam.h"

class CheckAssignmentOverlappableRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6121;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckAssignmentOverlappableRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckAssignmentOverlappableRule::RuleFuncId, CheckAssignmentOverlappableRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckAssignmentOverlappableRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::unique_ptr<CheckAssignmentOverlappableRuleParam> _ruleParam;

	void ParseParam(const InputType& input);	

	void ThrowRuleViolation() const;
};





#endif //_CheckAssignmentOverlappableRule_H_
