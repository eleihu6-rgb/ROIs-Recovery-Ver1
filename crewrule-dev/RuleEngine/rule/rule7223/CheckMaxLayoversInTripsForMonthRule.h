/**
 * @file CheckMaxLayoversInTripsForMonthRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/



#ifndef _CHECKMAXLAYOVERSINTRIPSFORMONTHRULE_H_
#define _CHECKMAXLAYOVERSINTRIPSFORMONTHRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxLayoversInTripsForMonthRuleParam.h"


class CheckMaxLayoversInTripsForMonthRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7223;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxLayoversInTripsForMonthRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxLayoversInTripsForMonthRule::RuleFuncId, CheckMaxLayoversInTripsForMonthRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckMaxLayoversInTripsForMonthRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckMaxLayoversInTripsForMonthRuleParam> _ruleParams;

    void ThrowRuleViolation() const;

    void ParseParam(const InputType& input);
};

#endif //_CHECKMAXLAYOVERSINTRIPSFORMONTHRULE_H_
