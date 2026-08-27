/**
 * @file CheckInexperiencedCrewFor5JRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKINEXPERIENCEDCREWFOR5JRULE_H_
#define _CHECKINEXPERIENCEDCREWFOR5JRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckInexperiencedCrewFor5JRuleParam.h"


class CheckInexperiencedCrewFor5JRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7364;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckInexperiencedCrewFor5JRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckInexperiencedCrewFor5JRule::RuleFuncId, CheckInexperiencedCrewFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckInexperiencedCrewFor5JRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckInexperiencedCrewFor5JRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const Segment* segment) const;

};


#endif //_CHECKINEXPERIENCEDCREWFOR5JRULE_H_
