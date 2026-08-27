/**
 * @file CheckNightRestPeriodForEvaRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#ifndef _checknightrestperiodforevarule_h_
#define _checknightrestperiodforevarule_h_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckNightRestPeriodForEvaRuleParam.h"


class CheckNightRestPeriodForEvaRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7213;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckNightRestPeriodForEvaRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckNightRestPeriodForEvaRule::RuleFuncId, CheckNightRestPeriodForEvaRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckNightRestPeriodForEvaRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    bool CheckRule(const Pairing* pairing) const override;

private:

    std::vector<CheckNightRestPeriodForEvaRuleParam> _ruleParams;

    bool CheckRule(const std::vector<Duty*> duties, const CheckNightRestPeriodForEvaRuleParam rulePara) const;

    void ThrowRuleViolation() const;

    void ParseParam(const InputType& input);

};

#endif //_checknightrestperiodforevarule_h_
