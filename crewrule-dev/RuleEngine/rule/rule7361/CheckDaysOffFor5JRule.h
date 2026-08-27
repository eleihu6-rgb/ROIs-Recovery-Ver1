/**
 * @file CheckDaysOffFor5JRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/



#ifndef _CHECKDAYSOFFFOR5JRULE_H_
#define _CHECKDAYSOFFFOR5JRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckDaysOffFor5JRuleParam.h"

class CheckDaysOffFor5JRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7361;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckDaysOffFor5JRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckDaysOffFor5JRule::RuleFuncId, CheckDaysOffFor5JRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckDaysOffFor5JRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckDaysOffFor5JRuleParam> _ruleParams;

	bool CheckDaysOffByStartAndEnd(const std::vector<const ROSTER*>& rosters, const time_t checkStart, const time_t checkEnd, const string base, const CheckDaysOffFor5JRuleParam ruleParam) const;

	int GetActualDaysOffByRestPeriods(const std::vector<std::unique_ptr<RestPeriod>>& restPeriods,
		const time_t checkStart,
		const time_t checkEnd) const;

	void ThrowRuleViolation() const;

	void ParseParam(const InputType& input);

};

#endif //_CHECKDAYSOFFFOR5JRULE_H_
