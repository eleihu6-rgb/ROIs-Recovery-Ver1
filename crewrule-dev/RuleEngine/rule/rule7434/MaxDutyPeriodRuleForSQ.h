/**
 * @file MaxDutyPeriodRuleForSQ.h
 */

#ifndef _MAX_DUTY_PERIOD_RULE_FORSQ_H_
#define _MAX_DUTY_PERIOD_RULE_FORSQ_H_

#include <vector>
#include <string>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxDutyPeriodRuleForSQParam.h"

class MaxDutyPeriodRuleForSQ : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId =
        RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit MaxDutyPeriodRuleForSQ(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~MaxDutyPeriodRuleForSQ() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    std::vector<MaxDutyPeriodRuleForSQParam> _ruleParams;

    void ParseParam(const InputType& input);
    bool checkDuty(const Duty* duty) const;
    bool hasMatchingAssignmentAfterFDP(const Duty& duty, const std::vector<std::string>& assignments) const;
    bool hasFleetChange(const Duty& duty) const;
    bool hasFleetGroupChange(const Duty& duty) const;
    void throwViolation(const Duty* duty,
                        const MaxDutyPeriodRuleForSQParam& param,
                        int actualDutyMinutes,
                        int actualFdpMinutes) const;
};

#endif // _MAX_DUTY_PERIOD_RULE_H_
