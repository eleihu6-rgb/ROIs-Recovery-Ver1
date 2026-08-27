/**
 * @file CheckMinRestBetweenConsecutiveDaysRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINRESTBETWEENCONSECUTIVEDAYSRULE_H_
#define _CHECKMINRESTBETWEENCONSECUTIVEDAYSRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinRestBetweenConsecutiveDaysRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"
#include "RDOHelper/Helper6001.h"

class CheckMinRestBetweenConsecutiveDaysRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6011;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckMinRestBetweenConsecutiveDaysRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestBetweenConsecutiveDaysRule::RuleFuncId, CheckMinRestBetweenConsecutiveDaysRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMinRestBetweenConsecutiveDaysRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    bool CheckRuleWithRDOPattern(const vector<SharedPtr<ROSTER>> &rosters,
                                 const std::bitset<Helper6001::RosterPeriodLength> &status,
                                 time_t windowStartLoc) const;
private:

	std::vector<CheckMinRestBetweenConsecutiveDaysRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

	int GetDaysBetweenRosters(const std::vector<const ROSTER*>& rosters, const size_t startIndex, const size_t endIndex, const CheckMinRestBetweenConsecutiveDaysRuleParam ruleParam) const;

    int GetDaysBetweenRostersWithRDOPattern(const vector<SharedPtr<ROSTER>> &rosters,
                                            const std::bitset<Helper6001::RosterPeriodLength> &status, size_t startIndex,
                                            size_t endIndex, const CheckMinRestBetweenConsecutiveDaysRuleParam &ruleParam,
                                            time_t windowStartLoc) const;
};




#endif //_CHECKMINRESTBETWEENCONSECUTIVEDAYSRULE_H_
