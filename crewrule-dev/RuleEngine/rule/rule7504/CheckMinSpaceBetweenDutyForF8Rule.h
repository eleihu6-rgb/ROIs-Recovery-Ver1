/**
 * @file CheckMinSpaceBetweenDutyForF8Rule.h
 * @brief Min rest between duties for Flair (F8), mirrored from 7323 (PR).
**/

#ifndef _CHECKMINSPACEBETWEENDUTYFORF8RULE_H_
#define _CHECKMINSPACEBETWEENDUTYFORF8RULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinSpaceBetweenDutyForF8RuleParam.h"


struct RosterProgramCourse;


class CheckMinSpaceBetweenDutyForF8Rule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7504;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinSpaceBetweenDutyForF8Rule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMinSpaceBetweenDutyForF8Rule::RuleFuncId, CheckMinSpaceBetweenDutyForF8Rule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinSpaceBetweenDutyForF8Rule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
    bool CheckRule(const Pairing* pairing) const override;


private:

    std::vector<CheckMinSpaceBetweenDutyForF8RuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKMINSPACEBETWEENDUTYFORF8RULE_H_
