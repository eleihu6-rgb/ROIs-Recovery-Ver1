/**
 * @file CheckLayoverRestrictionRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKLAYOVERRESTRICTIONRULE_H_
#define _CHECKLAYOVERRESTRICTIONRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckLayoverRestrictionRuleParam.h"


class CheckLayoverRestrictionRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7227;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing || RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckLayoverRestrictionRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckLayoverRestrictionRule::RuleFuncId, CheckLayoverRestrictionRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckLayoverRestrictionRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const vector<Segment*> segments) const;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    std::vector<CheckLayoverRestrictionRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const Segment* segment,
                            const CheckLayoverRestrictionRuleParam& ruleParam,
                            bool useDepStation,
                            bool layoverRequired) const;
};

#endif //_CHECKLAYOVERRESTRICTIONRULE_H_
