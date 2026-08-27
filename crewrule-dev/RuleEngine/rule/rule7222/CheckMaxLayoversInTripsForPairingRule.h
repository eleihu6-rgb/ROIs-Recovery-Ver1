/**
 * @file CheckMaxLayoversInTripsForPairingRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/



#ifndef _CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULE_H_
#define _CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxLayoversInTripsForPairingRuleParam.h"


class CheckMaxLayoversInTripsForPairingRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7222;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckMaxLayoversInTripsForPairingRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxLayoversInTripsForPairingRule::RuleFuncId, CheckMaxLayoversInTripsForPairingRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckMaxLayoversInTripsForPairingRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

private:

    std::vector<CheckMaxLayoversInTripsForPairingRuleParam> _ruleParams;

    void ThrowRuleViolation(const Pairing* pairing) const;

    void ParseParam(const InputType& input);
};

#endif //_CHECKMAXLAYOVERSINTRIPSFORPAIRINGRULE_H_
