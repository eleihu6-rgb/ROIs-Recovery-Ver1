/**
 * @file CheckConsecutiveDaysOffRequirementFor5JRule.h
 * @brief Rule 7366 - Check consecutive days off requirement
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-04-16
**/

#ifndef _CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULE_H_
#define _CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckConsecutiveDaysOffRequirementFor5JRuleParam.h"

class CheckConsecutiveDaysOffRequirementFor5JRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7366;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckConsecutiveDaysOffRequirementFor5JRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckConsecutiveDaysOffRequirementFor5JRule::RuleFuncId, CheckConsecutiveDaysOffRequirementFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckConsecutiveDaysOffRequirementFor5JRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    // Get all days off within a period (using local calendar days)
    std::bitset<31> GetDaysOffInPeriod(const std::vector<const ROSTER*>& rosters,
                                        const CheckConsecutiveDaysOffRequirementFor5JRuleParam& ruleParam,
                                        time_t periodStartUtc, time_t periodEndUtc,
                                        int crewBaseOffsetMinutes) const;

    // Check if a day is a valid day off based on the rule parameters
    bool IsValidDayOff(const ROSTER* roster, const CheckConsecutiveDaysOffRequirementFor5JRuleParam& ruleParam, int dayOffset) const;

    // Count consecutive days off sets
    int CountConsecutiveDaysOffSets(const std::bitset<31>& daysOff, int requiredConsecutiveDays, bool canCombine) const;

    // Get period boundaries based on Check Period Mode
    void GetPeriodBoundaries(const std::vector<const ROSTER*>& rosters,
                             const CheckConsecutiveDaysOffRequirementFor5JRuleParam& ruleParam,
                             std::vector<std::pair<time_t, time_t>>& periods,
                             int crewBaseOffsetMinutes) const;

    std::vector<CheckConsecutiveDaysOffRequirementFor5JRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const std::string& errorMsg, time_t startUtc, time_t endUtc, const std::string& crewId, int rosterId) const;
};

#endif //_CHECKCONSECUTIVEDAYSOFFREQUIREMENTFOR5JRULE_H_
