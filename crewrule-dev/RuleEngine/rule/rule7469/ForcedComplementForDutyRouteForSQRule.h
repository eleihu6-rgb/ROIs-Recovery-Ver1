/**
 * @file ForcedComplementForDutyRouteForSQRule.h
 */
#pragma once
#ifndef _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULE_H_
#define _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "ForcedComplementForDutyRouteForSQRuleParam.h"

class ForcedComplementForDutyRouteForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7469;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit ForcedComplementForDutyRouteForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, ForcedComplementForDutyRouteForSQRule::RuleFuncId,
                    ForcedComplementForDutyRouteForSQRule::AvailableInterface) {
        ParseParam(input);
    }
    ~ForcedComplementForDutyRouteForSQRule() override = default;

    bool CheckRule(const Duty* duty) const override;
    bool CheckRule(const Pairing* pairing) const override;

private:
    std::vector<ForcedComplementForDutyRouteForSQRuleParam> _ruleParams;

    void ParseParam(const InputType& input);
    void ThrowRuleViolation(const Duty* duty,
                            const ForcedComplementForDutyRouteForSQRuleParam& param,
                            const std::string& route,
                            bool compositionOk,
                            bool rankPlanOk) const;
    std::string ResolveDutyComposition(const Duty* duty) const;
};

#endif  // _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULE_H_
