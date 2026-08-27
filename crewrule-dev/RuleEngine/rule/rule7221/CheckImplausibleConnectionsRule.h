/**
 * @file CheckImplausibleConnectionsRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-11-19
**/



#ifndef _CHECKIMPLAUSIBLECONNECTIONSRULE_H_
#define _CHECKIMPLAUSIBLECONNECTIONSRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckImplausibleConnectionsRuleParam.h"


class CheckImplausibleConnectionsRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7221;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckImplausibleConnectionsRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckImplausibleConnectionsRule::RuleFuncId, CheckImplausibleConnectionsRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckImplausibleConnectionsRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    //TransitAndLayoverRuleParam聚合其他参数对象
    std::unique_ptr<CheckImplausibleConnectionsRuleParam> _ruleParam{ nullptr };

    void ThrowRuleViolationForRoster(const ROSTER* roster, const long long segmentId, const string arr, const string dep) const;

    void ThrowRuleViolation(const Pairing* pairing, const long long segmentId, const string arr, const string dep) const;

    void ParseParam(const InputType& input);
};

#endif //_CheckImplausibleConnectionsRule_H_
