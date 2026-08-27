/**
 * @file CheckMaxEarlyStartOrLateFinishWithinPeriodRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULE_H_
#define _CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam.h"


struct RosterProgramCourse;


class CheckMaxEarlyStartOrLateFinishWithinPeriodRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7263;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxEarlyStartOrLateFinishWithinPeriodRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxEarlyStartOrLateFinishWithinPeriodRule::RuleFuncId, CheckMaxEarlyStartOrLateFinishWithinPeriodRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxEarlyStartOrLateFinishWithinPeriodRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam> _ruleParams;


    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULE_H_
