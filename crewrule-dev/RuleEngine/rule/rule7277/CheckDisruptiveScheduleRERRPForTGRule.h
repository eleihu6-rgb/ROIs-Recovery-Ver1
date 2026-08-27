/**
 * @file CheckDisruptiveScheduleRERRPForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKDISRUPTIVESCHEDULERERRPFORTGRULE_H_
#define _CHECKDISRUPTIVESCHEDULERERRPFORTGRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckDisruptiveScheduleRERRPForTGRuleParam.h"


struct RosterProgramCourse;


class CheckDisruptiveScheduleRERRPForTGRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7277;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckDisruptiveScheduleRERRPForTGRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckDisruptiveScheduleRERRPForTGRule::RuleFuncId, CheckDisruptiveScheduleRERRPForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckDisruptiveScheduleRERRPForTGRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckDisruptiveScheduleRERRPForTGRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};
#endif // _CHECKDISRUPTIVESCHEDULERERRPFORTGRULE_H_