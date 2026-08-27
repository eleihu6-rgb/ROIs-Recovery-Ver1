/**
 * @file CheckMinSpaceBetweenDutyForRPRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINSPACEBETWEENDUTYFORRPRULE_H_
#define _CHECKMINSPACEBETWEENDUTYFORRPRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinSpaceBetweenDutyForRPRuleParam.h"


struct RosterProgramCourse;


class CheckMinSpaceBetweenDutyForRPRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7323;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinSpaceBetweenDutyForRPRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMinSpaceBetweenDutyForRPRule::RuleFuncId, CheckMinSpaceBetweenDutyForRPRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinSpaceBetweenDutyForRPRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
    bool CheckRule(const Pairing* pairing) const override;


private:

    std::vector<CheckMinSpaceBetweenDutyForRPRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKMINSPACEBETWEENDUTYFORRPRULE_H_
