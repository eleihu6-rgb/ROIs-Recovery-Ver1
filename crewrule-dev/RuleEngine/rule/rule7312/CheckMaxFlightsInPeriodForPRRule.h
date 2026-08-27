/**
 * @file CheckMaxFlightsInPeriodForPRRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CheckMaxFlightsInPeriodForPRRule_H_
#define _CheckMaxFlightsInPeriodForPRRule_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxFlightsInPeriodForPRRuleParam.h"


struct RosterProgramCourse;


class CheckMaxFlightsInPeriodForPRRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7312;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxFlightsInPeriodForPRRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxFlightsInPeriodForPRRule::RuleFuncId, CheckMaxFlightsInPeriodForPRRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxFlightsInPeriodForPRRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckMaxFlightsInPeriodForPRRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CheckMaxFlightsInPeriodForPRRule_H_
