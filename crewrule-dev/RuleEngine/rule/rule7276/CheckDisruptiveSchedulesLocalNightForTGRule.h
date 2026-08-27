/**
 * @file CheckDisruptiveSchedulesLocalNightForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULE_H_
#define _CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckDisruptiveSchedulesLocalNightForTGRuleParam.h"


struct RosterProgramCourse;


class CheckDisruptiveSchedulesLocalNightForTGRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7276;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckDisruptiveSchedulesLocalNightForTGRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckDisruptiveSchedulesLocalNightForTGRule::RuleFuncId, CheckDisruptiveSchedulesLocalNightForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckDisruptiveSchedulesLocalNightForTGRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckDisruptiveSchedulesLocalNightForTGRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULE_H_
