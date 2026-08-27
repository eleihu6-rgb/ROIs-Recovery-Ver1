/**
 * @file CheckMaxConsecutiveDutyRuleForIt.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXCONSECUTIVEDUTYRULEFORIT_H_
#define _CHECKMAXCONSECUTIVEDUTYRULEFORIT_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxConsecutiveDutyRuleParamForIt.h"
#include "../period/SlideListener.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;
class CumulativeFtLimitSlideListener;

class CheckMaxConsecutiveDutyRuleForIt : public BasicRule {
	friend class CumulativeFtLimitSlideListener;
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7202;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckMaxConsecutiveDutyRuleForIt(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxConsecutiveDutyRuleForIt::RuleFuncId, CheckMaxConsecutiveDutyRuleForIt::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxConsecutiveDutyRuleForIt() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckMaxConsecutiveDutyRuleParamForIt> _ruleParams;

	bool CheckConsecutive(const std::vector<Duty*>& dutys, int offsetMinutes, const CheckMaxConsecutiveDutyRuleParamForIt& ruleParam) const;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};

#endif //_CHECKMAXCONSECUTIVEDUTYRULEFORIT_H_
